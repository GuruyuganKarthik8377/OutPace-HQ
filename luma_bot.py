"""Luma event creation via browser automation.

Luma's login is protected by Cloudflare Turnstile and uses a magic-link / OTP
flow — both block headless automation. Solution: run a one-time visible browser
session so you can log in manually, save the browser storage state (cookies +
localStorage), and reuse it for all subsequent headless event-creation runs.

Setup (one time):
    python luma_bot.py --login

Then the backend calls create_luma_event() for every event created in OutPace HQ.
"""
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

logger = logging.getLogger("luma_bot")

LUMA_EMAIL = os.getenv("LUMA_EMAIL", "").strip()
LUMA_HEADLESS = os.getenv("LUMA_HEADLESS", "true").lower() == "true"

_SESSION_FILE = Path(__file__).parent / ".luma_session.json"
LUMA_BASE_URL = "https://lu.ma"


def session_exists() -> bool:
    return _SESSION_FILE.exists() and _SESSION_FILE.stat().st_size > 10


async def login_interactively() -> bool:
    """Open a visible browser so the user can log in to Luma manually.
    Saves the authenticated session to .luma_session.json for future headless use.
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("Playwright not installed. Run: pip install playwright && playwright install chromium")
        return False

    print("\n=== Luma One-Time Login ===")
    print("A browser window will open. Log into your Luma account.")
    print("Once you see your Luma dashboard, press ENTER here to save the session.\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        await page.goto(f"{LUMA_BASE_URL}/signin")

        # Wait until the user presses ENTER (they've completed the login)
        input(">>> Press ENTER after you've logged in and see your Luma dashboard: ")

        # Check we're actually logged in (not on the signin page)
        if "signin" in page.url or "login" in page.url:
            print("Doesn't look like you're logged in yet. Please try again.")
            await browser.close()
            return False

        # Save session state (cookies + localStorage)
        storage = await context.storage_state()
        _SESSION_FILE.write_text(json.dumps(storage))
        print(f"Session saved to {_SESSION_FILE}")
        await browser.close()
        return True


async def _ensure_logged_in(context) -> bool:
    """Verify the saved session is still valid by checking the dashboard."""
    page = await context.new_page()
    await page.goto(f"{LUMA_BASE_URL}/home")
    await page.wait_for_load_state("networkidle", timeout=15000)
    logged_in = "signin" not in page.url and "login" not in page.url
    await page.close()
    return logged_in


async def create_luma_event(name: str, description: str, date: str, venue: str) -> dict:
    """Create a Luma event using the saved browser session.

    Returns:
        {"status": "created", "event_url": "https://lu.ma/..."}
        {"status": "needs_login", "error": "Run: python luma_bot.py --login"}
        {"status": "failed", "error": "..."}
    """
    if not session_exists():
        return {
            "status": "needs_login",
            "error": "No Luma session found. Run: python luma_bot.py --login",
        }

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return {"status": "failed", "error": "Playwright not installed."}

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=LUMA_HEADLESS)
            context = await browser.new_context(storage_state=str(_SESSION_FILE))

            # Verify session is still valid
            if not await _ensure_logged_in(context):
                await browser.close()
                return {
                    "status": "needs_login",
                    "error": "Luma session expired. Run: python luma_bot.py --login",
                }

            page = await context.new_page()

            # --- Navigate to event creation ---
            logger.info("Navigating to Luma event creation...")
            await page.goto(f"{LUMA_BASE_URL}/create")
            await page.wait_for_load_state("networkidle", timeout=15000)
            logger.info("Event creation page URL: %s", page.url)

            # --- Fill event name ---
            name_input = page.locator('input[placeholder*="name" i], input[placeholder*="title" i], [contenteditable="true"]').first
            await name_input.wait_for(timeout=10000)
            await name_input.fill(name)
            logger.info("Filled event name")

            # --- Fill description ---
            try:
                desc = page.locator('textarea, [contenteditable="true"][data-placeholder*="description" i]').first
                await desc.fill(description)
            except Exception:
                logger.warning("Could not fill description (optional — skipping)")

            # --- Fill date/time ---
            try:
                date_btn = page.locator('button:has-text("Date"), button:has-text("When"), [aria-label*="date" i]').first
                await date_btn.click()
                await page.wait_for_timeout(500)
                date_input = page.locator('input[type="date"], input[placeholder*="date" i]').first
                await date_input.fill(date)
            except Exception:
                logger.warning("Could not fill date (optional — skipping)")

            # --- Fill location ---
            try:
                loc = page.locator('input[placeholder*="location" i], input[placeholder*="venue" i], input[placeholder*="place" i]').first
                await loc.fill(venue)
            except Exception:
                logger.warning("Could not fill location (optional — skipping)")

            # --- Submit / Create ---
            logger.info("Submitting event...")
            create_btn = page.locator('button:has-text("Create Event"), button:has-text("Publish"), button:has-text("Save")').first
            await create_btn.click()

            # Wait for the event URL to appear
            try:
                await page.wait_for_url(f"{LUMA_BASE_URL}/**", timeout=20000)
                # Wait until the URL is not the create page
                for _ in range(20):
                    if "/create" not in page.url and "lu.ma" in page.url:
                        break
                    await page.wait_for_timeout(500)
            except Exception:
                pass

            event_url = page.url
            logger.info("Luma event created: %s", event_url)
            await browser.close()

            if "/create" in event_url or "signin" in event_url:
                return {"status": "failed", "error": f"Unexpected final URL: {event_url}"}

            return {"status": "created", "event_url": event_url}

    except Exception as exc:
        logger.error("Luma event creation failed: %s", exc)
        return {"status": "failed", "error": str(exc)[:300]}


if __name__ == "__main__":
    if "--login" in sys.argv:
        success = asyncio.run(login_interactively())
        sys.exit(0 if success else 1)
    else:
        print("Usage: python luma_bot.py --login")
        print("This saves your Luma session so the backend can create events automatically.")
