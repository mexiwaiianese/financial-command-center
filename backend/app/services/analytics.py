from collections import defaultdict
from datetime import date
from statistics import median
from app.core.settings import HOUSEHOLD_SETTINGS


NEGOTIABLE_CATEGORIES = {
    "Cell Phones": (120, "strong", "Review line usage, remove device add-ons, and compare smaller prepaid plans or lower-cost carriers."),
    "Internet": (90, "likely", "Ask the current provider for a retention rate and compare service tiers at the required speed."),
    "Auto Insurance": (250, "likely", "Requote coverage with multiple insurers and review deductibles, mileage, and unused add-ons."),
    "Alarm (Vivint)": (50, "likely", "Review the contract end date, equipment charges, monitoring tier, and competing monitoring services."),
    "YT Premium": (15, "strong", "Check household usage and whether a smaller plan or cancellation covers the same need."),
    "Netflix": (15, "strong", "Review simultaneous-stream needs, downgrade the tier, or rotate subscriptions instead of keeping all active."),
}


def spending_amount(transaction):
    amount = float(transaction.get("amount", 0))
    if transaction.get("source_kind") == "credit_card" or transaction.get("source_account") == "AMEX":
        return amount
    return -amount

def build_dashboard(transactions):
    spending = [t for t in transactions if t.get("is_spending") and not t.get("is_transfer") and not t.get("is_income") and not t.get("project_id")]
    income = [t for t in transactions if t.get("is_income")]
    transfers = [t for t in transactions if t.get("is_transfer")]
    by_category = defaultdict(float)
    counts = defaultdict(int)
    for t in spending:
        cat = t.get("major_category", "Uncategorized")
        amt = spending_amount(t)
        by_category[cat] += amt
        counts[cat] += 1
    total_spending = max(sum(by_category.values()), 0)
    total_income = sum(abs(float(t.get("amount", 0))) for t in income)
    net_cash_flow = total_income - total_spending
    adu_budget = HOUSEHOLD_SETTINGS["adu_project_budget"]
    adu_spend = min(sum(spending_amount(t) for t in spending if t.get("is_adu_related")), adu_budget)
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


def build_budget_analysis(transactions, budget):
    spending = [
        transaction for transaction in transactions
        if transaction.get("is_spending") and not transaction.get("is_transfer") and not transaction.get("is_income") and not transaction.get("project_id")
    ]
    monthly = defaultdict(lambda: defaultdict(float))
    valid_dates = []
    transaction_spending = []
    for transaction in spending:
        try:
            transaction_date = date.fromisoformat(str(transaction.get("date", ""))[:10])
        except ValueError:
            continue
        month = transaction_date.strftime("%Y-%m")
        category = transaction.get("budget_category") or transaction.get("major_category") or "Uncategorized"
        monthly[month][category] += spending_amount(transaction)
        transaction_spending.append((transaction, category, spending_amount(transaction)))
        valid_dates.append(transaction_date)

    months = sorted(monthly.keys())[-12:]
    budget_by_category = {row["category"].strip().lower(): row for row in budget}
    actual_categories = {category for month in months for category in monthly[month]}
    display_categories = {row["category"] for row in budget} | actual_categories
    rows = []

    for category in display_categories:
        values = [round(monthly[month].get(category, 0), 2) for month in months]
        budget_row = budget_by_category.get(category.strip().lower())
        monthly_budget = float(budget_row["monthly_budget"]) if budget_row else 0
        average_actual = sum(values) / len(months) if months else 0
        latest_actual = values[-1] if values else 0
        historical_values = values[:-1] if len(values) > 1 else values
        historical_normal = median(historical_values) if historical_values else 0
        variance = average_actual - monthly_budget if budget_row else 0
        over_budget_months = sum(1 for value in values if budget_row and value > monthly_budget)
        latest_vs_normal = latest_actual - historical_normal
        recent_values = values[-3:]
        prior_values = values[-6:-3]
        recent_average = sum(recent_values) / len(recent_values) if recent_values else 0
        prior_average = sum(prior_values) / len(prior_values) if prior_values else 0
        trend_change = recent_average - prior_average
        trend_percent = (trend_change / prior_average) * 100 if prior_average else None
        is_trending_up = bool(prior_average and trend_change > 50 and trend_percent > 15)

        if budget_row and average_actual > monthly_budget * 1.1:
            status = "high"
        elif budget_row and (average_actual > monthly_budget or latest_actual > monthly_budget):
            status = "watch"
        elif not budget_row and average_actual > 0:
            status = "unbudgeted"
        else:
            status = "on_track"

        rows.append({
            "category": category,
            "monthly_budget": round(monthly_budget, 2) if budget_row else None,
<<<<<<< HEAD
=======
            "suggested_budget": round(max(average_actual, historical_normal) / 10) * 10 if average_actual else 0,
>>>>>>> b8f2fd7c8b9a85c9935ef8c6f858b80ac6b3d70d
            "average_actual": round(average_actual, 2),
            "latest_actual": round(latest_actual, 2),
            "historical_normal": round(historical_normal, 2),
            "variance": round(variance, 2) if budget_row else None,
            "variance_percent": round((variance / monthly_budget) * 100, 1) if monthly_budget else None,
            "latest_vs_normal": round(latest_vs_normal, 2),
            "over_budget_months": over_budget_months,
            "months_analyzed": len(months),
            "status": status,
            "is_trending_up": is_trending_up,
            "trend_change": round(trend_change, 2),
            "trend_percent": round(trend_percent, 1) if trend_percent is not None else None,
        })

    status_order = {"high": 0, "watch": 1, "unbudgeted": 2, "on_track": 3}
    rows.sort(key=lambda row: (status_order[row["status"]], -(row["variance"] or row["average_actual"])))
    total_budget = sum(float(row["monthly_budget"]) for row in budget)
    total_average = sum(row["average_actual"] for row in rows)
    positive_amounts = defaultdict(list)
    for _, category, amount in transaction_spending:
        if amount > 0:
            positive_amounts[category].append(amount)

    outliers = []
    for transaction, category, amount in transaction_spending:
        baseline = median(positive_amounts[category]) if positive_amounts[category] else 0
        threshold = max(baseline * 3, 500)
        is_outlier = amount > threshold
        transaction["is_outlier"] = is_outlier
        transaction["spending_amount"] = round(amount, 2)
        if is_outlier:
            outliers.append({
                "transaction_id": transaction.get("id"),
                "date": transaction.get("date"),
                "description": transaction.get("description"),
                "category": category,
                "amount": round(amount, 2),
                "baseline": round(baseline, 2),
                "source_account": transaction.get("source_account"),
            })
    outliers.sort(key=lambda row: row["amount"] - row["baseline"], reverse=True)
<<<<<<< HEAD
=======
    rolling_monthly = defaultdict(float)
    for transaction, _category, amount in transaction_spending:
        if not transaction.get("exclude_from_rolling_average"):
            rolling_monthly[str(transaction.get("date", ""))[:7]] += amount
>>>>>>> b8f2fd7c8b9a85c9935ef8c6f858b80ac6b3d70d

    trends = [
        {
            "category": row["category"],
            "trend_change": row["trend_change"],
            "trend_percent": row["trend_percent"],
            "latest_actual": row["latest_actual"],
        }
        for row in rows
        if row["is_trending_up"]
    ]
    trends.sort(key=lambda row: row["trend_change"], reverse=True)

    savings_opportunities = []
    for row in rows:
        rule = NEGOTIABLE_CATEGORIES.get(row["category"])
        if not rule or row["average_actual"] < rule[0]:
            continue
        threshold, confidence, recommendation = rule
        potential = max(row["average_actual"] - threshold, row["average_actual"] * 0.1)
        savings_opportunities.append({
            "category": row["category"],
            "confidence": confidence,
            "average_monthly_cost": row["average_actual"],
            "estimated_monthly_savings": round(potential, 2),
            "recommendation": recommendation,
        })
    savings_opportunities.sort(key=lambda row: row["estimated_monthly_savings"], reverse=True)

    return {
        "coverage": {
            "months": months,
            "month_count": len(months),
            "start_date": min(valid_dates).isoformat() if valid_dates else None,
            "end_date": max(valid_dates).isoformat() if valid_dates else None,
        },
        "summary": {
            "monthly_budget": round(total_budget, 2),
            "average_monthly_spending": round(total_average, 2),
            "average_variance": round(total_average - total_budget, 2),
            "categories_over_budget": sum(1 for row in rows if row["status"] in ["high", "watch"]),
            "unbudgeted_categories": sum(1 for row in rows if row["status"] == "unbudgeted"),
        },
        "categories": rows,
        "monthly_spending": [
            {
                "month": month,
                "total": round(max(sum(monthly[month].values()), 0), 2),
<<<<<<< HEAD
                "has_outlier": any(row["date"].startswith(month) for row in outliers),
            }
            for month in months
=======
                "monthly_budget": round(total_budget, 2),
                "rolling_average": round(sum(max(rolling_monthly[item], 0) for item in months[max(0, index - 11):index]) / max(len(months[max(0, index - 11):index]), 1), 2),
                "has_outlier": any(row["date"].startswith(month) for row in outliers),
            }
            for index, month in enumerate(months)
>>>>>>> b8f2fd7c8b9a85c9935ef8c6f858b80ac6b3d70d
        ],
        "budget": budget,
        "outliers": outliers,
        "trends": trends,
        "savings_opportunities": savings_opportunities,
    }
