import logging
import time
from typing import List

import numpy as np
from sentence_transformers import SentenceTransformer

from app.config import EMBED_MODEL

logger = logging.getLogger(__name__)

model = SentenceTransformer(EMBED_MODEL)

_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


def embed_docs(texts: List[str], batch_size: int = 64) -> np.ndarray:
    """Batch-encode document chunks with L2 normalization. No prefix applied. Returns shape (n, 1024)."""
    n = len(texts)
    t0 = time.perf_counter()
    logger.info("[embed] starting: %d chunks, batch_size=%d", n, batch_size)
    embeddings = model.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
        batch_size=batch_size,
        convert_to_numpy=True,
    )
    elapsed = time.perf_counter() - t0
    rate = n / elapsed if elapsed > 0 else 0.0
    logger.info(
        "[embed] done: %d chunks in %.2fs (%.2f chunks/sec)", n, elapsed, rate
    )
    return np.asarray(embeddings, dtype=np.float32)


def embed_query(query: str) -> np.ndarray:
    """Encode a single query with the BGE retrieval prefix. Returns shape (1, 1024)."""
    text = _QUERY_PREFIX + query.strip()
    embedding = model.encode(
        [text],
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return np.array(embedding, dtype=np.float32)
