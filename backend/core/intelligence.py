import asyncio
import json
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-4-6"

# Reuse one HTTP client across requests so we keep the TLS connection to the
# Anthropic API warm instead of doing a fresh handshake on every call.
_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0))
    return _client

SYSTEM_PROMPT = """You are a competitive intelligence analyst for a GTM team.
Analyze the scraped data provided and return ONLY a raw JSON object.
No backticks. No markdown. No explanation. No preamble.
Just the JSON object and nothing else.

The JSON must follow this exact structure:
{
  "nodes": [
    {"id": "1", "label": "Funding", "data": "specific funding insight here"},
    {"id": "2", "label": "People", "data": "specific hiring insight here"},
    {"id": "3", "label": "Product", "data": "specific product insight here"},
    {"id": "4", "label": "Threat", "data": "specific threat insight here"},
    {"id": "5", "label": "Your Move", "data": "specific recommended action here"}
  ],
  "edges": [
    {"source": "1", "target": "4"},
    {"source": "2", "target": "3"},
    {"source": "3", "target": "4"},
    {"source": "4", "target": "5"}
  ],
  "threatLevel": "HIGH or MEDIUM or LOW",
  "threatBrief": "2-3 sentence summary of the competitive threat",
  "gtmMoves": [
    "Specific GTM action 1",
    "Specific GTM action 2",
    "Specific GTM action 3"
  ]
}

Be specific. Use actual data from the scraped content.
If data is missing for a node, make a reasonable inference and flag it.
threatLevel must be exactly one of: HIGH, MEDIUM, LOW
"""


def get_fallback(company: str) -> dict:
    # Step 1: check for company-specific cache
    cache_path = os.path.join(
        os.path.dirname(__file__), "cache", f"{company.lower().replace(' ', '_')}.json"
    )
    if os.path.exists(cache_path):
        try:
            with open(cache_path) as f:
                return json.load(f)
        except Exception:
            pass

    # Step 2: generic fallback — never shows wrong company data
    return {
        "nodes": [
            {"id": "1", "label": "Funding",
             "data": f"No public funding data found for {company}"},
            {"id": "2", "label": "People",
             "data": f"No hiring signals detected for {company}"},
            {"id": "3", "label": "Product",
             "data": f"No recent product changes found for {company}"},
            {"id": "4", "label": "Threat",
             "data": "Insufficient data to assess threat level"},
            {"id": "5", "label": "Your Move",
             "data": "Conduct manual research on LinkedIn and Crunchbase"}
        ],
        "edges": [
            {"source": "1", "target": "4"},
            {"source": "2", "target": "3"},
            {"source": "3", "target": "4"},
            {"source": "4", "target": "5"}
        ],
        "threatLevel": "LOW",
        "threatBrief": f"Insufficient public data found for {company}. Manual research recommended before engaging this competitor.",
        "gtmMoves": [
            "Search LinkedIn for recent hires and leadership changes",
            "Check Crunchbase for funding history and investors",
            "Review their website changelog and pricing page directly"
        ]
    }


def _line_count(text: str) -> int:
    return len([line for line in (text or "").splitlines() if line.strip()])


def _extract_json(text: str) -> dict:
    """Tolerant JSON parse: strip any markdown fence and grab the outermost
    braces, so a stray wrapper doesn't force an expensive full Claude retry."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.lstrip("`")
        if t[:4].lower() == "json":
            t = t[4:]
    start, end = t.find("{"), t.rfind("}")
    if start != -1 and end != -1 and end > start:
        t = t[start:end + 1]
    return json.loads(t)


async def _call_claude(company: str, scraped_data: dict) -> dict:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY is not set — cannot call Claude")
        raise RuntimeError("ANTHROPIC_API_KEY is not set")

    news_text = scraped_data.get("news") or "No data"
    hn_text = scraped_data.get("community") or "No data"
    news_count = _line_count(scraped_data.get("news", ""))
    hn_count = _line_count(scraped_data.get("community", ""))

    user_message = f"""Analyze this competitor: {company}

SCRAPED DATA:
=== Google News ===
{news_text}

=== Hacker News ===
{hn_text}

DATA QUALITY:
- News articles found: {news_count}
- HN mentions found: {hn_count}

Generate a threat brief for a GTM team competing against {company}. Be specific. Use actual facts from the scraped data. Do not make up funding amounts or hiring numbers not present in the data. If data is thin, say so in the relevant node."""

    response = await _get_client().post(
        ANTHROPIC_API_URL,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": MODEL,
            "max_tokens": 1024,
            # Prompt caching: the system prompt is identical on every call, so
            # marking it cacheable lets the API skip re-processing it and cuts
            # latency/cost on subsequent requests.
            "system": [
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            "messages": [{"role": "user", "content": user_message}],
        },
    )
    response.raise_for_status()
    result = response.json()
    text = result["content"][0]["text"]
    # Tolerant parse (strips fences / extracts outermost braces) so a stray
    # wrapper doesn't force an expensive full retry. The model doesn't support
    # assistant prefill, so this is how we harden JSON extraction.
    return _extract_json(text)


async def generate_intelligence(company: str, scraped_data: dict) -> dict:
    for attempt in range(2):
        try:
            return await _call_claude(company, scraped_data)
        except Exception as e:
            logger.warning("claude attempt %d failed: %s", attempt + 1, e)
            if attempt == 0:
                await asyncio.sleep(0.5)  # brief backoff before the single retry

    return get_fallback(company)
