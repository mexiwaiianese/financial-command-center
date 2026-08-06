from collections import defaultdict
from datetime import date
from uuid import uuid4

from app.services.analytics import spending_amount


EDUCATION_SOURCES = {
    "diversification": "https://www.investor.gov/introduction-investing/getting-started/asset-allocation",
    "goals": "https://www.finra.org/investors/investing/investing-basics/investment-goals",
    "debt": "https://www.consumerfinance.gov/archive/blog/how-reduce-your-debt/",
    "insurance": "https://content.naic.org/consumer/life-insurance.htm",
}


def create_asset(payload):
    name = str(payload.get("name", "")).strip()
    if not name:
        raise ValueError("Asset or liability name is required.")
    kind = str(payload.get("kind", "other")).strip().lower()
    return {
        "id": uuid4().hex[:12], "name": name, "kind": kind,
        "current_value": max(float(payload.get("current_value", 0) or 0), 0),
        "cost_basis": max(float(payload.get("cost_basis", 0) or 0), 0),
        "annual_rate": float(payload.get("annual_rate", 0) or 0),
        "monthly_contribution": float(payload.get("monthly_contribution", 0) or 0),
        "institution": str(payload.get("institution", "")).strip(),
        "notes": str(payload.get("notes", "")).strip(),
        "linked_goal_id": str(payload.get("linked_goal_id", "")).strip() or None,
    }


def create_goal(payload):
    name = str(payload.get("name", "")).strip()
    if not name:
        raise ValueError("Goal name is required.")
    return {
        "id": uuid4().hex[:12], "name": name,
        "goal_type": str(payload.get("goal_type", "savings")).strip(),
        "target_amount": max(float(payload.get("target_amount", 0) or 0), 0),
        "current_amount": max(float(payload.get("current_amount", 0) or 0), 0),
        "monthly_contribution": max(float(payload.get("monthly_contribution", 0) or 0), 0),
        "annual_rate": float(payload.get("annual_rate", 0) or 0),
        "target_date": str(payload.get("target_date", "")).strip() or None,
        "priority": str(payload.get("priority", "medium")).strip(),
        "pursuit_mode": str(payload.get("pursuit_mode", "parallel")).strip(),
    }


def goal_analysis(goals):
    results = []
    for goal in goals:
        balance = float(goal["current_amount"])
        target = float(goal["target_amount"])
        payment = float(goal["monthly_contribution"])
        monthly_rate = float(goal["annual_rate"]) / 1200
        debt = goal["goal_type"] == "debt_payoff"
        months = 0
        complete = balance <= target if debt else balance >= target
        while not complete and months < 1200:
            balance = balance * (1 + monthly_rate)
            balance = max(balance - payment, 0) if debt else balance + payment
            months += 1
            complete = balance <= target if debt else balance >= target
            if payment <= balance * monthly_rate and debt:
                break
        projected_date = None
        if complete:
            today = date.today()
            year = today.year + (today.month - 1 + months) // 12
            month = (today.month - 1 + months) % 12 + 1
            projected_date = date(year, month, 1).isoformat()
        progress = (1 - balance / goal["current_amount"]) * 100 if debt and goal["current_amount"] else (balance / target * 100 if target else 0)
        results.append({**goal, "projected_completion_date": projected_date, "months_remaining": months if complete else None, "projected_balance": round(balance, 2), "progress_percent": round(min(max(progress, 0), 100), 1)})
    return results


def portfolio_analysis(assets, transactions, goals):
    liability_kinds = {"debt", "loan", "mortgage", "credit_card"}
    assets_total = sum(row["current_value"] for row in assets if row["kind"] not in liability_kinds)
    liabilities_total = sum(row["current_value"] for row in assets if row["kind"] in liability_kinds)
    net_worth = assets_total - liabilities_total
    monthly = defaultdict(lambda: {"income": 0.0, "expenses": 0.0})
    for transaction in transactions:
        month = str(transaction.get("date", ""))[:7]
        if transaction.get("is_income"):
            monthly[month]["income"] += abs(float(transaction.get("amount", 0)))
        elif transaction.get("is_spending") and not transaction.get("is_transfer"):
            monthly[month]["expenses"] += spending_amount(transaction)
    history = []
    running_net_worth = net_worth
    for month, values in sorted(monthly.items())[-12:]:
        cash_flow = values["income"] - values["expenses"]
        running_net_worth += cash_flow
        history.append({"period":month,**{key:round(value,2) for key,value in values.items()},"net_cash_flow":round(cash_flow,2),"net_worth":round(running_net_worth,2)})
    annual_income = sum(row["income"] for row in history)
    annual_expenses = sum(row["expenses"] for row in history)
    projected = []
    projected_assets = float(assets_total)
    projected_liabilities = float(liabilities_total)
    for year_offset in range(0, 11):
        projected.append({"period": str(date.today().year + year_offset), "income": round(annual_income * (1.03 ** year_offset), 2), "expenses": round(annual_expenses * (1.025 ** year_offset), 2), "net_worth": round(projected_assets - projected_liabilities, 2)})
        projected_assets = sum(row["current_value"] * ((1 + row["annual_rate"] / 100) ** (year_offset + 1)) + row["monthly_contribution"] * 12 * (year_offset + 1) for row in assets if row["kind"] not in liability_kinds)
        projected_liabilities = sum(max(row["current_value"] * ((1 + row["annual_rate"] / 100) ** (year_offset + 1)) - row["monthly_contribution"] * 12 * (year_offset + 1), 0) for row in assets if row["kind"] in liability_kinds)
    kinds = defaultdict(float)
    for row in assets:
        if row["kind"] not in liability_kinds:
            kinds[row["kind"]] += row["current_value"]
    recommendations = []
    portfolio_terms = {"fidelity":"investment account","vanguard":"investment account","schwab":"investment account","mortgage":"mortgage","heloc":"line of credit","loan":"loan","401k":"retirement account","ira":"retirement account","insurance":"insurance policy"}
    existing = " ".join(f"{row.get('name','')} {row.get('institution','')}" for row in assets).lower()
    candidates, seen = [], set()
    for transaction in transactions:
        description = str(transaction.get("description", "")).lower()
        for term, kind in portfolio_terms.items():
            if term in description and term not in existing and term not in seen:
                seen.add(term)
                candidates.append({"name":str(transaction.get("description", term)).title(),"kind":kind,"institution":str(transaction.get("source_account", "")),"missing_fields":["current balance","interest or growth rate","monthly contribution/payment"]})
    if assets_total and max(kinds.values(), default=0) / assets_total > .6:
        recommendations.append({"title":"Review concentration risk","reason":"More than 60% of tracked assets are in one asset type.","source":EDUCATION_SOURCES["diversification"]})
    if liabilities_total:
        recommendations.append({"title":"Compare debt payoff strategies","reason":"Prioritize by interest cost or balance and confirm minimum payments remain covered.","source":EDUCATION_SOURCES["debt"]})
    if not any(row["kind"] == "life_insurance" for row in assets):
        recommendations.append({"title":"Document insurance needs","reason":"Review income replacement, dependents, debts, and end-of-life costs before evaluating coverage.","source":EDUCATION_SOURCES["insurance"]})
    if goals:
        recommendations.append({"title":"Separate major goals","reason":"Track major goals independently and align each time horizon with its funding approach.","source":EDUCATION_SOURCES["goals"]})
    return {"assets_total":round(assets_total,2),"liabilities_total":round(liabilities_total,2),"net_worth":round(net_worth,2),"allocation":[{"kind":key,"value":round(value,2)} for key,value in kinds.items()],"history":history,"projection":projected,"goals":goal_analysis(goals),"recommendations":recommendations,"portfolio_candidates":candidates}
