import math
import os
import hashlib
import re
from io import BytesIO
import pandas as pd
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


def _source_account(filename):
    name = (filename or "").upper()
    if "AMEX" in name or "AMERICAN EXPRESS" in name:
        return "AMEX"
    if "AFCU" in name or "AMERICA FIRST" in name:
        return "AFCU"
    stem = os.path.splitext(os.path.basename(filename or "Unknown Institution"))[0]
    stem = re.sub(r"(?i)^budget sheet \d{4}\s*-\s*", "", stem)
    stem = re.sub(r"(?i)\s*(transactions?|statements?|\d+\s*(year|months?))\s*$", "", stem)
    return stem.strip(" -_") or "Unknown Institution"


def _source_kind(filename, descriptions):
    name = (filename or "").upper()
    if any(keyword in name for keyword in ["AMEX", "AMERICAN EXPRESS", "CREDIT CARD", "MASTERCARD", "VISA", "DISCOVER"]):
        return "credit_card"
    sample = " ".join(str(value).upper() for value in descriptions[:100])
    if any(phrase in sample for phrase in ["PAYMENT - THANK YOU", "PAYMENT RECEIVED-THANK"]):
        return "credit_card"
    return "depository"


def _number(value):
    text = str(value or "").strip()
    if not text or text.lower() == "nan":
        return 0.0
    negative = text.startswith("(") and text.endswith(")")
    text = text.replace("$", "").replace(",", "").replace("(", "").replace(")", "")
    try:
        number = float(text)
    except ValueError:
        return 0.0
    return -number if negative else number


def _transaction_id(source_account, transaction_date, description, amount):
    value = f"{source_account}|{transaction_date}|{description.strip().lower()}|{amount:.2f}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:20]


async def import_transactions_from_uploads(files):
    all_rows = []

    for upload in files:
        suffix = os.path.splitext(upload.filename or "")[1].lower() or ".csv"
        df = _read_table(
            BytesIO(await upload.read()),
            suffix,
            [
                ["date", "posted"],
                ["description", "merchant", "name", "payee", "memo"],
                ["amount", "debit", "credit", "deposit", "withdrawal", "charge", "transaction"],
            ],
        )
        df.columns = [str(c).strip() for c in df.columns]

        date_col = _detect_col(df.columns, ["date", "posted"])
        desc_col = _detect_col(df.columns, ["description", "merchant", "name", "payee", "memo"])
        amount_col = _detect_col(df.columns, ["amount", "transaction amount", "charge"])
        debit_col = _detect_col(df.columns, ["debit", "withdrawal"])
        credit_col = _detect_col(df.columns, ["credit", "deposit"])

        if not date_col or not desc_col or (not amount_col and not debit_col and not credit_col):
            raise ValueError(f"Could not detect required columns in {upload.filename}. Found columns: {list(df.columns)}")

        source_account = _source_account(upload.filename)
        source_kind = _source_kind(upload.filename, df[desc_col].astype(str).tolist())

        for _, row in df.iterrows():
            if amount_col:
                amount = _number(row.get(amount_col, 0))
            else:
                amount = _number(row.get(credit_col, 0)) - abs(_number(row.get(debit_col, 0)))

            if math.isnan(amount):
                amount = 0.0

            description = str(row.get(desc_col, "") or "")
            category = categorize_transaction(description, amount)

            parsed_date = pd.to_datetime(row.get(date_col, ""), errors="coerce")
            if pd.isna(parsed_date):
                continue

            transaction_date = parsed_date.date().isoformat()
            if source_kind == "depository" and amount > 0 and not category.is_transfer:
                category.major_category = "Income"
                category.subcategory = "Other Income"
                category.is_income = True
                category.is_spending = False

            all_rows.append({
                "id": _transaction_id(source_account, transaction_date, description, amount),
                "date": transaction_date,
                "description": clean_value(description),
                "amount": amount,
                "source_file": clean_value(upload.filename),
                "source_account": source_account,
                "source_kind": source_kind,
                "major_category": clean_value(category.major_category),
                "subcategory": clean_value(category.subcategory),
                "is_income": bool(category.is_income),
                "is_transfer": bool(category.is_transfer),
                "is_spending": bool(category.is_spending),
                "is_adu_related": bool(category.is_adu_related),
                "notes": clean_value(category.notes),
            })

    unique_rows = {}
    for row in all_rows:
        key = (
            row["source_account"],
            row["date"],
            row["description"].strip().lower(),
            round(row["amount"], 2),
        )
        unique_rows[key] = row
    return sorted(unique_rows.values(), key=lambda row: row["date"], reverse=True)


def _read_table(path, suffix, required_column_groups=None):
    def read(header=0):
        path.seek(0)
        if suffix in [".xlsx", ".xls"]:
            return pd.read_excel(path, header=header)
        if suffix == ".csv":
            return pd.read_csv(path, header=header)
        raise ValueError("Unsupported file type. Upload CSV or Excel files.")

    df = read()
    if not required_column_groups:
        return df

    def has_required_columns(columns):
        return all(_detect_col(columns, candidates) is not None for candidates in required_column_groups)

    if has_required_columns(df.columns):
        return df

    preview = read(header=None)
    for row_index, row in preview.head(25).iterrows():
        values = [str(value).strip() for value in row.tolist() if not pd.isna(value)]
        if has_required_columns(values):
            return read(header=row_index)

    return df


async def import_budget_from_upload(upload):
    suffix = os.path.splitext(upload.filename or "")[1].lower() or ".csv"
    df = _read_table(
        BytesIO(await upload.read()),
        suffix,
        [
            ["category", "expense", "budget item", "line item", "name"],
            ["monthly budget", "monthly amt", "budgeted", "budget", "monthly amount", "amount"],
        ],
    )
    df.columns = [str(column).strip() for column in df.columns]
    category_col = _detect_col(df.columns, ["category", "expense", "budget item", "line item", "name"])
    subcategory_col = _detect_col(df.columns, ["sub category", "subcategory"])
    paid_from_col = _detect_col(df.columns, ["paid from", "payment account", "account"])
    amount_col = _detect_col(
        df.columns,
        ["monthly budget", "monthly amt", "budgeted", "budget", "monthly amount", "amount"],
    )

    if not category_col or not amount_col:
        raise ValueError(
            f"Could not detect category and budget columns in {upload.filename}. "
            f"Use columns such as Category and Monthly Budget. Found: {list(df.columns)}"
        )

    budget = []
    parent_category = ""
    for _, row in df.iterrows():
        raw_category = clean_value(row.get(category_col, ""))
        if raw_category != "":
            parent_category = str(raw_category).strip()

        raw_subcategory = clean_value(row.get(subcategory_col, "")) if subcategory_col else ""
        category = str(raw_subcategory or parent_category).strip()
        paid_from = clean_value(row.get(paid_from_col, "")) if paid_from_col else ""
        raw_amount = str(row.get(amount_col, "") or "").replace("$", "").replace(",", "").strip()
        try:
            amount = float(raw_amount)
        except (TypeError, ValueError):
            continue
        if category and not math.isnan(amount) and amount >= 0:
            budget.append(
                {
                    "category": category,
                    "parent_category": parent_category,
                    "paid_from": str(paid_from).strip(),
                    "monthly_budget": round(amount, 2),
                }
            )

    if not budget:
        raise ValueError("No valid budget rows were found.")
    return budget
