from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from app.services.importer import import_transactions_from_uploads
from app.services.analytics import build_dashboard

app = FastAPI(title="Financial Command Center API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

TRANSACTIONS = []

@app.get("/")
def root():
    return {"name": "Financial Command Center", "status": "running"}

@app.post("/api/import")
async def import_files(files: list[UploadFile] = File(...)):
    global TRANSACTIONS
    TRANSACTIONS = await import_transactions_from_uploads(files)
    return {"imported_transactions": len(TRANSACTIONS), "sample": TRANSACTIONS[:5]}

@app.get("/api/transactions")
def get_transactions():
    return TRANSACTIONS

@app.get("/api/dashboard")
def dashboard():
    return build_dashboard(TRANSACTIONS)
