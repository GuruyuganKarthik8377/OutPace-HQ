"""
LLM answer generation module for the RAG system.

Takes a user query and retrieved chunks, builds a strict context-only prompt,
calls the Anthropic Claude API, and returns a structured answer with
confidence and citations.
"""

from typing import List, Dict
import logging
import os
import re
import time

import anthropic

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Client setup
# ---------------------------------------------------------------------------
client = anthropic.Anthropic(
    api_key=os.getenv("ANTHROPIC_API_KEY")
)

# Latest stable Claude 3.5 Sonnet model.
MODEL_NAME = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929")

# Hard upper bound on characters of context sent to the model to avoid
# blowing past the context window on pathological inputs.
MAX_CONTEXT_CHARS = 12000

# Number of chunks fed into the prompt context (max).
MAX_CONTEXT_CHUNKS = 5

# Number of chunks returned as citations (top-ranked only).
MAX_CITATIONS = 3

# Hard cap on returned answer length (characters) for UI safety.
MAX_ANSWER_CHARS = 2000

DONT_KNOW = "I don't know"
FALLBACK_ERROR = "Sorry, I couldn't generate an answer right now. Please try again."

# Generic / filler phrases stripped from the answer prefix.
_GENERIC_PREFIXES = [
    r"^based on the (provided )?context[,:\s-]*",
    r"^according to the (provided )?context[,:\s-]*",
    r"^from the (provided )?context[,:\s-]*",
    r"^the context (states|says|indicates|mentions) that[,:\s-]*",
    r"^as (per|stated in) the context[,:\s-]*",
]


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You are a strict retrieval-based QA system for structured documents (invoices, contracts, reports).

Rules:
- Answer ONLY using the provided context
- Do NOT use external knowledge or general knowledge
- If the answer is not explicitly present in the context, respond EXACTLY: I don't know
- NEVER invent numbers, dates, amounts, or identifiers. Copy them verbatim from the context.
- Prefer concise bullet points when listing facts; otherwise a short paragraph (1-3 sentences)
- Keep answers factual, specific, and minimal — no commentary, no explanation of your reasoning
- Cite sources inline using the format: [source - page]
- Do NOT start the answer with filler like "Based on the context" or "According to the context"
- When asked for a single field (date, amount, number, name), reply with that value plus its citation, nothing else.
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def build_context(chunks: List[Dict]) -> str:
    """Build a labeled context block from the top chunks.

    Each chunk is prefixed with its source/page so the model can produce
    inline ``[source - page]`` citations.
    """
    blocks = []
    for i, c in enumerate(chunks[:MAX_CONTEXT_CHUNKS], start=1):
        src = c.get("source", "unknown")
        page = c.get("page")
        header = f"[{i}] Source: {src}" + (f" | Page: {page}" if page is not None else "")
        blocks.append(f"{header}\n{c['text']}")
    joined = "\n\n---\n\n".join(blocks)
    if len(joined) > MAX_CONTEXT_CHARS:
        joined = joined[:MAX_CONTEXT_CHARS]
    return joined


def build_prompt(query: str, context: str) -> str:
    """Construct the user-facing prompt with context and question."""
    return f"""Context:
{context}

Question:
{query}

Answer:"""


def call_llm(prompt: str) -> str:
    """Call the Claude API and return the text response."""
    response = client.messages.create(
        model=MODEL_NAME,
        max_tokens=500,
        temperature=0,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
    )
    return response.content[0].text.strip()


def _post_process(answer: str) -> str:
    """Clean up the model output: trim generic prefixes, normalize, cap length."""
    if not answer:
        return DONT_KNOW

    cleaned = answer.strip()

    # Strip wrapping quotes if the model produced them.
    if len(cleaned) >= 2 and cleaned[0] in {'"', "'"} and cleaned[-1] == cleaned[0]:
        cleaned = cleaned[1:-1].strip()

    # Strip filler prefixes (case-insensitive, repeat once in case nested).
    for _ in range(2):
        for pat in _GENERIC_PREFIXES:
            new = re.sub(pat, "", cleaned, count=1, flags=re.IGNORECASE)
            if new != cleaned:
                cleaned = new.lstrip()
                break

    if not cleaned:
        return DONT_KNOW

    # Normalize common "unknown" variants.
    low = cleaned.lower().strip(" .!")
    if low in {"", "unknown", "i do not know", "i don't know.", "i don't know"}:
        return DONT_KNOW

    # Capitalize first character for paragraph answers.
    if not cleaned.startswith(("-", "*", "\u2022")) and cleaned[:1].islower():
        cleaned = cleaned[:1].upper() + cleaned[1:]

    if len(cleaned) > MAX_ANSWER_CHARS:
        cleaned = cleaned[: MAX_ANSWER_CHARS - 1].rstrip() + "\u2026"

    return cleaned


def _compute_confidence(answer: str, chunks: List[Dict]) -> float:
    """Heuristic confidence from rerank scores of top-3 chunks."""
    if answer == DONT_KNOW or not chunks:
        return 0.0
    scores = []
    for c in chunks[:3]:
        try:
            scores.append(float(c.get("score", 0.0)))
        except (TypeError, ValueError):
            continue
    if not scores:
        return 0.0
    return round(min(1.0, max(scores)), 4)


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------
def generate_answer(query: str, chunks: List[Dict]) -> Dict:
    """Generate a grounded answer for ``query`` using ``chunks``.

    Returns dict with keys:
        - answer: str
        - confidence: float in [0.0, 1.0]
        - citations: List[{source, page, chunk_id}]  (top-3 ranked chunks)
    """
    if not isinstance(query, str) or not query.strip():
        raise ValueError("Empty query")

    if not chunks:
        return {
            "answer": DONT_KNOW,
            "confidence": 0.0,
            "citations": [],
        }

    # Step 1: build context (max 5 chunks, truncated if too long)
    context = build_context(chunks)

    # Step 2: build prompt
    prompt = build_prompt(query.strip(), context)

    # Step 3: call the LLM with safe fallback on failure
    t0 = time.perf_counter()
    try:
        raw_answer = call_llm(prompt)
    except Exception as exc:
        logger.error("Claude call failed: %s", exc)
        return {
            "answer": FALLBACK_ERROR,
            "confidence": 0.0,
            "citations": [],
        }
    logger.info("llm_time=%.3fs chars=%d", time.perf_counter() - t0, len(raw_answer))

    # Step 4: post-process
    answer = _post_process(raw_answer)

    # Step 5: citations — top-ranked only (not all chunks)
    if answer == DONT_KNOW:
        citations: List[Dict] = []
    else:
        citations = [
            {
                "source": c["source"],
                "page": c.get("page"),
                "chunk_id": c["chunk_id"],
            }
            for c in chunks[:MAX_CITATIONS]
        ]

    # Step 6: confidence
    confidence = _compute_confidence(answer, chunks)

    return {
        "answer": answer,
        "confidence": confidence,
        "citations": citations,
    }


__all__ = [
    "generate_answer",
    "build_context",
    "build_prompt",
    "call_llm",
    "SYSTEM_PROMPT",
    "MODEL_NAME",
    "DONT_KNOW",
]
