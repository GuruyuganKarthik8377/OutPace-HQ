import logging
import traceback
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, UploadFile

from app.config import UPLOAD_DIR
from app.db.vector_store import vector_store
from app.extraction.document_state import document_state
from app.extraction.field_extractor import extract_fields
from app.ingestion.chunker import chunk_text
from app.ingestion.embedder import embed_docs
from app.ingestion.loader import load_document
from app.retrieval.bm25_index import bm25_index
from app.schemas.models import UploadResponse

logger = logging.getLogger(__name__)

router = APIRouter()

_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


def _reset_all_state() -> None:
    """Wipe every per-document store so the next upload starts clean."""
    vector_store.reset()
    bm25_index.reset()
    document_state.reset()


@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile) -> UploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    ext = Path(file.filename).suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: pdf, docx, txt.",
        )

    doc_id = str(uuid4())
    save_path = Path(UPLOAD_DIR) / f"{doc_id}_{file.filename}"
    save_path.parent.mkdir(parents=True, exist_ok=True)

    chunks: list = []
    pages: list = []
    fields: dict = {}

    try:
        # ---- Step 1: read bytes ----
        raw_bytes = await file.read()
        if not raw_bytes:
            raise HTTPException(status_code=422, detail="Uploaded file is empty.")
        save_path.write_bytes(raw_bytes)
        logger.info("[upload] received bytes=%d filename=%s", len(raw_bytes), file.filename)

        # ---- Step 2: extract text (page.get_text('blocks') for PDFs) ----
        # NOTE: we deliberately do NOT reset existing state until we know the
        # file is processable; otherwise a failed upload would destroy a
        # previously-good index.
        pages = load_document(str(save_path))
        total_chars = sum(len((p.get("text") or "")) for p in pages)
        if not pages or total_chars == 0:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Text extraction failed: no extractable text found. "
                    "If this is a scanned/image-based PDF, OCR is required "
                    "(not yet supported)."
                ),
            )

        # File is good — NOW reset prior state and ingest fresh.
        _reset_all_state()
        logger.info(
            "[upload] extracted text: pages=%d chars=%d",
            len(pages),
            total_chars,
        )

        # ---- Step 3: Layer-1 field extraction over full document ----
        fields = extract_fields(pages)
        logger.info(
            "[upload] structured fields extracted: count=%d keys=%s",
            len(fields),
            list(fields.keys()),
        )

        # ---- Step 4: chunking ----
        chunks = chunk_text(pages, doc_id=doc_id, source=file.filename)
        if not chunks:
            raise HTTPException(
                status_code=422,
                detail="Chunking failed: document produced no usable chunks.",
            )
        logger.info("[upload] chunked: chunks=%d", len(chunks))

        # ---- Step 5: embed + add to FAISS ----
        texts = [c["text"] for c in chunks]
        embeddings = embed_docs(texts)
        if embeddings is None or embeddings.shape[0] != len(chunks):
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Embedding failed: expected {len(chunks)} vectors, "
                    f"got {0 if embeddings is None else embeddings.shape[0]}"
                ),
            )
        vector_store.add(embeddings, chunks)

        # Hard post-condition: index MUST be populated.
        if vector_store.index.ntotal == 0:
            raise HTTPException(
                status_code=500,
                detail="Indexing failed: FAISS index is empty after add().",
            )

        # ---- Step 6: build BM25 sparse index ----
        bm25_index.build(chunks)

        # ---- Step 7: record document state ----
        document_state.set_document(
            doc_id=doc_id,
            filename=file.filename,
            pages=pages,
            fields=fields,
            num_chunks=len(chunks),
        )

        logger.info(
            "[upload] SUCCESS doc=%s chunks=%d index_size=%d bm25_size=%d fields=%d",
            file.filename,
            len(chunks),
            vector_store.index.ntotal,
            bm25_index.size,
            len(fields),
        )

    except HTTPException:
        raise
    except Exception:
        logger.error("Upload error:\n%s", traceback.format_exc())
        # Leave the system stateless on failure.
        _reset_all_state()
        raise HTTPException(status_code=500, detail="Internal server error during ingestion.")
    finally:
        if save_path.exists():
            save_path.unlink()

    return UploadResponse(
        status="indexed",
        doc_id=doc_id,
        filename=file.filename,
        num_chunks=len(chunks),
        num_pages=len(pages),
        extracted_fields={
            k: {"value": v["value"], "page": v.get("page")}
            for k, v in fields.items()
        },
    )
