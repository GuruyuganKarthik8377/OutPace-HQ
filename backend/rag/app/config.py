from dotenv import load_dotenv
import os

load_dotenv()

CHUNK_SIZE: int = 900
CHUNK_OVERLAP: int = 150

EMBED_MODEL: str = os.getenv("EMBED_MODEL", "BAAI/bge-large-en")
RERANK_MODEL: str = os.getenv("RERANK_MODEL", "BAAI/bge-reranker-large")

TOP_K_RETRIEVAL: int = 40
TOP_K_FINAL: int = 5
# Hard cap on how many candidates get passed to the (slow) cross-encoder
# reranker. On CPU each pair takes ~3 s with bge-reranker-large, so 80
# candidates = ~4 minutes per query. 20 keeps queries under ~1 minute.
RERANK_INPUT_CAP: int = 20

# Hybrid retrieval fusion weight (BM25 vs Dense). RRF k constant.
RRF_K: int = 60

# Threshold below which retrieval is considered "weak" and we trigger
# query expansion + a second retrieval pass.
WEAK_RESULT_RERANK_SCORE: float = 0.35

FAISS_INDEX_PATH: str = os.getenv("FAISS_INDEX_PATH", "data/faiss_index/index.faiss")
METADATA_PATH: str = os.getenv("METADATA_PATH", "data/faiss_index/metadata.pkl")
UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "data/raw_docs")
