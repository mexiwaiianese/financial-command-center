# Financial Command Center

A local-first personal finance dashboard for household cash flow, budgeting, debt, net worth planning, and ADU/rental tracking.

## Included in this MVP

- FastAPI backend
- React/Vite frontend
- CSV upload for Amex/AFCU-style exports
- Transaction normalization
- Custom categorization rules
- Dashboard KPIs
- Spending by category
- ADU investment tracker
- HELOC/ADU assumptions documented

## Custom rules included

- PNC -> Housing / Mortgage
- Walmart -> Groceries & Household
- Costco -> Transportation / Fuel
- Church/Tithing/Donations -> Giving
- Credit card payments/internal transfers -> Transfers, excluded from spending totals
- HELOC logic documented: about $1,350/month interest; ADU remodel capped at about $17,000; remaining HELOC is legacy consolidated debt
- ADU expected rent: $1,550/month starting September 2026

## Run locally

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173

## Next build steps

1. Add SQLite persistence.
2. Add editable merchant/category rules UI.
3. Add budget module.
4. Add debt payoff calculator.
5. Add net worth tracker.
6. Add monthly executive review.
