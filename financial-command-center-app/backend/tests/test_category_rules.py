from app.core.category_rules import categorize_transaction

def test_pnc_is_mortgage():
    c = categorize_transaction("PNC Mortgage Payment", 2300)
    assert c.major_category == "Housing"
    assert c.subcategory == "Mortgage"

def test_walmart_is_groceries_household():
    c = categorize_transaction("Walmart Supercenter", 120)
    assert c.major_category == "Groceries & Household"

def test_costco_is_transportation():
    c = categorize_transaction("Costco Wholesale", 80)
    assert c.major_category == "Transportation"
    assert c.subcategory == "Fuel"
