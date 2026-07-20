import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_answer import router as answer_router
from app.api.routes_document import router as document_router
from app.api.routes_query import router as query_router
from app.api.routes_upload import router as upload_router
from app.db.vector_store import vector_store
from app.retrieval.bm25_index import bm25_index

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path("data/raw_docs").mkdir(parents=True, exist_ok=True)
    Path("data/faiss_index").mkdir(parents=True, exist_ok=True)

    try:
        vector_store.load()
        logger.info("FAISS index ready: %d vectors", vector_store.index.ntotal)
        # Rebuild BM25 sparse index from the persisted chunk metadata so the
        # hybrid retriever has both channels available immediately on boot.
        if vector_store.metadata:
            bm25_index.build(vector_store.metadata)
    except RuntimeError as exc:
        logger.error("Index integrity error on startup: %s", exc)
        raise
    except Exception as exc:
        logger.warning("Could not load existing index (%s) — starting fresh", exc)

    try:
        from app.ingestion.embedder import embed_query
        test_vec = embed_query("startup test")
        assert test_vec.shape == (1, 1024), f"Unexpected embedding shape: {test_vec.shape}"
        logger.info("Embedding model OK — shape %s", test_vec.shape)
    except Exception as exc:
        logger.error("Embedding model validation failed: %s", exc)
        raise

    yield
    logger.info("Shutting down — index state preserved on disk")


app = FastAPI(title="RAG Retrieval API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)
app.include_router(document_router)
app.include_router(query_router)
app.include_router(answer_router)
