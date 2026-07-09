from dataclasses import dataclass

@dataclass
class CategoryResult:
    major_category: str
    subcategory: str
    is_income: bool = False
    is_transfer: bool = False
    is_spending: bool = True
    is_adu_related: bool = False
    notes: str = ""

def categorize_transaction(description: str, amount: float) -> CategoryResult:
    text = (description or "").upper()

    if any(k in text for k in ["PAYROLL", "DIRECT DEP", "SALARY", "WAGES"]):
        return CategoryResult("Income", "Employment Income", True, False, False)
    if any(k in text for k in ["REFUND", "REIMBURSEMENT"]):
        return CategoryResult("Income", "Refund/Reimbursement", True, False, False)
    if "PNC" in text:
        return CategoryResult("Housing", "Mortgage")
    if "HELOC" in text or "HOME EQUITY" in text:
        return CategoryResult("Housing", "HELOC Payment", notes="About $1,350/month interest; ADU remodel capped around $17,000; remainder is legacy consolidated debt.")
    if any(k in text for k in ["AUTOPAY PAYMENT", "ONLINE PAYMENT", "CREDIT CARD PAYMENT", "AMEX EPAYMENT"]):
        return CategoryResult("Transfers", "Credit Card Payment", False, True, False)
    if any(k in text for k in ["TRANSFER", "VENMO", "ZELLE"]):
        return CategoryResult("Transfers", "Internal/Peer Transfer", False, True, False)
    if "WALMART" in text:
        return CategoryResult("Groceries & Household", "Walmart")
    if "COSTCO" in text:
        return CategoryResult("Transportation", "Fuel")
    if any(k in text for k in ["SMITH", "MACEY", "HARMONS", "KROGER", "GROCERY"]):
        return CategoryResult("Groceries & Household", "Groceries")
    if any(k in text for k in ["MAVERIK", "CHEVRON", "SHELL", "EXXON", "SINCLAIR"]):
        return CategoryResult("Transportation", "Fuel")
    if any(k in text for k in ["MCDONALD", "CHICK-FIL-A", "CAFE", "RESTAURANT", "DOORDASH", "UBER EATS"]):
        return CategoryResult("Dining", "Restaurants/Fast Food")
    if any(k in text for k in ["AMAZON", "TARGET", "BEST BUY"]):
        return CategoryResult("Shopping", "General Merchandise")
    if any(k in text for k in ["DOCTOR", "DENTAL", "PHARMACY", "CVS", "WALGREENS", "HOSPITAL", "MEDICAL"]):
        return CategoryResult("Healthcare", "Medical/Pharmacy")
    if any(k in text for k in ["CHURCH", "TITHING", "DONATION", "CHARITY", "LDS"]):
        return CategoryResult("Giving", "Tithing & Donations")
    if any(k in text for k in ["TUITION", "BOOKSTORE", "SCHOOL", "UNIVERSITY", "COLLEGE"]):
        return CategoryResult("Education", "Education")
    if any(k in text for k in ["NETFLIX", "SPOTIFY", "HULU", "DISNEY", "HOTEL", "AIRBNB", "DELTA", "SOUTHWEST"]):
        return CategoryResult("Entertainment & Travel", "Entertainment/Travel")
    if any(k in text for k in ["HOME DEPOT", "LOWES", "LOWE'S", "CONTRACTOR", "BUILDING SUPPLY"]):
        return CategoryResult("Housing", "Home Improvement", is_adu_related=True)
    if any(k in text for k in ["BANK FEE", "INTEREST CHARGE", "FINANCE CHARGE"]):
        return CategoryResult("Banking & Debt", "Fees/Interest")
    return CategoryResult("Uncategorized", "Needs Review")
