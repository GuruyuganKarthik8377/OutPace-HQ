"""
Light-weight synonym-based query expansion.

Used for the second retrieval pass when the first pass returns weak results.
Kept deliberately small and deterministic — no LLM-driven expansion.
"""

from __future__ import annotations

import re
from typing import List

EXPANSIONS = {
    "invoice date": ["date of issue", "billing date", "issue date"],
    "issue date": ["invoice date", "date of issue"],
    "date of issue": ["invoice date", "billing date"],
    "total": ["amount", "grand total", "total amount", "amount due", "balance due"],
    "grand total": ["total", "total amount", "amount due"],
    "amount": ["total", "amount due", "balance due"],
    "invoice number": ["invoice no", "invoice id", "invoice #", "inv no"],
    "due date": ["payment due", "due on"],
    "tax": ["sales tax", "gst", "vat"],
    "vendor": ["seller", "from", "company", "billed by"],
    "customer": ["bill to", "buyer", "client", "sold to"],
    "po": ["purchase order", "po number"],
}


def expand_query(query: str) -> str:
    """Return ``query`` with synonyms appended (deduped, preserves original)."""
    q_lower = query.lower()
    extra: List[str] = []
    seen = set()
    for trigger, synonyms in EXPANSIONS.items():
        if trigger in q_lower:
            for s in synonyms:
                if s not in seen and s not in q_lower:
                    seen.add(s)
                    extra.append(s)
    if not extra:
        return query
    # Append synonyms separated by spaces — both BM25 tokenizer and dense
    # embedder handle this fine.
    return query.strip() + " " + " ".join(extra)


__all__ = ["expand_query", "EXPANSIONS"]
