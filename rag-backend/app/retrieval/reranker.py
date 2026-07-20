import logging
import math
import time
from typing import List

from FlagEmbedding import FlagReranker

from app.config import RERANK_INPUT_CAP, RERANK_MODEL, TOP_K_FINAL

logger = logging.getLogger(__name__)

reranker = FlagReranker(RERANK_MODEL, use_fp16=True)


def rerank(query: str, candidates: List[dict], top_n: int = TOP_K_FINAL) -> List[dict]:
    """Rerank candidates with bge-reranker-large and return top_n results.

    The cross-encoder is the slowest stage on CPU, so we cap the input pool
    at RERANK_INPUT_CAP. Candidates entering this function should already be
    ordered by hybrid (RRF) score so truncation keeps the strongest signals.
    """
    if not candidates:
        return []

    pool = candidates[:RERANK_INPUT_CAP]
    pairs = [[query, c["text"]] for c in pool]

    t0 = time.perf_counter()
    raw_scores = reranker.compute_score(pairs)
    elapsed = time.perf_counter() - t0
    logger.info(
        "[rerank] pairs=%d (capped from %d) elapsed=%.2fs",
        len(pool),
        len(candidates),
        elapsed,
    )

    if isinstance(raw_scores, (int, float)):
        raw_scores = [raw_scores]

    for i, raw in enumerate(raw_scores):
        raw_clipped = max(min(float(raw), 20.0), -20.0)
        pool[i]["score"] = round(1 / (1 + math.exp(-raw_clipped)), 4)

    ranked = sorted(pool, key=lambda x: x["score"], reverse=True)
    return ranked[:top_n]
