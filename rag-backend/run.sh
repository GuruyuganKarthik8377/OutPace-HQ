#!/usr/bin/env bash
# Starts the RAG service on port 8001 (what ConciergeChat.jsx expects).
# The three OpenMP/tokenizers env vars work around a macOS-only segfault
# that happens when the reranker (FlagEmbedding/torch) runs after the
# embedder (sentence-transformers) in the same process — faiss, torch, and
# tokenizers each bundle their own OpenMP runtime. Set here (not just in
# .env) so they're guaranteed to apply before any native library loads.
set -euo pipefail
cd "$(dirname "$0")"
source .venv/bin/activate
export KMP_DUPLICATE_LIB_OK=TRUE
export OMP_NUM_THREADS=1
export TOKENIZERS_PARALLELISM=false
exec python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
