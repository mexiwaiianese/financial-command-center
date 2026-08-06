import json
import asyncio
import subprocess
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from app.services.importer import import_budget_from_upload, import_transactions_from_uploads
from app.services.reconciliation import reconcile_card_payments
from app.services.budget_mapping import apply_category_to_similar, apply_natural_language_rule, assign_budget_categories, clear_user_rules, ensure_recommended_categories, export_user_rules, restore_user_rules
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
BUDGET = []
PROJECTS = default_projects()
ASSETS = []
GOALS = []

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
            project_related = assign_project_to_similar(transaction, TRANSACTIONS, project_id)
            for related_transaction in TRANSACTIONS:
                if related_transaction.get("project_id") == project_id:
                    related_transaction["budget_category"] = project_category
                    related_transaction["budget_parent_category"] = "Projects & Investments"
        else:
            project_related = {"project_auto_assigned_ids":[transaction_id],"project_review_candidate_ids":[]}
    classification = str(payload.get("classification", "")).strip().lower()
    if classification:
        transaction["is_transfer"] = classification == "transfer"
        transaction["is_income"] = classification == "income"
        transaction["is_spending"] = classification == "expense"
        transaction["manual_classification"] = classification
    assign_budget_categories([transaction], BUDGET)
    related = {"auto_assigned_ids": [transaction_id], "review_candidate_ids": []}
    if "category" in payload:
        related = apply_category_to_similar(
            transaction,
            TRANSACTIONS,
            transaction.get("manual_budget_category"),
            transaction.get("manual_budget_parent_category"),
        )
    return {"transaction": transaction, **related, **(project_related if "project_id" in payload else {})}

@app.delete("/api/session")
def reset_session():
    global TRANSACTIONS, BUDGET, PROJECTS, ASSETS, GOALS
    TRANSACTIONS = []
    BUDGET = []
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

@app.post("/api/projects/{project_id}/accounts")
def add_project_account(project_id: str, payload: dict):
    project = next((row for row in PROJECTS if row["id"] == project_id), None)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    account = {"id": __import__("uuid").uuid4().hex[:12], "name":str(payload.get("name","")).strip(), "institution":str(payload.get("institution","")).strip(), "account_type":str(payload.get("account_type","checking")).strip(), "balance":float(payload.get("balance",0) or 0)}
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

@app.post("/api/category-rules")
def create_category_rule(payload: dict):
    try:
        result = apply_natural_language_rule(payload.get("prompt", ""), TRANSACTIONS, BUDGET)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {**result, "budget_mapping": assign_budget_categories(TRANSACTIONS, BUDGET)}

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

@app.get("/api/backup")
def download_backup():
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
    }
    filename = f"fcc-backup-{timestamp.strftime('%Y-%m-%d-%H%M%S')}.json"
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@app.post("/api/restore")
async def restore_backup(file: UploadFile = File(...)):
    global TRANSACTIONS, BUDGET, PROJECTS, ASSETS, GOALS
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
    reconciliation = reconcile_card_payments(TRANSACTIONS, BUDGET)
    mapping = assign_budget_categories(TRANSACTIONS, BUDGET)
    return {
        "restored_transactions": len(TRANSACTIONS),
        "restored_budget_categories": len(BUDGET),
        "reconciliation": reconciliation,
        "budget_mapping": mapping,
        "created_at": payload.get("created_at"),
    }
