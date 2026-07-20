"""
Layer 2: Hybrid retrieval (BM25 + Dense).

Both channels are run independently for the same query and their ranked lists
are fused with Reciprocal Rank Fusion (RRF). RRF avoids having to normalize
heterogeneous score scales (BM25 unbounded positives vs. cosine in [-1,1]).
"""

from __future__ import annotations

import logging
from typing import Dict, List

from app.config import RRF_K, TOP_K_RETRIEVAL
from app.db.vector_store import vector_store
from app.ingestion.embedder import embed_query
from app.retrieval.bm25_index import bm25_index

logger = logging.getLogger(__name__)


def _dense_retrieve(query: str, k: int) -> List[dict]:
    if vector_store.index.ntotal == 0:
        return []
    qv = embed_query(query)
    return vector_store.search(qv, k)


def _sparse_retrieve(query: str, k: int) -> List[dict]:
    return bm25_index.search(query, k)


def _rrf_fuse(
    dense: List[dict],
    sparse: List[dict],
    k_total: int,
    rrf_k: int = RRF_K,
) -> List[dict]:
    """Combine ranked lists with Reciprocal Rank Fusion.

    Each chunk's fused score is sum over channels of 1 / (rrf_k + rank_in_channel).
    Chunks are identified by ``chunk_id``.
    """
    fused: Dict[str, dict] = {}

    def _accumulate(results: List[dict], score_field: str) -> None:
        for rank, entry in enumerate(results, start=1):
            cid = entry.get("chunk_id")
            if not cid:
                continue
            rec = fused.get(cid)
            if rec is None:
                rec = dict(entry)
                rec.setdefault("dense_score", None)
                rec.setdefault("bm25_score", None)
                rec["rrf_score"] = 0.0
                fused[cid] = rec
            rec["rrf_score"] += 1.0 / (rrf_k + rank)
            # Preserve channel scores (without clobbering the other channel).
            if score_field == "dense":
                rec["dense_score"] = float(entry.get("score", 0.0))
            else:
                rec["bm25_score"] = float(entry.get("bm25_score", 0.0))

    _accumulate(dense, "dense")
    _accumulate(sparse, "bm25")

    ranked = sorted(fused.values(), key=lambda r: r["rrf_score"], reverse=True)

    # Normalize "score" field to the fused RRF score so downstream rerank /
    # confidence code keeps working unchanged.
    for r in ranked:
        r["score"] = r["rrf_score"]

    return ranked[:k_total]


def hybrid_retrieve(query: str, k: int = TOP_K_RETRIEVAL) -> List[dict]:
    """Run dense + BM25 retrieval and fuse via RRF. Returns top-k candidates."""
    dense = _dense_retrieve(query, k)
    sparse = _sparse_retrieve(query, k)
    fused = _rrf_fuse(dense, sparse, k_total=k)
    logger.info(
        "hybrid query='%s' | dense=%d sparse=%d fused=%d",
        query[:60],
        len(dense),
        len(sparse),
        len(fused),
    )
    return fused


__all__ = ["hybrid_retrieve"]
