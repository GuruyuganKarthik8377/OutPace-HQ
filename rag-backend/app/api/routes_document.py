from fastapi import APIRouter

from app.extraction.document_state import document_state

router = APIRouter()


@router.get("/document")
def get_document_summary() -> dict:
    """Return metadata + Layer-1 extracted fields for the active document."""
    return document_state.summary()
