from typing import List

from app.config import TOP_K_RETRIEVAL
from app.db.vector_store import vector_store
from app.ingestion.embedder import embed_query


def retrieve(query: str, k: int = TOP_K_RETRIEVAL) -> List[dict]:
    """Embed query and return top-k candidate chunks from the vector store."""
    query_vec = embed_query(query)
    return vector_store.search(query_vec, k)
