"""
Layer-routing for incoming queries.

``route_query(query)`` decides whether the query maps to a structured field
(Layer 1 — deterministic) or should fall through to Layer 2 (hybrid retrieval).
"""

from __future__ import annotations

import re
from typing import Optional


# Each tuple: (regex pattern, field key in document_state.fields)
# Order matters; more specific matches first.
_ROUTES = [
    # invoice number
    (r"\b(?:invoice\s*(?:number|no\.?|id|#)|inv(?:\s|#|\-)?\s*no\.?)\b", "invoice_number"),
    (r"\bwhat\s+(?:is\s+)?the\s+invoice\s+(?:number|id)\b", "invoice_number"),

    # invoice date / issue date
    (r"\b(?:invoice\s*date|date\s*of\s*issue|issue\s*date|billing\s*date)\b", "invoice_date"),
    (r"\bwhen\s+(?:was|is)\s+(?:the\s+)?(?:invoice|it)\s+(?:issued|dated|created)\b", "invoice_date"),

    # due date
    (r"\b(?:due\s*date|payment\s*due|when\s+is\s+(?:it|payment)\s+due)\b", "due_date"),

    # total amount
    (r"\b(?:grand\s*total|total\s*amount|amount\s*due|balance\s*due)\b", "total_amount"),
    (r"\bwhat\s+(?:is\s+)?the\s+total\b", "total_amount"),
    (r"\bhow\s+much\s+(?:is\s+(?:the\s+)?(?:total|invoice|amount\s*due)|do\s+(?:i|we)\s+owe)\b", "total_amount"),

    # subtotal
    (r"\b(?:sub\s*total)\b", "subtotal"),

    # tax
    (r"\b(?:sales\s*tax|tax\s*amount|gst|vat)\b", "tax_amount"),
    (r"\bhow\s+much\s+(?:is\s+the\s+)?tax\b", "tax_amount"),

    # vendor / supplier
    (r"\b(?:vendor|seller|supplier|billed\s*by)\b", "vendor_name"),
    (r"\b(?:who\s+(?:is|sent)\s+the\s+(?:invoice|vendor|seller))\b", "vendor_name"),

    # customer / bill-to
    (r"\b(?:customer|bill\s*to|buyer|client|sold\s*to)\b", "customer_name"),
    (r"\bwho\s+is\s+(?:the\s+)?(?:customer|bill\s*to|buyer)\b", "customer_name"),

    # PO number
    (r"\b(?:po\s*(?:number|no\.?|#)|purchase\s*order\s*(?:number|no\.?|#)?)\b", "po_number"),

    # currency
    (r"\b(?:currency|what\s+currency)\b", "currency"),
]


def route_query(query: str) -> Optional[str]:
    """Map a natural-language query to a structured field key, or ``None``
    when no structured route matches (use hybrid retrieval)."""
    if not query:
        return None
    q = query.lower()
    for pattern, field in _ROUTES:
        if re.search(pattern, q):
            return field
    return None


__all__ = ["route_query"]
