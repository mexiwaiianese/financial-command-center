import json
import asyncio
import subprocess
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from app.services.importer import import_budget_from_upload, import_transactions_from_uploads
from app.services.reconciliation import reconcile_card_payments
from app.services.budget_mapping import apply_category_to_similar, apply_natural_language_rule, assign_budget_categories, clear_user_rules, ensure_recommended_categories, export_user_rules, identified_categories, preview_category_matches, restore_user_rules
from app.services.receipts import analyze_receipt
from app.services.projects import assign_project_to_similar, create_project, default_projects, project_analysis
from app.services.planning import create_asset, create_goal, portfolio_analysis
from app.services.analytics import build_budget_analysis, build_dashboard
from app.integrations.teller import (
    connection_status,
    load_transactions,
    register_enrollment,
    should_sync_this_weekend,
    sync_transactions,
)

app = FastAPI(title="Financial Command Center API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

TRANSACTIONS = []
BUDGET = identified_categories()
PROJECTS = default_projects()
TAGS = []
ASSETS = []
GOALS = []
INSTITUTIONS = {}
IDENTIFIED_PROVIDERS = {
    "AFCU":{"name":"AFCU","provider_type":"credit_union"},
    "AMEX":{"name":"AMEX","provider_type":"credit_card"},
    "Checking":{"name":"Checking","provider_type":"bank"},
    "PNC":{"name":"PNC","provider_type":"bank"},
    "Capital One":{"name":"Capital One","provider_type":"credit_card"},
    "Bank of America":{"name":"Bank of America","provider_type":"bank"},
}

@app.on_event("startup")
async def startup_sync():
    global TRANSACTIONS
    TRANSACTIONS = load_transactions()
    if should_sync_this_weekend() and connection_status()["connected_institutions"]:
        async def run_weekend_sync():
            global TRANSACTIONS
            try:
                result = await sync_transactions()
                TRANSACTIONS = result["transactions"]
            except Exception as error:
                print(f"Weekend Teller sync failed: {error}")
        asyncio.create_task(run_weekend_sync())

@app.get("/")
def root():
    return {"name": "Financial Command Center", "status": "running"}

@app.post("/api/import")
async def import_files(files: list[UploadFile] = File(...)):
    global TRANSACTIONS
    try:
        imported = await import_transactions_from_uploads(files)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    combined = TRANSACTIONS + imported
    unique = {}
    for transaction in combined:
        key = (
            transaction.get("source_account", "Unknown"),
            transaction.get("date"),
            str(transaction.get("description", "")).strip().lower(),
            round(float(transaction.get("amount", 0)), 2),
        )
        unique[key] = transaction
    TRANSACTIONS = sorted(unique.values(), key=lambda row: row["date"], reverse=True)
    for transaction in TRANSACTIONS:
        if transaction.get("is_adu_related") and not transaction.get("project_id"):
            transaction["project_id"] = "adu"
    reconciliation = reconcile_card_payments(TRANSACTIONS, BUDGET)
    mapping = assign_budget_categories(TRANSACTIONS, BUDGET)
    return {
        "imported_transactions": len(TRANSACTIONS),
        "reconciliation": reconciliation,
        "budget_mapping": mapping,
        "sample": TRANSACTIONS[:5],
    }

@app.post("/api/budget")
async def import_budget(file: UploadFile = File(...)):
    global BUDGET
    try:
        BUDGET = await import_budget_from_upload(file)
        ensure_recommended_categories(BUDGET)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    reconciliation = reconcile_card_payments(TRANSACTIONS, BUDGET)
    mapping = assign_budget_categories(TRANSACTIONS, BUDGET)
    return {
        "imported_categories": len(BUDGET),
        "reconciliation": reconciliation,
        "budget_mapping": mapping,
        "budget": BUDGET,
    }

@app.get("/api/reconciliation")
def reconciliation_status():
    return reconcile_card_payments(TRANSACTIONS, BUDGET)

@app.patch("/api/transactions/{transaction_id}")
def update_transaction_category(transaction_id: str, payload: dict):
    transaction = next((row for row in TRANSACTIONS if row.get("id") == transaction_id), None)
    if transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    if "category" in payload:
        transaction["manual_budget_category"] = str(payload.get("category", "")).strip() or None
        transaction["manual_budget_parent_category"] = str(payload.get("parent_category", "")).strip() or None
    if "secondary_categories" in payload:
        transaction["secondary_categories"] = [str(value).strip() for value in payload.get("secondary_categories", []) if str(value).strip()]
    if "user_note" in payload:
        transaction["user_note"] = str(payload.get("user_note", "")).strip()
        transaction["note_mentions"] = [str(value).strip() for value in payload.get("note_mentions", []) if str(value).strip()]
    if "project_id" in payload:
        project_id = str(payload.get("project_id", "")).strip() or None
        if project_id and not any(project["id"] == project_id for project in PROJECTS):
            raise HTTPException(status_code=400, detail="Project not found.")
        transaction["project_id"] = project_id
        if project_id:
            project = next(project for project in PROJECTS if project["id"] == project_id)
            project_category = f"Project: {project['name']}"
            if not any(row.get("category") == project_category for row in BUDGET):
                BUDGET.append({"category":project_category,"parent_category":"Projects & Investments","paid_from":"","monthly_budget":0,"is_suggested":True})
            project_related = assign_project_to_similar(transaction, TRANSACTIONS, project_id) if payload.get("propagate_similar") else {"project_auto_assigned_ids":[transaction_id],"project_review_candidate_ids":[]}
            for related_transaction in TRANSACTIONS:
                if related_transaction.get("project_id") == project_id:
                    related_transaction["budget_category"] = project_category
                    related_transaction["budget_parent_category"] = "Projects & Investments"
        else:
            project_related = {"project_auto_assigned_ids":[transaction_id],"project_review_candidate_ids":[]}
    if "portfolio_item_id" in payload:
        portfolio_item_id = str(payload.get("portfolio_item_id", "")).strip() or None
        if portfolio_item_id and not any(item["id"] == portfolio_item_id for item in ASSETS):
            raise HTTPException(status_code=400, detail="Portfolio item not found.")
        transaction["portfolio_item_id"] = portfolio_item_id
    if "exclude_from_rolling_average" in payload:
        transaction["exclude_from_rolling_average"] = bool(payload.get("exclude_from_rolling_average"))
    classification = str(payload.get("classification", "")).strip().lower()
    if classification:
        transaction["is_transfer"] = classification == "transfer"
        transaction["is_income"] = classification in ["income", "return", "reimbursement"]
        transaction["is_spending"] = classification == "expense"
        transaction["manual_classification"] = classification
    assign_budget_categories([transaction], BUDGET)
    related = {"auto_assigned_ids": [transaction_id], "review_candidate_ids": []}
    if "category" in payload and payload.get("propagate_similar"):
        related = apply_category_to_similar(
            transaction,
            TRANSACTIONS,
            transaction.get("manual_budget_category"),
            transaction.get("manual_budget_parent_category"),
        )
    return {"transaction": transaction, **related, **(project_related if "project_id" in payload else {})}

@app.post("/api/transactions/{transaction_id}/category-preview")
def category_preview(transaction_id: str, payload: dict):
    transaction = next((row for row in TRANSACTIONS if row.get("id") == transaction_id), None)
    if transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    return {**preview_category_matches(transaction, TRANSACTIONS), "category":str(payload.get("category", "")).strip(), "parent_category":str(payload.get("parent_category", "")).strip()}

@app.post("/api/transactions/bulk-category")
def bulk_category(payload: dict):
    ids = set(payload.get("transaction_ids") or [])
    category = str(payload.get("category", "")).strip() or None
    parent = str(payload.get("parent_category", "")).strip() or None
    updated = []
    for transaction in TRANSACTIONS:
        if transaction.get("id") in ids:
            transaction["manual_budget_category"] = category
            transaction["manual_budget_parent_category"] = parent
            transaction["budget_category"] = category
            transaction["budget_parent_category"] = parent
            if "secondary_categories" in payload:
                transaction["secondary_categories"] = [str(value).strip() for value in payload.get("secondary_categories", []) if str(value).strip()]
            updated.append(transaction.get("id"))
    if payload.get("always_apply") and updated:
        selected = next(row for row in TRANSACTIONS if row.get("id") in ids)
        apply_natural_language_rule(f"{selected.get('description','')} = {category}", TRANSACTIONS, BUDGET)
    return {"updated_ids":updated}

@app.patch("/api/institutions/{source_name}")
def rename_institution(source_name: str, payload: dict):
    new_name = str(payload.get("name", "")).strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Financial provider name is required.")
    provider_type = str(payload.get("provider_type", "other")).strip()
    for transaction in TRANSACTIONS:
        if transaction.get("source_account") == source_name:
            transaction["source_account"] = new_name
            transaction["provider_type"] = provider_type
    INSTITUTIONS.pop(source_name, None)
    INSTITUTIONS[new_name] = {"name":new_name,"provider_type":provider_type}
    return INSTITUTIONS[new_name]

@app.get("/api/institutions")
def get_institutions():
    names = sorted(set(IDENTIFIED_PROVIDERS) | {row.get("source_account") for row in TRANSACTIONS if row.get("source_account")})
    unique = {}
    for name in names:
        provider = INSTITUTIONS.get(name,IDENTIFIED_PROVIDERS.get(name,{"name":name,"provider_type":"other"}))
        unique[provider["name"].strip().lower()] = provider
    return sorted(unique.values(), key=lambda row: row["name"].lower())

@app.delete("/api/session")
def reset_session():
    global TRANSACTIONS, BUDGET, PROJECTS, ASSETS, GOALS
    TRANSACTIONS = []
    BUDGET = identified_categories()
    PROJECTS = default_projects()
    ASSETS = []
    GOALS = []
    clear_user_rules()
    return {"reset": True}

@app.get("/api/projects")
def get_projects():
    return project_analysis(PROJECTS, TRANSACTIONS)

@app.post("/api/projects")
def add_project(payload: dict):
    try:
        project = create_project(payload)
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    PROJECTS.append(project)
    return project

@app.patch("/api/projects/{project_id}")
def update_project(project_id: str, payload: dict):
    project = next((row for row in PROJECTS if row["id"] == project_id), None)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    for key in ["name", "status"]:
        if key in payload:
            project[key] = str(payload[key]).strip()
    for key in ["target_budget", "projected_revenue", "actual_revenue"]:
        if key in payload:
            project[key] = max(float(payload[key] or 0), 0)
    return project

@app.get("/api/tags")
def get_tags():
    used = {str(tag).strip() for row in TRANSACTIONS for tag in row.get("secondary_categories", []) if str(tag).strip()}
    category_tags = {str(row.get("category", "")).strip() for row in BUDGET if str(row.get("category", "")).strip()}
    return sorted(set(TAGS) | used | category_tags, key=str.lower)

@app.post("/api/tags")
def add_tag(payload: dict):
    tag = str(payload.get("name", "")).strip()
    if not tag:
        raise HTTPException(status_code=400, detail="Tag name is required.")
    if tag.lower() not in {item.lower() for item in TAGS}:
        TAGS.append(tag)
    return {"name": tag}

@app.patch("/api/tags/{tag_name}")
def update_tag(tag_name: str, payload: dict):
    new_name = str(payload.get("name", "")).strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Tag name is required.")
    global TAGS
    TAGS = [new_name if item.lower() == tag_name.lower() else item for item in TAGS]
    if new_name.lower() not in {item.lower() for item in TAGS}:
        TAGS.append(new_name)
    for row in TRANSACTIONS:
        row["secondary_categories"] = [new_name if str(item).lower() == tag_name.lower() else item for item in row.get("secondary_categories", [])]
    return {"name": new_name}

@app.post("/api/projects/{project_id}/accounts")
def add_project_account(project_id: str, payload: dict):
    project = next((row for row in PROJECTS if row["id"] == project_id), None)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    account = {"id": __import__("uuid").uuid4().hex[:12], "name":str(payload.get("name","")).strip(), "institution":str(payload.get("institution","")).strip(), "account_type":str(payload.get("account_type","checking")).strip(), "balance":float(payload.get("balance",0) or 0), "teller_sync":bool(payload.get("teller_sync"))}
    if not account["name"]:
        raise HTTPException(status_code=400, detail="Account name is required.")
    project.setdefault("accounts", []).append(account)
    return account

@app.get("/api/projects/{project_id}/export")
def export_project(project_id: str):
    project = next((row for row in project_analysis(PROJECTS, TRANSACTIONS) if row["id"] == project_id), None)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    payload = {"format":"fcc-project-dashboard","version":1,"project":project,"transactions":[row for row in TRANSACTIONS if row.get("project_id")==project_id]}
    return Response(content=json.dumps(payload,indent=2),media_type="application/json",headers={"Content-Disposition":f'attachment; filename="fcc-project-{project_id}.json"'})

@app.get("/api/planning")
def get_planning():
    return {"assets":ASSETS, **portfolio_analysis(ASSETS, TRANSACTIONS, GOALS)}

@app.post("/api/assets")
def add_asset(payload: dict):
    try:
        asset = create_asset(payload)
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    ASSETS.append(asset)
    return asset

@app.post("/api/goals")
def add_goal(payload: dict):
    try:
        goal = create_goal(payload)
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    GOALS.append(goal)
    return goal

@app.post("/api/planning/assistant")
def planning_assistant(payload: dict):
    request = str(payload.get("request", "")).strip()
    scope = str(payload.get("scope", "household")).strip()
    if not request:
        raise HTTPException(status_code=400, detail="Describe the outcome and target date.")
    analysis = portfolio_analysis(ASSETS, TRANSACTIONS, GOALS)
    history = analysis.get("history", [])
    avg_cash_flow = sum(row.get("net_cash_flow", 0) for row in history) / max(len(history), 1)
    ordered = sorted(analysis.get("goals", []), key=lambda row: ({"high":0,"medium":1,"low":2}.get(row.get("priority"),1), row.get("target_date") or "9999"))
    sequence = [row["name"] for row in ordered]
    return {"request":request,"scope":scope,"monthly_capacity":round(avg_cash_flow,2),"strategy":"sequence" if any(row.get("goal_type")=="debt_payoff" for row in ordered) else "parallel","sequence":sequence,"steps":[f"Protect minimum payments and essential expenses before allocating approximately ${max(avg_cash_flow,0):,.0f} of monthly capacity.","Prioritize high-interest liabilities and time-sensitive goals, then redirect completed payments to the next goal.","Recalculate after each new statement import and whenever income, expenses, rates, or target dates change."],"constraint_note":"If current cash flow is insufficient, compare the required monthly gap with specific expense reductions or additional income before changing a target date."}

@app.post("/api/category-rules")
def create_category_rule(payload: dict):
    try:
        result = apply_natural_language_rule(payload.get("prompt", ""), TRANSACTIONS, BUDGET)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {**result, "budget_mapping": assign_budget_categories(TRANSACTIONS, BUDGET)}

@app.get("/api/category-rules")
def get_category_rules():
    return export_user_rules()

@app.delete("/api/category-rules/{merchant}")
def delete_category_rule(merchant: str):
    remaining = [rule for rule in export_user_rules() if rule.get("merchant") != merchant]
    restore_user_rules(remaining)
    return remaining

@app.post("/api/categories")
def add_category(payload: dict):
    category = str(payload.get("category", "")).strip()
    if not category:
        raise HTTPException(status_code=400, detail="Category name is required.")
    row = {"category":category,"parent_category":str(payload.get("parent_category", "Other")).strip() or "Other","paid_from":"","monthly_budget":float(payload.get("monthly_budget",0) or 0),"is_suggested":False}
    existing = next((item for item in BUDGET if item.get("category", "").lower() == category.lower()), None)
    if existing: existing.update(row)
    else: BUDGET.append(row)
    return row

@app.patch("/api/categories/{category_name}")
def update_category(category_name: str, payload: dict):
    row = next((item for item in BUDGET if item.get("category", "").lower() == category_name.lower()), None)
    if row is None:
        raise HTTPException(status_code=404, detail="Category not found.")
    new_name = str(payload.get("category", row["category"])).strip() or row["category"]
    old_name = row["category"]
    row.update({"category":new_name,"parent_category":str(payload.get("parent_category",row.get("parent_category","Other"))).strip() or "Other","monthly_budget":float(payload.get("monthly_budget",row.get("monthly_budget",0)) or 0)})
    for transaction in TRANSACTIONS:
        if transaction.get("budget_category") == old_name:
            transaction["budget_category"] = new_name
            transaction["budget_parent_category"] = row["parent_category"]
        if transaction.get("manual_budget_category") == old_name:
            transaction["manual_budget_category"] = new_name
            transaction["manual_budget_parent_category"] = row["parent_category"]
    return row

@app.post("/api/session/reset")
def reset_selected_areas(payload: dict):
    global TRANSACTIONS, BUDGET, PROJECTS, ASSETS, GOALS
    if payload.get("transactions"):
        TRANSACTIONS = []
    else:
        for transaction in TRANSACTIONS:
            if payload.get("categorization"):
                for key in ["manual_budget_category","manual_budget_parent_category","budget_category","budget_parent_category","secondary_categories"]: transaction.pop(key, None)
            if payload.get("projects"): transaction["project_id"] = None
            if payload.get("notes"):
                transaction.pop("user_note", None); transaction.pop("note_mentions", None)
    if payload.get("budget"): BUDGET = identified_categories()
    if payload.get("project_definitions"): PROJECTS = default_projects()
    if payload.get("portfolio"): ASSETS = []
    if payload.get("goals"): GOALS = []
    if payload.get("rules"): clear_user_rules()
    return {"reset":True,"areas":[key for key,value in payload.items() if value]}

@app.post("/api/receipts")
async def upload_receipt(file: UploadFile = File(...)):
    try:
        return await analyze_receipt(file, TRANSACTIONS)
    except (ValueError, subprocess.SubprocessError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

@app.get("/api/transactions")
def get_transactions():
    return TRANSACTIONS

@app.get("/api/dashboard")
def dashboard():
    return build_dashboard(TRANSACTIONS)

@app.get("/api/budget-analysis")
def budget_analysis():
    return build_budget_analysis(TRANSACTIONS, BUDGET)

@app.get("/api/teller/status")
def teller_status():
    return connection_status()

@app.post("/api/teller/enrollments")
async def add_teller_enrollment(payload: dict):
    register_enrollment(
        str(payload.get("enrollment_id", "")),
        str(payload.get("institution_name", "")),
        str(payload.get("access_token", "")),
    )
    return connection_status()

@app.post("/api/teller/sync")
async def sync_teller_now():
    global TRANSACTIONS
    try:
        result = await sync_transactions()
    except Exception as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    TRANSACTIONS = result["transactions"]
    reconciliation = reconcile_card_payments(TRANSACTIONS, BUDGET)
    mapping = assign_budget_categories(TRANSACTIONS, BUDGET)
    return {
        "synced_transactions": result["synced_transactions"],
        "reconciliation": reconciliation,
        "budget_mapping": mapping,
        "status": connection_status(),
    }

@app.post("/api/backup")
def download_backup(client_settings: dict | None = None):
    timestamp = datetime.now(timezone.utc)
    payload = {
        "format": "financial-command-center-backup",
        "version": 1,
        "created_at": timestamp.isoformat(),
        "transactions": TRANSACTIONS,
        "budget": BUDGET,
        "category_rules": export_user_rules(),
        "projects": PROJECTS,
        "assets": ASSETS,
        "goals": GOALS,
        "tags": TAGS,
        "client_settings": client_settings or {},
    }
    filename = f"fcc-backup-{timestamp.strftime('%Y-%m-%d-%H%M%S')}.json"
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@app.post("/api/restore")
async def restore_backup(file: UploadFile = File(...)):
    global TRANSACTIONS, BUDGET, PROJECTS, ASSETS, GOALS, TAGS
    try:
        payload = json.loads((await file.read()).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=400, detail="The selected file is not a valid FCC backup.") from error

    if payload.get("format") != "financial-command-center-backup" or payload.get("version") != 1:
        raise HTTPException(status_code=400, detail="This backup format or version is not supported.")
    transactions = payload.get("transactions")
    budget = payload.get("budget")
    if not isinstance(transactions, list) or not isinstance(budget, list):
        raise HTTPException(status_code=400, detail="The backup is missing transactions or budget data.")

    TRANSACTIONS = sorted(transactions, key=lambda row: str(row.get("date", "")), reverse=True)
    BUDGET = budget
    restore_user_rules(payload.get("category_rules", []))
    PROJECTS = payload.get("projects") if isinstance(payload.get("projects"), list) else default_projects()
    ASSETS = payload.get("assets") if isinstance(payload.get("assets"), list) else []
    GOALS = payload.get("goals") if isinstance(payload.get("goals"), list) else []
    TAGS = payload.get("tags") if isinstance(payload.get("tags"), list) else []
    reconciliation = reconcile_card_payments(TRANSACTIONS, BUDGET)
    mapping = assign_budget_categories(TRANSACTIONS, BUDGET)
    return {
        "restored_transactions": len(TRANSACTIONS),
        "restored_budget_categories": len(BUDGET),
        "reconciliation": reconciliation,
        "budget_mapping": mapping,
        "created_at": payload.get("created_at"),
        "client_settings": payload.get("client_settings", {}),
    }
