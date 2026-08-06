import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import keyring

from app.core.category_rules import categorize_transaction

SERVICE_NAME = "Financial Command Center Teller"
DATA_DIR = Path(__file__).resolve().parents[2] / "data"
DATABASE_PATH = DATA_DIR / "fcc.sqlite"
TELLER_API = "https://api.teller.io"
MOUNTAIN = ZoneInfo("America/Denver")


def _database():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("""
        CREATE TABLE IF NOT EXISTS teller_enrollments (
            enrollment_id TEXT PRIMARY KEY,
            institution_name TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    connection.execute("""
        CREATE TABLE IF NOT EXISTS teller_transactions (
            transaction_id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    connection.execute("""
        CREATE TABLE IF NOT EXISTS sync_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    return connection


def register_enrollment(enrollment_id: str, institution_name: str, access_token: str):
    if not enrollment_id or not access_token:
        raise ValueError("Teller enrollment ID and access token are required.")
    keyring.set_password(SERVICE_NAME, enrollment_id, access_token)
    with _database() as connection:
        connection.execute(
            "INSERT OR REPLACE INTO teller_enrollments VALUES (?, ?, ?)",
            (enrollment_id, institution_name or "Connected institution", datetime.now(timezone.utc).isoformat()),
        )


def connection_status():
    with _database() as connection:
        enrollments = connection.execute(
            "SELECT enrollment_id, institution_name, created_at FROM teller_enrollments ORDER BY created_at"
        ).fetchall()
        state = dict(connection.execute("SELECT key, value FROM sync_state").fetchall())
    return {
        "configured": bool(os.getenv("TELLER_CERT_PATH") and os.getenv("TELLER_PRIVATE_KEY_PATH")),
        "connected_institutions": [
            {"enrollment_id": row[0], "institution_name": row[1], "created_at": row[2]} for row in enrollments
        ],
        "last_successful_sync": state.get("last_successful_sync"),
        "last_weekend_sync": state.get("last_weekend_sync"),
        "last_sync_error": state.get("last_sync_error"),
    }


def load_transactions():
    with _database() as connection:
        rows = connection.execute("SELECT payload FROM teller_transactions").fetchall()
    return sorted((json.loads(row[0]) for row in rows), key=lambda item: item.get("date", ""), reverse=True)


def _set_state(key: str, value: str):
    with _database() as connection:
        connection.execute("INSERT OR REPLACE INTO sync_state VALUES (?, ?)", (key, value))


def _weekend_key(now):
    iso_year, iso_week, _ = now.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def should_sync_this_weekend(now=None):
    now = now or datetime.now(MOUNTAIN)
    if now.weekday() not in (5, 6):
        return False
    return connection_status().get("last_weekend_sync") != _weekend_key(now)


async def sync_transactions():
    cert_path = os.getenv("TELLER_CERT_PATH")
    key_path = os.getenv("TELLER_PRIVATE_KEY_PATH")
    if not cert_path or not key_path:
        raise RuntimeError("Teller certificate paths are not configured.")

    with _database() as connection:
        enrollments = connection.execute("SELECT enrollment_id FROM teller_enrollments").fetchall()
    if not enrollments:
        raise RuntimeError("No Teller bank accounts are connected.")

    imported = 0
    try:
        for (enrollment_id,) in enrollments:
            token = keyring.get_password(SERVICE_NAME, enrollment_id)
            if not token:
                raise RuntimeError(f"The Keychain token for enrollment {enrollment_id} is missing.")
            async with httpx.AsyncClient(
                base_url=TELLER_API,
                cert=(cert_path, key_path),
                auth=(token, ""),
                timeout=30,
            ) as client:
                accounts_response = await client.get("/accounts")
                accounts_response.raise_for_status()
                for account in accounts_response.json():
                    response = await client.get(f"/accounts/{account['id']}/transactions")
                    response.raise_for_status()
                    for transaction in response.json():
                        normalized = _normalize_transaction(transaction, account)
                        with _database() as connection:
                            connection.execute(
                                "INSERT OR REPLACE INTO teller_transactions VALUES (?, ?, ?)",
                                (transaction["id"], json.dumps(normalized), datetime.now(timezone.utc).isoformat()),
                            )
                        imported += 1
        now = datetime.now(MOUNTAIN)
        _set_state("last_successful_sync", now.isoformat())
        if now.weekday() in (5, 6):
            _set_state("last_weekend_sync", _weekend_key(now))
        _set_state("last_sync_error", "")
        return {"synced_transactions": imported, "transactions": load_transactions()}
    except Exception as error:
        _set_state("last_sync_error", str(error))
        raise


def _normalize_transaction(transaction, account):
    amount = float(transaction.get("amount", 0))
    description = transaction.get("description") or transaction.get("details", {}).get("counterparty", {}).get("name") or "Teller transaction"
    category = categorize_transaction(description, amount)
    return {
        "date": str(transaction.get("date", ""))[:10],
        "description": description,
        "amount": amount,
        "source_file": f"Teller · {account.get('name', 'Account')}",
        "external_id": transaction.get("id"),
        "account_id": account.get("id"),
        "major_category": category.major_category,
        "subcategory": category.subcategory,
        "is_income": bool(category.is_income or amount > 0),
        "is_transfer": bool(category.is_transfer),
        "is_spending": bool(category.is_spending and amount < 0),
        "is_adu_related": bool(category.is_adu_related),
        "notes": category.notes,
    }
