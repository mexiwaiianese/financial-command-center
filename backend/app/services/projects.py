from uuid import uuid4
from difflib import SequenceMatcher

from app.services.analytics import spending_amount
from app.services.budget_mapping import merchant_key


def default_projects():
    return [
        {
            "id": "adu",
            "name": "ADU Rental",
            "target_budget": 17000.0,
            "projected_revenue": 18600.0,
            "actual_revenue": 0.0,
            "status": "active",
            "accounts": [],
        }
    ]


def create_project(payload):
    name = str(payload.get("name", "")).strip()
    if not name:
        raise ValueError("Project name is required.")
    return {
        "id": uuid4().hex[:12],
        "name": name,
        "target_budget": max(float(payload.get("target_budget", 0) or 0), 0),
        "projected_revenue": max(float(payload.get("projected_revenue", 0) or 0), 0),
        "actual_revenue": max(float(payload.get("actual_revenue", 0) or 0), 0),
        "status": str(payload.get("status", "active")).strip() or "active",
        "accounts": [],
    }


def project_analysis(projects, transactions):
    results = []
    for project in projects:
        assigned = [row for row in transactions if row.get("project_id") == project["id"]]
        investments = [row for row in assigned if not row.get("is_income") and not row.get("is_transfer")]
        project_income = [row for row in assigned if row.get("is_income")]
        invested = sum(max(spending_amount(row), 0) for row in investments)
        realized = float(project.get("actual_revenue", 0)) + sum(abs(float(row.get("amount", 0))) for row in project_income)
        projected = float(project.get("projected_revenue", 0))
        projected_roi = ((projected - invested) / invested * 100) if invested else None
        realized_roi = ((realized - invested) / invested * 100) if invested else None
        results.append({
            **project,
            "invested": round(invested, 2),
            "realized_revenue": round(realized, 2),
            "projected_profit": round(projected - invested, 2),
            "realized_profit": round(realized - invested, 2),
            "projected_roi_percent": round(projected_roi, 1) if projected_roi is not None else None,
            "realized_roi_percent": round(realized_roi, 1) if realized_roi is not None else None,
            "budget_remaining": round(max(float(project.get("target_budget", 0)) - invested, 0), 2),
            "transaction_count": len(assigned),
        })
    return results


def assign_project_to_similar(selected, transactions, project_id):
    selected_key = merchant_key(selected.get("description", ""))
    assigned = []
    review = []
    for transaction in transactions:
        if transaction.get("is_transfer") or transaction.get("is_income"):
            continue
        candidate_key = merchant_key(transaction.get("description", ""))
        ratio = SequenceMatcher(None, selected_key, candidate_key).ratio()
        exact = selected_key and (selected_key == candidate_key or selected_key in candidate_key or candidate_key in selected_key)
        if exact or ratio >= .86:
            transaction["project_id"] = project_id
            assigned.append(transaction.get("id"))
        elif ratio >= .62:
            transaction["project_review_suggestion"] = project_id
            review.append(transaction.get("id"))
    return {"project_auto_assigned_ids":[value for value in assigned if value],"project_review_candidate_ids":[value for value in review if value]}
