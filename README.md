# Financial Command Center

A local-first personal finance dashboard for household cash flow, budgeting, debt, net worth planning, and ADU/rental tracking.

## Presentation beta

The default frontend route is a self-contained, seeded demo of the Financial Command Center. It uses fictional household data, does not connect to Teller, and does not require bank credentials or API secrets. The original import, categorization, planning, and account-management workspace remains available from **Data workspace** or at `http://localhost:5173/?workspace=1`.

### Launch on Windows (PowerShell)

Open two PowerShell windows from the repository root.

Backend (needed for the original data workspace):

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` for the beta. The presentation demo itself is frontend-only and remains usable if Teller is not configured.

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

## Teller bank sync

FCC supports secure Teller Connect enrollments and a once-per-weekend catch-up sync. When the backend starts on Saturday or Sunday in `America/Denver`, it syncs if that weekend has not already completed successfully.

1. Create a Teller developer application and download its certificate and private key.
2. Copy `backend/.env.example` to `backend/.env` and enter the absolute certificate paths.
3. Copy `frontend/.env.example` to `frontend/.env.local` and enter the public Teller application ID.
4. Restart FCC and use **Connect Bank**. Access tokens are stored in macOS Keychain; bank credentials never enter FCC.
5. After confirming a manual sync, run `scripts/install_weekend_sync_macos.sh` to start the backend at login. The backend checks the local weekend marker and syncs only once per weekend.

Teller transactions and sync markers are persisted in the ignored local database at `backend/data/fcc.sqlite`.
