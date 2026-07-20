import asyncio
import logging
from xml.etree import ElementTree

import httpx

logger = logging.getLogger(__name__)

NEWS_RSS_URL = "https://news.google.com/rss/search"
HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; RivalRadar/1.0)"}

FETCH_TIMEOUT = 8            # per-source timeout (was 15) — tighter tail latency
SCRAPE_BUDGET_SECONDS = 10   # overall cap so one hung source can't stall a request


async def _fetch_news(client: httpx.AsyncClient, company: str) -> str:
    try:
        response = await client.get(
            NEWS_RSS_URL,
            params={"q": company, "hl": "en-US", "gl": "US", "ceid": "US:en"},
            timeout=FETCH_TIMEOUT,
        )
        response.raise_for_status()
        root = ElementTree.fromstring(response.text)
        items = root.findall(".//item")[:10]
        lines = []
        for item in items:
            title = item.findtext("title", "")
            pub_date = item.findtext("pubDate", "")
            if title:
                lines.append(f"{title} ({pub_date})")
        return "\n".join(lines)
    except Exception as e:
        logger.error("news fetch failed: %s", e)
        return ""


async def _fetch_community(client: httpx.AsyncClient, company: str) -> str:
    try:
        response = await client.get(
            HN_SEARCH_URL,
            params={"query": company, "tags": "story", "hitsPerPage": 10},
            timeout=FETCH_TIMEOUT,
        )
        response.raise_for_status()
        hits = response.json().get("hits", [])
        lines = []
        for hit in hits:
            title = hit.get("title") or hit.get("story_title")
            points = hit.get("points")
            if title:
                lines.append(f"{title} ({points} points)")
        return "\n".join(lines)
    except Exception as e:
        logger.error("community fetch failed: %s", e)
        return ""


async def scrape_company(company: str) -> dict:
    news_text, community_text = "", ""
    try:
        async with httpx.AsyncClient(headers=HEADERS) as client:
            news_text, community_text = await asyncio.wait_for(
                asyncio.gather(
                    _fetch_news(client, company),
                    _fetch_community(client, company),
                ),
                timeout=SCRAPE_BUDGET_SECONDS,
            )
    except asyncio.TimeoutError:
        logger.warning("scrape budget exceeded for %s", company)
    except Exception as e:
        logger.error("scrape_company failed: %s", e)

    return {
        "news": news_text,
        "community": community_text,
        "source_count": sum(1 for text in (news_text, community_text) if text),
    }
