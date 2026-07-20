"""Robust HuggingFace model pre-fetch with retries.

Downloads only what the RAG pipeline actually needs:
- BAAI/bge-reranker-large (reranker)
- BAAI/bge-large-en (embedder)

Skips duplicate weight formats (safetensors / onnx) to halve the bytes.
Retries on transient stalls.
"""

from __future__ import annotations

import os
import sys
import time

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

from huggingface_hub import snapshot_download

ALLOW = [
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.txt",
    "special_tokens_map.json",
    "sentencepiece.bpe.model",
    "pytorch_model.bin",
    "1_Pooling/*",
    "modules.json",
    "sentence_bert_config.json",
]

IGNORE = ["*.safetensors", "*.onnx", "*.msgpack", "*.h5", "*flax*", "*.ot"]


def fetch(repo: str, max_attempts: int = 8) -> str:
    last_err: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            print(f"[{repo}] attempt {attempt}/{max_attempts}", flush=True)
            path = snapshot_download(
                repo,
                allow_patterns=ALLOW,
                ignore_patterns=IGNORE,
                max_workers=2,
                etag_timeout=30,
            )
            print(f"[{repo}] OK -> {path}", flush=True)
            return path
        except Exception as exc:
            last_err = exc
            print(f"[{repo}] attempt {attempt} failed: {exc!r}", flush=True)
            time.sleep(min(5 * attempt, 30))
    raise RuntimeError(f"Failed to fetch {repo} after {max_attempts} attempts: {last_err}")


def main() -> int:
    for repo in ("BAAI/bge-reranker-large", "BAAI/bge-large-en"):
        fetch(repo)
    print("All models cached successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
