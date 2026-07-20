"""
BM25 sparse retrieval index (lexical channel of hybrid retrieval).

We keep an in-memory BM25 over the chunks of the currently active document.
This is rebuilt on every upload (the system is stateless per document) and
queried in parallel with the dense FAISS index.
"""

from __future__ import annotations

import logging
import re
import threading
from typing import List, Optional

from rank_bm25 import BM25Okapi

logger = logging.getLogger(__name__)


_STOPWORDS = {
    "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "for", "from",
    "by", "with", "is", "are", "was", "were", "be", "been", "being", "this",
    "that", "these", "those", "it", "as", "its", "their", "they", "them",
    "our", "your", "his", "her", "i", "we", "you", "he", "she", "do", "does",
    "did", "the",
}


def _tokenize(text: str) -> List[str]:
    tokens = re.findall(r"[a-z0-9][a-z0-9'\-/.]{0,}", text.lower())
    return [t for t in tokens if t not in _STOPWORDS and len(t) > 1]


class BM25Index:
    """Thread-safe in-memory BM25 over a list of chunks."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._bm25: Optional[BM25Okapi] = None
        self._chunks: List[dict] = []

    # ---- index build ----
    def build(self, chunks: List[dict]) -> None:
        """Build BM25 from scratch over ``chunks`` (replaces any prior index)."""
        with self._lock:
            self._chunks = list(chunks)
            tokenized = [_tokenize(c.get("text", "")) for c in self._chunks]
            # rank_bm25 chokes on a fully empty corpus; guard.
            if not tokenized or all(len(t) == 0 for t in tokenized):
                self._bm25 = None
                logger.warning("BM25 build skipped: no usable tokens")
                return
            self._bm25 = BM25Okapi(tokenized)
            logger.info("BM25 index built: %d chunks", len(self._chunks))

    def reset(self) -> None:
        with self._lock:
            self._bm25 = None
            self._chunks = []
            logger.info("BM25 index reset")

    # ---- query ----
    def search(self, query: str, k: int) -> List[dict]:
        """Return top-k chunks by BM25 score. Each dict has a 'bm25_score' field."""
        with self._lock:
            if self._bm25 is None or not self._chunks:
                return []
            tokens = _tokenize(query)
            if not tokens:
                return []
            scores = self._bm25.get_scores(tokens)
            # argsort descending
            order = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
            results: List[dict] = []
            for idx in order[:k]:
                if scores[idx] <= 0:
                    continue
                entry = dict(self._chunks[idx])
                entry["bm25_score"] = float(scores[idx])
                results.append(entry)
            return results

    @property
    def size(self) -> int:
        return len(self._chunks)


bm25_index = BM25Index()


__all__ = ["bm25_index", "BM25Index"]
