import logging
import os
import pickle
import threading
from typing import List

import faiss
import numpy as np

from app.config import FAISS_INDEX_PATH, METADATA_PATH

logger = logging.getLogger(__name__)

_EMBED_DIM = 1024


class VectorStore:
    def __init__(
        self,
        index_path: str = FAISS_INDEX_PATH,
        meta_path: str = METADATA_PATH,
    ) -> None:
        self._index_path = index_path
        self._meta_path = meta_path
        self._lock = threading.Lock()
        self.index: faiss.IndexFlatIP = faiss.IndexFlatIP(_EMBED_DIM)
        self.metadata: List[dict] = []

    def add(self, embeddings: np.ndarray, metadata: List[dict]) -> None:
        """Add embeddings and metadata to the store, then persist atomically."""
        if embeddings.shape[0] == 0:
            return
        if embeddings.shape[0] != len(metadata):
            raise ValueError(
                f"Embedding count ({embeddings.shape[0]}) must match "
                f"metadata count ({len(metadata)})"
            )
        with self._lock:
            self.index.add(embeddings.astype(np.float32))
            self.metadata.extend(metadata)
            self._persist()

    def search(self, query_vec: np.ndarray, k: int) -> List[dict]:
        """Return top-k metadata dicts with a 'score' field added."""
        with self._lock:
            total = self.index.ntotal
            if total == 0:
                return []
            effective_k = min(k, total)
            scores, indices = self.index.search(query_vec.astype(np.float32), effective_k)
            results = []
            for score, idx in zip(scores[0], indices[0]):
                if idx == -1:
                    continue
                entry = dict(self.metadata[idx])
                entry["score"] = float(score)
                results.append(entry)
            return results

    def _persist(self) -> None:
        """Write index and metadata to disk. Must be called while self._lock is held."""
        os.makedirs(os.path.dirname(self._index_path), exist_ok=True)
        faiss.write_index(self.index, self._index_path)
        with open(self._meta_path, "wb") as f:
            pickle.dump(self.metadata, f)
        logger.info("VectorStore saved: %d vectors", self.index.ntotal)

    def save(self) -> None:
        """Public thread-safe persist (use for explicit flushes outside add())."""
        with self._lock:
            self._persist()

    def reset(self) -> None:
        """Wipe in-memory index + metadata AND remove persisted files.

        Used on every upload so the system is stateless per document.
        """
        with self._lock:
            self.index = faiss.IndexFlatIP(_EMBED_DIM)
            self.metadata = []
            for path in (self._index_path, self._meta_path):
                try:
                    if os.path.exists(path):
                        os.remove(path)
                except OSError as exc:
                    logger.warning("Could not remove %s during reset: %s", path, exc)
            logger.info("VectorStore reset: index and metadata cleared")

    def load(self) -> None:
        """Load FAISS index and metadata from disk if they exist."""
        if os.path.exists(self._index_path) and os.path.exists(self._meta_path):
            self.index = faiss.read_index(self._index_path)
            with open(self._meta_path, "rb") as f:
                self.metadata = pickle.load(f)
            if self.index.ntotal != len(self.metadata):
                raise RuntimeError(
                    f"FAISS/metadata desync: {self.index.ntotal} vectors "
                    f"but {len(self.metadata)} metadata entries. "
                    "Delete index files and re-index."
                )
            logger.info("VectorStore loaded: %d vectors", self.index.ntotal)
        else:
            logger.info("No persisted VectorStore found — starting fresh.")

    @property
    def total(self) -> int:
        return self.index.ntotal


vector_store = VectorStore()
