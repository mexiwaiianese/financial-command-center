import pandas as pd
from tempfile import NamedTemporaryFile
from app.core.category_rules import categorize_transaction

def _detect_col(columns, candidates):
    for c in columns:
        lc = str(c).lower().strip()
        if any(candidate in lc for candidate in candidates):
            return c
    return None

async def import_transactions_from_uploads(files):
    rows = []
    for upload in files:
        with NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
            tmp.write(await upload.read())
            tmp_path = tmp.name
        df = pd.read_csv(tmp_path)
        df.columns = [str(c).strip() for c in df.columns]
        date_col = _detect_col(df.columns, ["date", "posted"])
        desc_col = _detect_col(df.columns, ["description", "merchant", "name", "payee", "memo"])
        amount_col = _detect_col(df.columns, ["amount", "debit", "charge", "transaction"])
        if not (date_col and desc_col and amount_col):
            raise ValueError(f"Could not detect required columns in {upload.filename}. Found: {list(df.columns)}")
        for _, row in df.iterrows():
            try:
                amount = float(str(row.get(amount_col, 0)).replace("$", "").replace(",", "").strip())
            except Exception:
                amount = 0.0
            description = str(row.get(desc_col, "") or "")
            cat = categorize_transaction(description, amount)
            rows.append({
                "date": str(row.get(date_col, "")),
                "description": description,
                "amount": amount,
                "source_file": upload.filename,
                "major_category": cat.major_category,
                "subcategory": cat.subcategory,
                "is_income": cat.is_income,
                "is_transfer": cat.is_transfer,
                "is_spending": cat.is_spending,
                "is_adu_related": cat.is_adu_related,
                "notes": cat.notes,
            })
    return rows
