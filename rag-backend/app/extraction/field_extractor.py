"""
Layer 1: Deterministic structured field extraction.

Runs regex + simple rules over the *full* document text to pull out canonical
invoice / structured-document fields. Returns a dict of:
    field_name -> {
        "value": str,               # cleaned value
        "raw_match": str,           # exact substring matched in the document
        "page": int | None,         # 1-based page number of the match
        "pattern": str,             # which regex matched (for debugging)
    }

The goal is near-deterministic (95-99%) answering for these fields with **zero**
LLM involvement. Anything not matched here falls back to hybrid retrieval.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional


# ---------------------------------------------------------------------------
# Field patterns. Order matters: first match wins per field. Each pattern is
# a (regex, post-processor) pair. Post-processors normalize the captured group.
# ---------------------------------------------------------------------------

_IDENTITY = lambda s: s.strip()


def _strip_currency(s: str) -> str:
    s = s.strip()
    s = re.sub(r"^[\$\u20ac\u00a3\u20b9]\s*", "", s)
    s = s.replace(",", "")
    return s


def _normalize_amount(s: str) -> str:
    cleaned = _strip_currency(s)
    # Accept things like "1234.56" or "1234"
    m = re.search(r"\d+(?:\.\d+)?", cleaned)
    return m.group(0) if m else cleaned


def _normalize_date(s: str) -> str:
    return s.strip().rstrip(".,;:")


FIELD_PATTERNS: Dict[str, List[tuple]] = {
    # ---- Invoice / document number ----
    "invoice_number": [
        (r"invoice\s*(?:no\.?|number|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{1,30})", _IDENTITY),
        (r"invoice\s*id\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{1,30})", _IDENTITY),
        (r"\bINV[-\s]?([A-Z0-9\-]{2,20})", lambda s: "INV-" + s.strip()),
    ],

    # ---- Invoice / issue date ----
    "invoice_date": [
        (r"invoice\s*date\s*[:\-]?\s*([0-9]{1,4}[\-\/\.][0-9]{1,2}[\-\/\.][0-9]{1,4})", _normalize_date),
        (r"date\s*of\s*issue\s*[:\-]?\s*([0-9]{1,4}[\-\/\.][0-9]{1,2}[\-\/\.][0-9]{1,4})", _normalize_date),
        (r"issue\s*date\s*[:\-]?\s*([0-9]{1,4}[\-\/\.][0-9]{1,2}[\-\/\.][0-9]{1,4})", _normalize_date),
        (r"billing\s*date\s*[:\-]?\s*([0-9]{1,4}[\-\/\.][0-9]{1,2}[\-\/\.][0-9]{1,4})", _normalize_date),
        (
            r"(?:invoice\s*date|date\s*of\s*issue|issue\s*date)\s*[:\-]?\s*"
            r"([0-9]{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+[0-9]{2,4})",
            _normalize_date,
        ),
        (
            r"(?:invoice\s*date|date\s*of\s*issue|issue\s*date)\s*[:\-]?\s*"
            r"((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+[0-9]{1,2},?\s+[0-9]{2,4})",
            _normalize_date,
        ),
    ],

    # ---- Due date ----
    "due_date": [
        (r"due\s*date\s*[:\-]?\s*([0-9]{1,4}[\-\/\.][0-9]{1,2}[\-\/\.][0-9]{1,4})", _normalize_date),
        (r"payment\s*due\s*[:\-]?\s*([0-9]{1,4}[\-\/\.][0-9]{1,2}[\-\/\.][0-9]{1,4})", _normalize_date),
    ],

    # ---- Total / grand total ----
    "total_amount": [
        (r"grand\s*total\s*[:\-]?\s*[\$\u20ac\u00a3\u20b9]?\s*([0-9][0-9,]*\.\d{2})", _normalize_amount),
        (r"total\s*amount\s*(?:due)?\s*[:\-]?\s*[\$\u20ac\u00a3\u20b9]?\s*([0-9][0-9,]*\.\d{2})", _normalize_amount),
        (r"amount\s*due\s*[:\-]?\s*[\$\u20ac\u00a3\u20b9]?\s*([0-9][0-9,]*\.\d{2})", _normalize_amount),
        (r"\btotal\s*[:\-]?\s*[\$\u20ac\u00a3\u20b9]?\s*([0-9][0-9,]*\.\d{2})", _normalize_amount),
        (r"balance\s*due\s*[:\-]?\s*[\$\u20ac\u00a3\u20b9]?\s*([0-9][0-9,]*\.\d{2})", _normalize_amount),
    ],

    # ---- Subtotal ----
    "subtotal": [
        (r"sub[\-\s]?total\s*[:\-]?\s*[\$\u20ac\u00a3\u20b9]?\s*([0-9][0-9,]*\.\d{2})", _normalize_amount),
    ],

    # ---- Tax ----
    "tax_amount": [
        (r"(?:sales\s*)?tax\s*(?:amount)?\s*[:\-]?\s*[\$\u20ac\u00a3\u20b9]?\s*([0-9][0-9,]*\.\d{2})", _normalize_amount),
        (r"\bgst\s*[:\-]?\s*[\$\u20ac\u00a3\u20b9]?\s*([0-9][0-9,]*\.\d{2})", _normalize_amount),
        (r"\bvat\s*[:\-]?\s*[\$\u20ac\u00a3\u20b9]?\s*([0-9][0-9,]*\.\d{2})", _normalize_amount),
    ],

    # ---- Currency symbol / code ----
    "currency": [
        (r"\b(USD|EUR|GBP|INR|CAD|AUD|JPY|CNY)\b", _IDENTITY),
    ],

    # ---- Vendor / company name ----
    "vendor_name": [
        (r"(?:from|vendor|seller|billed\s*by|company)\s*[:\-]\s*([A-Z][A-Za-z0-9 &\.,'\-]{2,80})", _IDENTITY),
    ],

    # ---- Customer / bill-to ----
    "customer_name": [
        (r"(?:bill\s*to|customer|buyer|client|sold\s*to)\s*[:\-]\s*([A-Z][A-Za-z0-9 &\.,'\-]{2,80})", _IDENTITY),
    ],

    # ---- PO number ----
    "po_number": [
        (r"(?:p\.?o\.?|purchase\s*order)\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{1,30})", _IDENTITY),
    ],
}


# Friendly labels used in answers.
FIELD_LABELS: Dict[str, str] = {
    "invoice_number": "Invoice number",
    "invoice_date": "Invoice date",
    "due_date": "Due date",
    "total_amount": "Total amount",
    "subtotal": "Subtotal",
    "tax_amount": "Tax amount",
    "currency": "Currency",
    "vendor_name": "Vendor",
    "customer_name": "Customer",
    "po_number": "PO number",
}


def _find_page_for_offset(offset: int, page_offsets: List[tuple]) -> Optional[int]:
    """page_offsets is a list of (start, end, page_num) tuples."""
    for start, end, page_num in page_offsets:
        if start <= offset < end:
            return page_num
    return None


def extract_fields(
    pages: List[dict],
) -> Dict[str, Dict]:
    """Run regex extraction over the concatenated document.

    ``pages`` is the list returned by ``app.ingestion.loader.load_document``
    (each item has ``text`` and ``page``).

    Returns dict of field_name -> match info. Only fields that were found are
    included.
    """
    if not pages:
        return {}

    # Build a single corpus and remember per-page offsets so we can map a
    # match back to its 1-based page number.
    sep = "\n\n"
    chunks: List[str] = []
    page_offsets: List[tuple] = []
    cursor = 0
    for p in pages:
        text = p.get("text", "") or ""
        start = cursor
        chunks.append(text)
        cursor += len(text)
        page_offsets.append((start, cursor, p.get("page")))
        chunks.append(sep)
        cursor += len(sep)

    full_text = "".join(chunks)

    results: Dict[str, Dict] = {}

    for field, patterns in FIELD_PATTERNS.items():
        for pattern, normalizer in patterns:
            m = re.search(pattern, full_text, flags=re.IGNORECASE)
            if not m:
                continue
            try:
                raw_value = m.group(1)
            except IndexError:
                raw_value = m.group(0)
            value = normalizer(raw_value)
            if not value:
                continue
            results[field] = {
                "value": value,
                "raw_match": m.group(0).strip(),
                "page": _find_page_for_offset(m.start(), page_offsets),
                "pattern": pattern,
            }
            break  # first matching pattern wins for this field

    return results


__all__ = [
    "extract_fields",
    "FIELD_PATTERNS",
    "FIELD_LABELS",
]
