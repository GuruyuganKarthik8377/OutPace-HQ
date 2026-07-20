"""Registers slash commands on the Slack App object.

Import this module once (in main.py) to wire up all commands.
Each command ACKs immediately (required within 3 s by Slack) then
does real work using respond() for follow-up messages.
"""
import logging
import traceback

from slack_bolt.async_app import AsyncApp

from slack.handlers import handle_generate_marketing, handle_regenerate, handle_ask_event

logger = logging.getLogger("slack.commands")


def register_commands(app: AsyncApp) -> None:
    """Attach all slash-command handlers to the given Slack App."""

    # ── /ping — connectivity check, no external calls ────────────────────────
    @app.command("/ping")
    async def ping(ack, command, respond):
        await ack()
        try:
            user = command.get("user_name") or command.get("user_id") or "there"
            logger.info("[/ping] user=%s", user)
            await respond(f"✅ Slack Bot is connected successfully. Hello, @{user}!")
        except Exception:
            logger.error("[/ping] respond() failed:\n%s", traceback.format_exc())

    # ── /ask-event — query the RAG knowledge base ────────────────────────────
    @app.command("/ask-event")
    async def ask_event(ack, command, respond):
        await ack()
        question = command.get("text", "").strip()
        user = command.get("user_name") or command.get("user_id") or "?"
        logger.info("[/ask-event] user=%s text=%r", user, question)
        try:
            await handle_ask_event(question, respond)
        except Exception:
            logger.error("[/ask-event] unhandled exception:\n%s", traceback.format_exc())
            try:
                await respond(":x: An internal error occurred. Check the backend logs.")
            except Exception:
                logger.error("[/ask-event] respond() also failed:\n%s", traceback.format_exc())

    # ── /generate-marketing ──────────────────────────────────────────────────
    @app.command("/generate-marketing")
    async def generate_marketing(ack, command, respond):
        await ack()
        channel = command.get("text", "").strip()
        user = command.get("user_name") or command.get("user_id") or "?"
        logger.info("[/generate-marketing] user=%s channel=%r", user, channel)
        if not channel:
            try:
                await respond(
                    "Usage: `/generate-marketing <channel>`\n"
                    "Supported: `linkedin`, `x`, `instagram`, `email`, `whatsapp`"
                )
            except Exception:
                logger.error("[/generate-marketing] respond() failed:\n%s", traceback.format_exc())
            return
        try:
            await handle_generate_marketing(channel, respond)
        except Exception:
            logger.error("[/generate-marketing] unhandled exception:\n%s", traceback.format_exc())
            try:
                await respond(":x: An internal error occurred. Check the backend logs.")
            except Exception:
                pass

    # ── /regenerate ──────────────────────────────────────────────────────────
    @app.command("/regenerate")
    async def regenerate(ack, command, respond):
        await ack()
        args = command.get("text", "").strip()
        user = command.get("user_name") or command.get("user_id") or "?"
        logger.info("[/regenerate] user=%s args=%r", user, args)
        try:
            await handle_regenerate(args, respond)
        except Exception:
            logger.error("[/regenerate] unhandled exception:\n%s", traceback.format_exc())
            try:
                await respond(":x: An internal error occurred. Check the backend logs.")
            except Exception:
                pass

    logger.info("Slack slash commands registered: /ping, /ask-event, /generate-marketing, /regenerate")
