import asyncio
import json
import os
import time

from dotenv import load_dotenv

from intelligence import generate_intelligence
from scraper import scrape_company

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")

COMPANIES = ["blinkit", "cashfree", "phonepe", "swiggy", "meesho"]

VALID_THREAT_LEVELS = {"HIGH", "MEDIUM", "LOW"}


def _is_valid_schema(result: dict) -> bool:
    try:
        nodes = result["nodes"]
        if not isinstance(nodes, list) or len(nodes) != 5:
            return False
        for node in nodes:
            if not all(k in node for k in ("id", "label", "data")):
                return False

        if not isinstance(result["edges"], list):
            return False

        if result["threatLevel"] not in VALID_THREAT_LEVELS:
            return False

        if not isinstance(result["threatBrief"], str):
            return False

        gtm_moves = result["gtmMoves"]
        if not isinstance(gtm_moves, list) or len(gtm_moves) != 3:
            return False

        return True
    except (KeyError, TypeError):
        return False


def _cache_path(company: str) -> str:
    return os.path.join(CACHE_DIR, f"{company.lower().replace(' ', '_')}.json")


async def build_one(company: str) -> bool:
    # Step 1: scrape
    try:
        scraped_data = await scrape_company(company)
    except Exception as e:
        print(f"[{company}] SCRAPE ERROR: {e} — skipping")
        return False

    news_text = scraped_data.get("news", "")
    hn_text = scraped_data.get("community", "")
    print(f"[{company}] news: {len(news_text)} chars, hn: {len(hn_text)} chars")

    if len(news_text) + len(hn_text) < 100:
        print(f"[{company}] WARNING: thin data — Claude output may be generic")

    # Step 2: generate intelligence
    try:
        result = await generate_intelligence(company, scraped_data)
    except Exception as e:
        print(f"[{company}] INTELLIGENCE ERROR: {e} — skipping")
        return False

    # Step 3: validate schema
    if not _is_valid_schema(result):
        print(f"[{company}] FAILED — invalid schema, skipping")
        return False

    # Step 4: save
    try:
        with open(_cache_path(company), "w") as f:
            json.dump(result, f, indent=2)
    except Exception as e:
        print(f"[{company}] WRITE ERROR: {e} — skipping")
        return False

    print(f"[{company}] cached successfully — threatLevel: {result['threatLevel']}")
    return True


async def main():
    success = 0
    total = len(COMPANIES)
    started = time.time()

    for index, company in enumerate(COMPANIES):
        if await build_one(company):
            success += 1
        if index < total - 1:
            time.sleep(5)  # avoid rate limiting

    elapsed = time.time() - started
    print(f"Done. {success}/{total} companies cached. (took {elapsed:.0f}s)")


if __name__ == "__main__":
    asyncio.run(main())
