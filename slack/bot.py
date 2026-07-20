"""Slack App initialisation for OutPace HQ.

Reads credentials from .env — never hardcoded.
The App object is imported by both commands.py (to register commands)
and main.py (to mount the FastAPI endpoint).
"""
import logging
import os
import traceback

from dotenv import load_dotenv
from slack_bolt.async_app import AsyncApp
from slack_bolt.adapter.fastapi.async_handler import AsyncSlackRequestHandler

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger("slack.bot")

SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN", "")
SLACK_SIGNING_SECRET = os.getenv("SLACK_SIGNING_SECRET", "")

if not SLACK_BOT_TOKEN:
    logger.warning("SLACK_BOT_TOKEN not set — Slack integration will not work.")
if not SLACK_SIGNING_SECRET:
    logger.warning("SLACK_SIGNING_SECRET not set — Slack integration will not work.")

app = AsyncApp(
    token=SLACK_BOT_TOKEN or "xoxb-placeholder",
    signing_secret=SLACK_SIGNING_SECRET or "placeholder",
)

handler = AsyncSlackRequestHandler(app)


@app.middleware
async def log_request(logger, body, next):
    cmd = body.get("command") or body.get("type") or "unknown"
    user = body.get("user_name") or body.get("user_id") or "?"
    text = body.get("text", "")
    logger.info("[slack] incoming: command=%s user=%s text=%r", cmd, user, text)
    return await next()


@app.error
async def global_error_handler(error, body, logger):
    logger.error("[slack] unhandled error: %s", error)
    logger.error("[slack] traceback:\n%s", traceback.format_exc())
    logger.error("[slack] body: %s", body)
