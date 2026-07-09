from collections import defaultdict
from app.core.settings import HOUSEHOLD_SETTINGS

def build_dashboard(transactions):
    spending = [t for t in transactions if t.get("is_spending") and not t.get("is_transfer") and not t.get("is_income")]
    income = [t for t in transactions if t.get("is_income")]
    transfers = [t for t in transactions if t.get("is_transfer")]
    by_category = defaultdict(float)
    counts = defaultdict(int)
    for t in spending:
        cat = t.get("major_category", "Uncategorized")
        amt = abs(float(t.get("amount", 0)))
        by_category[cat] += amt
        counts[cat] += 1
    total_spending = sum(by_category.values())
    total_income = sum(abs(float(t.get("amount", 0))) for t in income)
    net_cash_flow = total_income - total_spending
    adu_budget = HOUSEHOLD_SETTINGS["adu_project_budget"]
    adu_spend = min(sum(abs(float(t.get("amount", 0))) for t in spending if t.get("is_adu_related")), adu_budget)
    dashboard = {
        "kpis": {
            "transaction_count": len(transactions),
            "spending_transaction_count": len(spending),
            "income_transaction_count": len(income),
            "transfer_transaction_count": len(transfers),
            "total_income": round(total_income, 2),
            "total_spending": round(total_spending, 2),
            "net_cash_flow": round(net_cash_flow, 2),
            "savings_rate": round((net_cash_flow / total_income) * 100, 2) if total_income else 0,
        },
        "category_spending": [
            {"category": c, "total": round(v, 2), "transactions": counts[c], "average": round(v / counts[c], 2) if counts[c] else 0}
            for c, v in sorted(by_category.items(), key=lambda x: x[1], reverse=True)
        ],
        "adu": {
            "budget": adu_budget,
            "estimated_spend_tracked": round(adu_spend, 2),
            "remaining_budget": round(max(adu_budget - adu_spend, 0), 2),
            "completion_percent": round((adu_spend / adu_budget) * 100, 2) if adu_budget else 0,
            "expected_monthly_rent": HOUSEHOLD_SETTINGS["adu_expected_monthly_rent"],
            "expected_annual_rent": HOUSEHOLD_SETTINGS["adu_expected_monthly_rent"] * 12,
            "expected_rent_start": HOUSEHOLD_SETTINGS["adu_expected_rent_start"],
        },
        "settings": HOUSEHOLD_SETTINGS,
    }
    dashboard["financial_health_score"] = calculate_financial_health_score(dashboard)
    return dashboard

def calculate_financial_health_score(dashboard):
    score = 50
    k = dashboard["kpis"]
    if k["net_cash_flow"] > 0: score += 15
    if k["savings_rate"] >= 10: score += 10
    if k["savings_rate"] >= 20: score += 10
    if dashboard["adu"]["completion_percent"] >= 75: score += 5
    return min(score, 100)
