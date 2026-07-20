"""
Post-LLM validation: ensure the answer is actually grounded in the retrieved
context. If the answer cannot be substantiated, downgrade to "I don't know".
"""

from __future__ import annotations

import re
from typing import List


_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "for",
    "from", "by", "with", "is", "are", "was", "were", "be", "been", "being",
    "this", "that", "these", "those", "it", "as", "its", "their", "they",
    "them", "our", "your", "his", "her", "i", "we", "you", "he", "she", "do",
    "does", "did", "can", "could", "should", "would", "will", "may", "might",
    "also", "than", "about", "into", "over", "under", "any", "some", "no",
    "not", "if", "then", "so", "such", "more", "answer", "based", "context",
    "per", "page",
}


def _content_tokens(text: str) -> List[str]:
    tokens = re.findall(r"[a-z0-9][a-z0-9'\-]*", text.lower())
    return [t for t in tokens if t not in _STOPWORDS and len(t) > 2]


_CITATION_RE = re.compile(r"\[[^\[\]]+\]")


def _strip_citations(answer: str) -> str:
    """Remove inline `[source - page]` markers so they aren't validated."""
    return _CITATION_RE.sub(" ", answer)


def is_answer_grounded(
    answer: str,
    retrieved_chunks: List[dict],
    min_overlap: float = 0.5,
) -> bool:
    """Heuristic check: at least ``min_overlap`` of the answer's content tokens
    appear in the retrieved chunks. Also accepts any numeric token (dates,
    amounts, IDs) appearing verbatim, which is what matters for invoices.
    """
    if not answer or not retrieved_chunks:
        return False

    # Allow "I don't know" through untouched.
    if answer.strip().lower().startswith("i don't know"):
        return True

    # Strip citation markers — they reference filenames/pages, not content,
    # and the corpus won't contain "test_invoice.txt".
    body = _strip_citations(answer)

    corpus = "\n".join(c.get("text", "") for c in retrieved_chunks).lower()

    # Hard rule: every number / ID in the answer body must appear in the corpus.
    numbers = re.findall(r"[A-Z0-9]+(?:[-/\.][A-Z0-9]+)+|\d[\d,]*\.?\d*", body)
    for n in numbers:
        if n.lower().strip(".,") not in corpus:
            return False

    tokens = _content_tokens(body)
    if not tokens:
        return True  # only numeric / no content tokens — already verified above

    matched = sum(1 for t in tokens if t in corpus)
    ratio = matched / len(tokens)
    return ratio >= min_overlap


__all__ = ["is_answer_grounded"]
