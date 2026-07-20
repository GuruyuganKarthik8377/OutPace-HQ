from typing import List
from uuid import uuid4

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import CHUNK_SIZE, CHUNK_OVERLAP

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    separators=["\n\n", "\n", ".", " "],
)


def chunk_text(pages: List[dict], doc_id: str, source: str) -> List[dict]:
    """Split page-level dicts into sentence-aware chunks, preserving real page numbers."""
    result = []
    for page_data in pages:
        page_text = page_data["text"]
        page_num = page_data["page"]  # int for PDF, None for DOCX/TXT
        raw_chunks = _splitter.split_text(page_text)
        for chunk in raw_chunks:
            if len(chunk.strip()) < 30:
                continue
            result.append(
                {
                    "chunk_id": str(uuid4()),
                    "doc_id": doc_id,
                    "text": chunk.strip(),
                    "source": source,
                    "page": page_num,
                }
            )
    return result
