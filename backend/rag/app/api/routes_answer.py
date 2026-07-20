import logging
import time
import traceback
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.config import WEAK_RESULT_RERANK_SCORE
from app.db.vector_store import vector_store
from app.extraction.document_state import document_state
from app.extraction.field_extractor import FIELD_LABELS
from app.llm.generator import DONT_KNOW, generate_answer
from app.retrieval.hybrid import hybrid_retrieve
from app.retrieval.query_expansion import expand_query
from app.retrieval.reranker import rerank
from app.retrieval.router import route_query
from app.retrieval.validator import is_answer_grounded
from app.schemas.models import QueryRequest

logger = logging.getLogger(__name__)

router = APIRouter()


def _empty_response(query: str, *, answer: str = DONT_KNOW) -> dict:
    return {
        "query": query,
        "answer": answer,
        "confidence": 0.0 if answer == DONT_KNOW else 1.0,
        "citations": [],
        "results": [],
        "source_layer": "none",
    }


def _structured_response(query: str, field_key: str, match: dict) -> dict:
    """Format a Layer-1 (deterministic) answer."""
    label = FIELD_LABELS.get(field_key, field_key.replace("_", " ").title())
    value = match["value"]
    page = match.get("page")
    filename = document_state.filename or "document"
    page_str = f" [page {page}]" if page else ""
    answer = f"{label}: {value}{page_str}"

    citation = {
        "source": filename,
        "page": page,
        "chunk_id": f"field:{field_key}",
    }
    result_row = {
        "text": match.get("raw_match", value),
        "score": 1.0,
        "source": filename,
        "page": page,
        "chunk_id": f"field:{field_key}",
    }
    return {
        "query": query,
        "answer": answer,
        "confidence": 1.0,
        "citations": [citation],
        "results": [result_row],
        "source_layer": "structured",
    }


def _normalize_results(top_chunks: list) -> list:
    return [
        {
            "text": str(c["text"])[:1500],
            "score": float(c.get("score", 0.0)),
            "source": str(c["source"]),
            "page": int(c["page"]) if c.get("page") is not None else None,
            "chunk_id": str(c["chunk_id"]),
        }
        for c in top_chunks
    ]


@router.post("/answer")
def answer_query(request: QueryRequest) -> dict:
    """3-layer pipeline: structured field -> hybrid retrieve+rerank -> LLM (validated)."""
    query = request.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Empty query")

    # ----- Layer 1: deterministic field routing --------------------------
    if document_state.has_document():
        field_key = route_query(query)
        if field_key:
            match = document_state.get_field(field_key)
            if match:
                logger.info(
                    "answer query='%s' | layer=structured field=%s value=%s",
                    query[:60],
                    field_key,
                    match["value"],
                )
                return _structured_response(query, field_key, match)
            else:
                logger.info(
                    "structured route '%s' had no extracted match; falling through to RAG",
                    field_key,
                )

    # Safe fallback: no documents indexed yet
    if vector_store.index.ntotal == 0:
        logger.warning("answer query='%s' rejected: index empty (no document)", query[:60])
        return {
            "query": query,
            "answer": "System not ready. Please upload a document first.",
            "confidence": 0.0,
            "citations": [],
            "results": [],
            "source_layer": "none",
        }

    # ----- Layer 2: hybrid retrieve (BM25 + dense) + rerank ----------------
    try:
        t0 = time.perf_counter()
        candidates = hybrid_retrieve(query)
        t1 = time.perf_counter()
    except Exception:
        logger.error("Retrieval error:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail="Retrieval failed")

    logger.info(
        "[answer] QUERY='%s' RETRIEVED=%d (dense+bm25 fused)",
        query[:80],
        len(candidates),
    )

    if not candidates:
        logger.warning("[answer] retrieval returned 0 candidates for '%s'", query[:60])
        return _empty_response(query)

    try:
        ranked = rerank(query, candidates)
        top_chunks = ranked[:5]
        t2 = time.perf_counter()
    except Exception:
        logger.error("Rerank error:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail="Rerank failed")

    if not top_chunks:
        return _empty_response(query)

    for i, c in enumerate(top_chunks, start=1):
        logger.info(
            "[answer] CHUNK %d score=%.4f source=%s page=%s text='%s'",
            i,
            float(c.get("score", 0.0)),
            c.get("source"),
            c.get("page"),
            (c.get("text") or "")[:200].replace("\n", " "),
        )

    # ----- Multi-pass: if rerank top-1 is weak, retry with expanded query --
    top_score = float(top_chunks[0].get("score", 0.0))
    expanded_used = False
    if top_score < WEAK_RESULT_RERANK_SCORE:
        expanded = expand_query(query)
        if expanded != query:
            try:
                extra = hybrid_retrieve(expanded)
                # Merge by chunk_id, keeping the higher RRF score.
                merged: dict = {c["chunk_id"]: c for c in candidates}
                for c in extra:
                    cid = c["chunk_id"]
                    if cid not in merged or c.get("score", 0) > merged[cid].get("score", 0):
                        merged[cid] = c
                ranked2 = rerank(query, list(merged.values()))
                if ranked2 and float(ranked2[0].get("score", 0.0)) > top_score:
                    top_chunks = ranked2[:5]
                    top_score = float(top_chunks[0].get("score", 0.0))
                    expanded_used = True
                    logger.info("multi-pass improved top_score to %.3f", top_score)
            except Exception:
                logger.warning(
                    "multi-pass retrieval failed (non-fatal):\n%s",
                    traceback.format_exc(),
                )
    t_after_expand = time.perf_counter()

    # ----- Layer 3: LLM answer (with validation) ---------------------------
    try:
        result = generate_answer(query, top_chunks)
        t3 = time.perf_counter()
        logger.info(
            "answer query='%s' | layer=rag retrieve=%.3fs rerank=%.3fs "
            "expand=%.3fs llm=%.3fs total=%.3fs expanded=%s",
            query[:60],
            t1 - t0,
            t2 - t1,
            t_after_expand - t2,
            t3 - t_after_expand,
            t3 - t0,
            expanded_used,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.error("LLM error:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail="LLM generation failed")

    answer = result["answer"]
    confidence = result.get("confidence", 0.0)
    citations = result["citations"]

    # ----- Validation: answer must be grounded in retrieved text -----------
    if answer != DONT_KNOW and not is_answer_grounded(answer, top_chunks):
        logger.warning(
            "validation rejected answer (not grounded): '%s'", answer[:120]
        )
        answer = DONT_KNOW
        confidence = 0.0
        citations = []

    return {
        "query": query,
        "answer": answer,
        "confidence": confidence,
        "citations": citations,
        "results": _normalize_results(top_chunks),
        "source_layer": "rag",
    }
