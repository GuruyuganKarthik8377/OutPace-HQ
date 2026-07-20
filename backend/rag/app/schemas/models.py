from typing import Dict, List, Optional

from pydantic import BaseModel


class QueryRequest(BaseModel):
    query: str


class RetrievalResult(BaseModel):
    text: str
    score: float
    source: str
    page: Optional[int] = None
    chunk_id: str


class QueryResponse(BaseModel):
    query: str
    results: List[RetrievalResult]
    message: Optional[str] = None


class ExtractedField(BaseModel):
    value: str
    page: Optional[int] = None


class UploadResponse(BaseModel):
    status: str
    doc_id: str
    filename: str
    num_chunks: int
    num_pages: int = 0
    extracted_fields: Dict[str, ExtractedField] = {}
