import re
from difflib import SequenceMatcher


ALIASES = {
    "Mortgage": ["mortgage", "pnc lending"],
    "HELOC": ["heloc", "home equity"],
    "Gas Stations": ["fuel", "costco gas", "maverik", "chevron", "shell", "sinclair"],
    "Groceries": ["groceries", "grocery", "smith", "macey", "harmons"],
    "Shopping": ["walmart", "costco", "amazon", "target", "shopping"],
    "YT Premium": ["youtube", "google youtube"],
    "Netflix": ["netflix"],
    "Internet": ["internet", "comcast", "xfinity", "google fiber"],
    "City Utilities": ["city utilities"],
    "Power": ["power", "rocky mountain"],
    "Cell Phones": ["cell phone", "t-mobile", "verizon", "at&t"],
    "AMEX": ["amex epayment", "american express"],
    "Capital One": ["capital one crcardpmt"],
    "Bank of America": ["bank of america payment"],
    "SBA EIDL": ["sba eidl"],
    "Tithing/Fast": ["tithing", "church", "donation", "lds"],
    "Restaurants": ["restaurant", "mcdonald", "chick fil a", "doordash", "uber eats", "cafe"],
}

RECOMMENDED_CATEGORIES = [
    {"category": "Groceries", "parent_category": "Lifestyle & Household", "paid_from": "", "monthly_budget": 0, "is_suggested": True},
    {"category": "Shopping", "parent_category": "Lifestyle & Household", "paid_from": "", "monthly_budget": 0, "is_suggested": True},
    {"category": "Restaurants", "parent_category": "Lifestyle & Household", "paid_from": "", "monthly_budget": 0, "is_suggested": True},
    {"category": "Household Supplies", "parent_category": "Lifestyle & Household", "paid_from": "", "monthly_budget": 0, "is_suggested": True},
    {"category": "Healthcare", "parent_category": "Utilities/Insurance", "paid_from": "", "monthly_budget": 0, "is_suggested": True},
    {"category": "Clothing", "parent_category": "Discretionary", "paid_from": "", "monthly_budget": 0, "is_suggested": True},
    {"category": "Electronics", "parent_category": "Discretionary", "paid_from": "", "monthly_budget": 0, "is_suggested": True},
]

IDENTIFIED_CATEGORY_CATALOG = [
    {"category":"Mortgage","parent_category":"Housing & Debt"}, {"category":"HELOC","parent_category":"Housing & Debt"},
    {"category":"Gas Stations","parent_category":"Transportation"}, {"category":"Car Expense","parent_category":"Transportation"},
    {"category":"Groceries","parent_category":"Lifestyle & Household"}, {"category":"Shopping","parent_category":"Lifestyle & Household"},
    {"category":"Restaurants","parent_category":"Lifestyle & Household"}, {"category":"Household Supplies","parent_category":"Lifestyle & Household"},
    {"category":"Clothing","parent_category":"Lifestyle & Household"}, {"category":"Healthcare","parent_category":"Health & Insurance"},
    {"category":"Auto Insurance","parent_category":"Health & Insurance"}, {"category":"Internet","parent_category":"Utilities & Services"},
    {"category":"City Utilities","parent_category":"Utilities & Services"}, {"category":"Power","parent_category":"Utilities & Services"},
    {"category":"Cell Phones","parent_category":"Utilities & Services"}, {"category":"Alarm (Vivint)","parent_category":"Utilities & Services"},
    {"category":"YT Premium","parent_category":"Subscriptions & Entertainment"}, {"category":"Netflix","parent_category":"Subscriptions & Entertainment"},
    {"category":"Tithing/Fast","parent_category":"Giving"}, {"category":"AMEX","parent_category":"Transfers & Payments"},
    {"category":"Capital One","parent_category":"Transfers & Payments"}, {"category":"Bank of America","parent_category":"Transfers & Payments"},
    {"category":"SBA EIDL","parent_category":"Housing & Debt"},
]


def identified_categories():
    return [{**row,"paid_from":"","monthly_budget":0,"is_suggested":True} for row in IDENTIFIED_CATEGORY_CATALOG]

KNOWN_MERCHANTS = [
    "mcdonald", "walmart", "costco", "amazon", "target", "netflix", "doordash",
    "uber eats", "chick fil a", "maverik", "chevron", "shell", "home depot",
    "lowes", "lowe s", "smiths", "harmons", "walgreens", "cvs",
]

USER_RULES = []


def _normalized(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


def merchant_key(description):
    value = _normalized(description)
    for merchant in KNOWN_MERCHANTS:
        if merchant in value:
            return merchant
    value = re.sub(r"\b(automatic|withdrawal|purchase|point of sale|debit|credit|card|web|pos|pending)\b", " ", value)
    value = re.sub(r"\b\d{3,}\b", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def ensure_recommended_categories(budget):
    existing = {str(row.get("category", "")).strip().lower() for row in budget}
    for row in RECOMMENDED_CATEGORIES:
        if row["category"].lower() not in existing:
            budget.append(dict(row))
    return budget


def _find_budget_row(budget, category):
    normalized = _normalized(category)
    return next((row for row in budget if _normalized(row.get("category", "")) == normalized), None)


def apply_natural_language_rule(prompt, transactions, budget):
    text = str(prompt or "").strip()
    if not text:
        raise ValueError("Enter a category rule.")

    if "=" in text:
        merchant, category = [part.strip(" .") for part in text.split("=", 1)]
        parent = ""
    else:
        merchant_match = re.search(r"(?:anything\s+)?with\s+['\"]?(.+?)['\"]?\s+in\s+the\s+description", text, re.I)
        category_match = re.search(r"(?:subcategor\w*|categor\w*)\s+as\s+['\"]?(.+?)(?:['\"]?\s*,?\s+under\s+|[.!]?$)", text, re.I)
        parent_match = re.search(r"\bunder\s+['\"]?(.+?)(?:['\"]?\s+categor\w*)?[.!]?$", text, re.I)
        if not merchant_match or not category_match:
            raise ValueError("Use a rule like 'avanti = clothing' or 'anything with avanti in the description should be subcategorized as clothing under groceries/shopping'.")
        merchant = merchant_match.group(1).strip(" '\"")
        category = category_match.group(1).strip(" '\"")
        parent = parent_match.group(1).strip(" '\"") if parent_match else ""

    if not merchant or not category:
        raise ValueError("The rule must include both a description match and category.")

    category = category.title()
    existing = _find_budget_row(budget, category)
    if existing:
        category = existing["category"]
        parent = parent or existing.get("parent_category", "")
    else:
        parent = parent.title() if parent else "Other"
        budget.append({
            "category": category,
            "parent_category": parent,
            "paid_from": "",
            "monthly_budget": 0,
            "is_suggested": True,
        })
    if existing and parent:
        existing["parent_category"] = parent.title()
        parent = existing["parent_category"]

    rule = {"merchant": _normalized(merchant), "category": category, "parent_category": parent}
    USER_RULES[:] = [item for item in USER_RULES if item["merchant"] != rule["merchant"]]
    USER_RULES.append(rule)

    matched_ids = []
    for transaction in transactions:
        if rule["merchant"] in _normalized(transaction.get("description", "")):
            transaction["manual_budget_category"] = category
            transaction["manual_budget_parent_category"] = parent
            transaction["budget_category"] = category
            transaction["budget_parent_category"] = parent
            matched_ids.append(transaction.get("id"))
    return {"rule": rule, "matched_transaction_ids": [value for value in matched_ids if value]}


def clear_user_rules():
    USER_RULES.clear()


def export_user_rules():
    return [dict(rule) for rule in USER_RULES]


def restore_user_rules(rules):
    USER_RULES.clear()
    for rule in rules or []:
        if all(str(rule.get(key, "")).strip() for key in ["merchant", "category"]):
            USER_RULES.append({
                "merchant": _normalized(rule["merchant"]),
                "category": str(rule["category"]).strip(),
                "parent_category": str(rule.get("parent_category", "")).strip(),
            })


def apply_category_to_similar(selected, transactions, category, parent_category):
    selected_key = merchant_key(selected.get("description", ""))
    auto_assigned = []
    review_candidates = []
    for transaction in transactions:
        if transaction.get("is_transfer") or transaction.get("is_income"):
            continue

        candidate_key = merchant_key(transaction.get("description", ""))
        ratio = SequenceMatcher(None, selected_key, candidate_key).ratio()
        same_merchant = bool(selected_key and candidate_key) and (
            selected_key == candidate_key or selected_key in candidate_key or candidate_key in selected_key
        )
        if same_merchant or ratio >= 0.86:
            transaction["manual_budget_category"] = category or None
            transaction["manual_budget_parent_category"] = parent_category or None
            transaction["budget_category"] = category or None
            transaction["budget_parent_category"] = parent_category or None
            transaction["category_match_confidence"] = round(max(ratio, 0.99 if same_merchant else ratio), 2)
            auto_assigned.append(transaction.get("id"))
        elif ratio >= 0.62:
            transaction["category_review_suggestion"] = category
            transaction["category_match_confidence"] = round(ratio, 2)
            review_candidates.append(transaction.get("id"))
    return {
        "auto_assigned_ids": [value for value in auto_assigned if value],
        "review_candidate_ids": [value for value in review_candidates if value],
    }


def preview_category_matches(selected, transactions):
    selected_key = merchant_key(selected.get("description", ""))
    selected_amount = round(abs(float(selected.get("amount", 0) or 0)), 2)
    exact, fuzzy = [], []
    for transaction in transactions:
        if transaction.get("is_transfer") or transaction.get("is_income"):
            continue
        candidate_key = merchant_key(transaction.get("description", ""))
        candidate_amount = round(abs(float(transaction.get("amount", 0) or 0)), 2)
        ratio = SequenceMatcher(None, selected_key, candidate_key).ratio()
        exact_match = selected_key == candidate_key and selected_amount == candidate_amount
        if transaction.get("id") == selected.get("id") or exact_match:
            exact.append({"id":transaction.get("id"),"description":transaction.get("description"),"date":transaction.get("date"),"amount":transaction.get("amount"),"confidence":1.0,"match_type":"exact"})
        elif ratio >= .62 or (selected_amount and abs(candidate_amount-selected_amount)/selected_amount <= .1):
            amount_similarity = max(0, 1 - abs(candidate_amount-selected_amount) / max(selected_amount, candidate_amount, 1))
            relevance = ratio * .88 + amount_similarity * .12
            fuzzy.append({"id":transaction.get("id"),"description":transaction.get("description"),"date":transaction.get("date"),"amount":transaction.get("amount"),"confidence":round(ratio,2),"relevance":round(relevance,3),"match_type":"similar"})
    fuzzy.sort(key=lambda row: row.get("relevance", 0), reverse=True)
    return {"exact_matches":exact,"fuzzy_matches":fuzzy}


def assign_budget_categories(transactions, budget):
    candidates = []
    for row in budget:
        category = str(row.get("category", "")).strip()
        parent = str(row.get("parent_category", category)).strip()
        terms = ALIASES.get(category, []) + [category]
        candidates.append((category, parent, [_normalized(term) for term in terms]))

    assigned = 0
    for transaction in transactions:
        if transaction.get("manual_budget_category"):
            transaction["budget_category"] = transaction["manual_budget_category"]
            transaction["budget_parent_category"] = transaction.get("manual_budget_parent_category", "")
            assigned += 1
            continue
        if transaction.get("is_transfer") or transaction.get("is_income"):
            transaction["budget_category"] = None
            transaction["budget_parent_category"] = None
            continue

        description = _normalized(transaction.get("description", ""))
        user_rule = next((rule for rule in reversed(USER_RULES) if rule["merchant"] in description), None)
        if user_rule:
            transaction["budget_category"] = user_rule["category"]
            transaction["budget_parent_category"] = user_rule["parent_category"]
            assigned += 1
            continue

        searchable = _normalized(
            f"{transaction.get('description', '')} {transaction.get('major_category', '')} "
            f"{transaction.get('subcategory', '')}"
        )
        matches = []
        for category, parent, terms in candidates:
            matching_terms = [term for term in terms if len(term) >= 4 and term in searchable]
            if matching_terms:
                matches.append((max(map(len, matching_terms)), category, parent))
        if matches:
            _, category, parent = max(matches)
            transaction["budget_category"] = category
            transaction["budget_parent_category"] = parent
            assigned += 1
        else:
            transaction["budget_category"] = None
            transaction["budget_parent_category"] = None
    return {"assigned_transactions": assigned, "unassigned_transactions": len(transactions) - assigned}
