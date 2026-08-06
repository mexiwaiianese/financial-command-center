from datetime import date


def _transaction_date(transaction):
    try:
        return date.fromisoformat(str(transaction.get("date", ""))[:10])
    except ValueError:
        return None


def _is_amex_payment(transaction):
    description = str(transaction.get("description", "")).upper()
    return transaction.get("source_account") == "AMEX" and any(
        phrase in description
        for phrase in ["PAYMENT - THANK YOU", "PAYMENT RECEIVED-THANK"]
    )


def _is_afcu_amex_payment(transaction):
    description = str(transaction.get("description", "")).upper()
    return transaction.get("source_account") == "AFCU" and (
        "AMEX EPAYMENT" in description or "AMERICAN EXPRESS" in description
    )


def reconcile_card_payments(transactions, budget=None):
    """Pair card payments across account exports and exclude both ledger sides from spending."""
    amex_payments = [transaction for transaction in transactions if _is_amex_payment(transaction)]
    afcu_payments = [transaction for transaction in transactions if _is_afcu_amex_payment(transaction)]
    used_afcu = set()
    matched_pairs = 0

    for transaction in amex_payments + afcu_payments:
        transaction.update(
            {
                "major_category": "Transfers",
                "subcategory": "Credit Card Payment",
                "is_income": False,
                "is_transfer": True,
                "is_spending": False,
                "reconciliation_status": "unmatched_payment",
            }
        )

    for amex_transaction in amex_payments:
        amex_date = _transaction_date(amex_transaction)
        if not amex_date:
            continue
        amount = round(abs(float(amex_transaction.get("amount", 0))), 2)
        candidates = []
        for index, afcu_transaction in enumerate(afcu_payments):
            afcu_date = _transaction_date(afcu_transaction)
            if index in used_afcu or not afcu_date:
                continue
            if round(abs(float(afcu_transaction.get("amount", 0))), 2) != amount:
                continue
            days_apart = abs((afcu_date - amex_date).days)
            if days_apart <= 5:
                candidates.append((days_apart, index, afcu_transaction))

        if not candidates:
            continue
        _, index, afcu_transaction = min(candidates, key=lambda candidate: candidate[0])
        used_afcu.add(index)
        match_id = f"AMEX-AFCU-{amex_date.isoformat()}-{amount:.2f}"
        for matched_transaction in [amex_transaction, afcu_transaction]:
            matched_transaction["reconciliation_status"] = "matched"
            matched_transaction["reconciliation_match_id"] = match_id
        matched_pairs += 1

    paid_from_accounts = sorted(
        {
            str(row.get("paid_from", "")).strip()
            for row in (budget or [])
            if str(row.get("paid_from", "")).strip()
        }
    )
    return {
        "matched_pairs": matched_pairs,
        "excluded_payment_transactions": len(amex_payments) + len(afcu_payments),
        "unmatched_payments": sum(
            transaction.get("reconciliation_status") == "unmatched_payment"
            for transaction in amex_payments + afcu_payments
        ),
        "budget_payment_accounts": paid_from_accounts,
    }
