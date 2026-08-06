import os
import re
import subprocess
from datetime import date, datetime
from difflib import SequenceMatcher
from tempfile import NamedTemporaryFile

from app.services.analytics import spending_amount
from app.services.budget_mapping import merchant_key


ITEM_CATEGORIES = {
    "Groceries, Shopping": ["milk", "bread", "egg", "cheese", "meat", "produce", "fruit", "vegetable", "cereal", "snack", "grocery"],
    "Household Supplies": ["detergent", "cleaner", "paper towel", "toilet paper", "trash bag", "soap", "shampoo"],
    "Healthcare": ["pharmacy", "vitamin", "medicine", "ibuprofen", "acetaminophen", "prescription"],
    "Clothing": ["shirt", "pants", "shoe", "apparel", "sock", "jacket"],
    "Electronics": ["cable", "charger", "headphone", "battery", "electronics"],
}


def _extract_text(path, content_type):
    if content_type and (content_type.startswith("text/") or content_type == "text/csv"):
        return open(path, "r", encoding="utf-8", errors="replace").read()
    script = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../scripts/receipt_ocr.swift"))
    result = subprocess.run(["/usr/bin/swift", script, path], capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise ValueError(result.stderr.strip() or "Receipt OCR failed.")
    return result.stdout


def _receipt_total(lines):
    candidates = []
    for line in lines:
        amounts = re.findall(r"\$?(-?\d+[,.]\d{2})\b", line.replace(",", ""))
        for value in amounts:
            score = 2 if re.search(r"\b(total|amount due|balance due)\b", line, re.I) else 0
            if re.search(r"\b(subtotal|tax|change|cash)\b", line, re.I):
                score -= 1
            candidates.append((score, float(value.replace(",", ""))))
    if not candidates:
        return None
    best_score = max(score for score, _ in candidates)
    values = [value for score, value in candidates if score == best_score]
    return max(values)


def _receipt_date(text):
    for pattern in [r"\b(\d{1,2}/\d{1,2}/\d{2,4})\b", r"\b(\d{4}-\d{2}-\d{2})\b"]:
        match = re.search(pattern, text)
        if match:
            try:
                return datetime.fromisoformat(match.group(1)).date()
            except ValueError:
                for fmt in ["%m/%d/%Y", "%m/%d/%y"]:
                    try:
                        return datetime.strptime(match.group(1), fmt).date()
                    except ValueError:
                        pass
    return None


def _category_scores(text):
    normalized = text.lower()
    scores = {
        category: sum(normalized.count(keyword) for keyword in keywords)
        for category, keywords in ITEM_CATEGORIES.items()
    }
    return {category: score for category, score in scores.items() if score}


async def analyze_receipt(upload, transactions):
    suffix = os.path.splitext(upload.filename or "receipt.jpg")[1] or ".jpg"
    with NamedTemporaryFile(delete=False, suffix=suffix) as temporary:
        temporary.write(await upload.read())
        path = temporary.name
    try:
        text = _extract_text(path, upload.content_type)
    finally:
        os.unlink(path)

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        raise ValueError("No text could be recognized on this receipt.")
    merchant = lines[0]
    total = _receipt_total(lines)
    receipt_date = _receipt_date(text)
    category_scores = _category_scores(text)
    suggested_category = max(category_scores, key=category_scores.get) if category_scores else None

    matches = []
    receipt_merchant = merchant_key(merchant)
    for transaction in transactions:
        if transaction.get("is_transfer") or transaction.get("is_income"):
            continue
        amount = abs(spending_amount(transaction))
        amount_match = total is None or abs(amount - total) <= 0.05
        transaction_date = date.fromisoformat(str(transaction.get("date"))[:10])
        date_match = receipt_date is None or abs((transaction_date - receipt_date).days) <= 7
        merchant_similarity = SequenceMatcher(None, receipt_merchant, merchant_key(transaction.get("description", ""))).ratio()
        if amount_match and date_match and merchant_similarity >= 0.35:
            confidence = merchant_similarity + (0.35 if total is not None else 0) + (0.15 if receipt_date else 0)
            matches.append((confidence, transaction))
    matches.sort(key=lambda value: value[0], reverse=True)

    matched = matches[0][1] if matches and (len(matches) == 1 or matches[0][0] - matches[1][0] >= 0.1) else None
    if matched:
        matched["receipt_filename"] = upload.filename
        matched["receipt_category_scores"] = category_scores
        if suggested_category:
            matched["category_review_suggestion"] = suggested_category

    return {
        "merchant": merchant,
        "date": receipt_date.isoformat() if receipt_date else None,
        "total": total,
        "suggested_category": suggested_category,
        "category_scores": category_scores,
        "matched_transaction_id": matched.get("id") if matched else None,
        "match_candidates": [
            {
                "transaction_id": transaction.get("id"),
                "description": transaction.get("description"),
                "date": transaction.get("date"),
                "amount": abs(spending_amount(transaction)),
                "confidence": round(confidence, 2),
            }
            for confidence, transaction in matches[:5]
        ],
        "recognized_text": text,
    }
