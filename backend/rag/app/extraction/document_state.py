"""
Per-document state holder.

The whole system is stateless **per document** — every upload wipes this and
the FAISS / BM25 indexes. We do NOT support multi-document corpora; the user
can only ask about the most recently uploaded file.
"""

from __future__ import annotations

import threading
from typing import Dict, List, Optional


class DocumentState:
    """Holds the currently active document's extracted fields + meta."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.doc_id: Optional[str] = None
        self.filename: Optional[str] = None
        self.num_pages: int = 0
        self.num_chunks: int = 0
        self.full_text: str = ""
        self.pages: List[dict] = []
        self.fields: Dict[str, Dict] = {}

    # ---- mutators ----
    def reset(self) -> None:
        with self._lock:
            self.doc_id = None
            self.filename = None
            self.num_pages = 0
            self.num_chunks = 0
            self.full_text = ""
            self.pages = []
            self.fields = {}

    def set_document(
        self,
        *,
        doc_id: str,
        filename: str,
        pages: List[dict],
        fields: Dict[str, Dict],
        num_chunks: int,
    ) -> None:
        with self._lock:
            self.doc_id = doc_id
            self.filename = filename
            self.pages = pages
            self.num_pages = len(pages)
            self.fields = fields
            self.num_chunks = num_chunks
            self.full_text = "\n\n".join(p.get("text", "") for p in pages)

    # ---- accessors ----
    def get_field(self, field_name: str) -> Optional[Dict]:
        return self.fields.get(field_name)

    def has_document(self) -> bool:
        return self.doc_id is not None

    def summary(self) -> Dict:
        return {
            "doc_id": self.doc_id,
            "filename": self.filename,
            "num_pages": self.num_pages,
            "num_chunks": self.num_chunks,
            "fields": {
                k: {"value": v["value"], "page": v.get("page")}
                for k, v in self.fields.items()
            },
        }


document_state = DocumentState()


__all__ = ["document_state", "DocumentState"]
