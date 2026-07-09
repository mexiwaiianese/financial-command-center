import math
import pandas as pd
from tempfile import NamedTemporaryFile
from app.core.category_rules import categorize_transaction


def clean_value(value):
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return value


def _detect_col(columns, candidates):
    for c in columns:
        lc = str(c).lower().strip()
        if any(candidate in lc for candidate in candidates):
            return c
    return None


async def import_transactions_from_uploads(files):
    all_rows = []

    for upload in files:
        with NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
            tmp.write(await upload.read())
            tmp_path = tmp.name

        df = pd.read_csv(tmp_path)
        df.columns = [str(c).strip() for c in df.columns]

        date_col = _detect_col(df.columns, ["date", "posted"])
        desc_col = _detect_col(df.columns, ["description", "merchant", "name", "payee", "memo"])
        amount_col = _detect_col(df.columns, ["amount", "debit", "charge", "transaction"])

        if not date_col or not desc_col or not amount_col:
            raise ValueError(f"Could not detect required columns in {upload.filename}. Found columns: {list(df.columns)}")

        for _, row in df.iterrows():
            raw_amount = row.get(amount_col, 0)

            try:
                amount = float(str(raw_amount).replace("$", "").replace(",", "").strip())
            except Exception:
                amount = 0.0

            if math.isnan(amount):
                amount = 0.0

            description = str(row.get(desc_col, "") or "")
            category = categorize_transaction(description, amount)

            all_rows.append({
                "date": clean_value(str(row.get(date_col, ""))),
                "description": clean_value(description),
                "amount": amount,
                "source_file": clean_value(upload.filename),
                "major_category": clean_value(category.major_category),
                "subcategory": clean_value(category.subcategory),
                "is_income": bool(category.is_income),
                "is_transfer": bool(category.is_transfer),
                "is_spending": bool(category.is_spending),
                "is_adu_related": bool(category.is_adu_related),
                "notes": clean_value(category.notes),
            })

    return all_rows