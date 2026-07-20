from typing import List

import fitz
import docx


def load_document(file_path: str) -> List[dict]:
    """Extract text from PDF, DOCX, or TXT. Returns List[{"text": str, "page": int | None}]."""
    lower = file_path.lower()

    if lower.endswith(".pdf"):
        return _load_pdf(file_path)
    elif lower.endswith(".docx"):
        return _load_docx(file_path)
    elif lower.endswith(".txt"):
        return _load_txt(file_path)
    else:
        raise ValueError(f"Unsupported file type: {file_path}")


def _load_pdf(file_path: str) -> List[dict]:
    """Extract per-page text using block-based extraction.

    ``page.get_text('blocks')`` returns layout-aware blocks
    ``(x0, y0, x1, y1, text, block_no, block_type)`` sorted by reading order
    when ``sort=True`` is passed. This preserves table/column structure far
    better than the default text mode and is critical for invoice fields.
    """
    doc = fitz.open(file_path)
    try:
        pages = []
        for page_num in range(len(doc)):
            blocks = doc[page_num].get_text("blocks", sort=True)
            parts = []
            for b in blocks:
                # block_type == 0 -> text; 1 -> image
                if len(b) >= 7 and b[6] != 0:
                    continue
                text = (b[4] or "").strip() if len(b) >= 5 else ""
                if text:
                    parts.append(text)
            joined = "\n".join(parts).strip()
            if joined:
                pages.append({"text": joined, "page": page_num + 1})
    finally:
        doc.close()
    return pages


def _load_docx(file_path: str) -> List[dict]:
    document = docx.Document(file_path)
    text = "\n".join(p.text for p in document.paragraphs if p.text.strip()).strip()
    if not text:
        return []
    return [{"text": text, "page": None}]


def _load_txt(file_path: str) -> List[dict]:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read().strip()
    except UnicodeDecodeError:
        with open(file_path, "r", encoding="latin-1") as f:
            text = f.read().strip()
    if not text:
        return []
    return [{"text": text, "page": None}]
