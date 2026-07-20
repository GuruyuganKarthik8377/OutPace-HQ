import logging
import time
import traceback

from fastapi import APIRouter, HTTPException

from app.db.vector_store import vector_store
from app.retrieval.reranker import rerank
from app.retrieval.search import retrieve
from app.schemas.models import QueryRequest, QueryResponse, RetrievalResult

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/query", response_model=QueryResponse)
async def query_documents(body: QueryRequest) -> QueryResponse:
    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    if vector_store.index.ntotal == 0:
        return QueryResponse(
            query=query,
            results=[],
            message="No documents indexed yet. Please upload a document first.",
        )

    try:
        t0 = time.perf_counter()
        candidates = retrieve(query)
        t1 = time.perf_counter()
        ranked = rerank(query, candidates)
        t2 = time.perf_counter()
        logger.info(
            "query='%s' | retrieval=%.3fs | rerank=%.3fs | total=%.3fs",
            query[:60],
            t1 - t0,
            t2 - t1,
            t2 - t0,
        )
    except Exception:
        logger.error("Query error:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error during retrieval.")

    results = [
        RetrievalResult(
            text=str(r["text"])[:1500],
            score=float(r["score"]),
            source=str(r["source"]),
            page=int(r["page"]) if r.get("page") is not None else None,
            chunk_id=str(r["chunk_id"]),
        )
        for r in ranked
    ]

    return QueryResponse(query=query, results=results)
