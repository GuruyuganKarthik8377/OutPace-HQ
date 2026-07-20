"""Slack slash-command handlers for OutPace HQ.

These handlers call the EXISTING backend endpoints — they do NOT reimplement
any RAG, embedding, marketing or event logic.

Existing endpoints used:
  POST http://127.0.0.1:8001/answer              → RAG (FAISS + Claude)
  POST http://127.0.0.1:8000/events/{id}/marketing → Marketing generator
  GET  http://127.0.0.1:8000/events/latest        → Latest event metadata
"""
import logging
import os
import traceback
from typing import Optional

import httpx

logger = logging.getLogger("slack.handlers")

EVENT_BACKEND = os.getenv("EVENT_BACKEND_URL", "http://127.0.0.1:8000")
RAG_BACKEND = os.getenv("RAG_BACKEND_URL", "http://127.0.0.1:8001")

VALID_CHANNELS = {"linkedin", "x", "instagram", "email", "whatsapp"}
VALID_TONES = {"professional", "friendly", "corporate", "student", "fun"}

CHANNEL_DISPLAY = {
    "linkedin": "LinkedIn",
    "x": "X (Twitter)",
    "instagram": "Instagram",
    "email": "Email",
    "whatsapp": "WhatsApp",
}


async def _safe_respond(respond, message: str) -> None:
    """Call respond() with a plain text fallback — never raises."""
    try:
        await respond(message)
    except Exception:
        logger.error("[slack] respond() failed: %s", traceback.format_exc())


async def _get_latest_event() -> Optional[dict]:
    """Fetch the most recently created event from the backend."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"{EVENT_BACKEND}/events/latest")
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        logger.error("Could not fetch latest event: %s", traceback.format_exc())
    return None


async def handle_ask_event(question: str, respond) -> None:
    """
    /ask-event <question>

    Phase 1 (current): echo the question back so connectivity can be verified.
    Phase 2: query the RAG service once echo is confirmed working.
    """
    logger.info("[ask-event] question=%r", question)

    if not question:
        await _safe_respond(respond, "Usage: `/ask-event <your question>`\nExample: `/ask-event Where is parking?`")
        return

    # ── Phase 1: echo ──────────────────────────────────────────────────────
    # Confirm end-to-end Slack connectivity before calling the RAG service.
    # Once /ping and this echo work, switch to Phase 2 below.
    await _safe_respond(respond, f"Received question:\n{question}")

    # ── Phase 2: RAG (uncomment once echo is confirmed) ────────────────────
    # await _safe_respond(respond, ":thinking_face: Looking that up...")
    # try:
    #     async with httpx.AsyncClient(timeout=60) as client:
    #         resp = await client.post(f"{RAG_BACKEND}/answer", json={"query": question})
    #         logger.info("[ask-event] RAG status=%d", resp.status_code)
    #         if resp.status_code != 200:
    #             await _safe_respond(respond, f":warning: RAG service returned {resp.status_code}.")
    #             return
    #         data = resp.json()
    #         answer = data.get("answer", "").strip()
    #         if not answer or answer.lower().startswith("i don"):
    #             await _safe_respond(respond,
    #                 ":mag: I couldn't find that in the event knowledge base.\n"
    #                 "Make sure an event document has been uploaded in the Ask Event tab."
    #             )
    #             return
    #         citations = data.get("citations", [])
    #         blocks = [{"type": "section", "text": {"type": "mrkdwn", "text": f"*Answer*\n{answer}"}}]
    #         if citations:
    #             sources = ", ".join(
    #                 f"{c.get('source','doc')}" + (f" (p. {c['page']})" if c.get("page") else "")
    #                 for c in citations[:3]
    #             )
    #             blocks.append({
    #                 "type": "context",
    #                 "elements": [{"type": "mrkdwn", "text": f":books: Source: {sources}"}],
    #             })
    #         try:
    #             await respond(blocks=blocks, text=answer)
    #         except Exception:
    #             await _safe_respond(respond, answer)
    # except httpx.TimeoutException:
    #     await _safe_respond(respond, ":hourglass: The RAG service took too long. Please try again.")
    # except Exception:
    #     logger.error("[ask-event] error: %s", traceback.format_exc())
    #     await _safe_respond(respond, ":x: Something went wrong connecting to the knowledge base.")


async def handle_generate_marketing(channel: str, respond) -> None:
    """
    /generate-marketing <channel>
    Calls the existing marketing generator for the latest event.
    """
    logger.info("[generate-marketing] channel=%r", channel)
    channel = channel.strip().lower()

    if channel not in VALID_CHANNELS:
        await _safe_respond(
            respond,
            f":x: Unknown channel `{channel}`.\nSupported: `{', '.join(sorted(VALID_CHANNELS))}`"
        )
        return

    event = await _get_latest_event()
    if not event:
        await _safe_respond(respond, ":warning: No event found. Create an event in the Luma Copilot tab first.")
        return

    event_id = event["id"]
    event_name = event.get("name", "your event")
    await _safe_respond(respond, f":pencil: Generating {CHANNEL_DISPLAY[channel]} content for *{event_name}*...")

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            resp = await client.post(
                f"{EVENT_BACKEND}/events/{event_id}/marketing",
                json={"types": [channel], "tone": "professional"},
            )
            logger.info("[generate-marketing] backend status=%d", resp.status_code)

            if resp.status_code != 200:
                await _safe_respond(respond, f":warning: Marketing service returned {resp.status_code}.")
                return

            content = resp.json().get("content", {}).get(channel, "")
            if not content:
                await _safe_respond(respond, ":x: No content was generated. Please try again.")
                return

            blocks = [
                {"type": "header", "text": {"type": "plain_text", "text": f"{CHANNEL_DISPLAY[channel]} — {event_name}"}},
                {"type": "section", "text": {"type": "mrkdwn", "text": content[:3000]}},
                {"type": "context", "elements": [{"type": "mrkdwn", "text": f"Tone: _professional_ · `/regenerate {channel} <tone>`"}]},
            ]
            try:
                await respond(blocks=blocks, text=content[:200])
            except Exception:
                await _safe_respond(respond, content[:2000])

    except httpx.TimeoutException:
        await _safe_respond(respond, ":hourglass: Marketing service timed out.")
    except Exception:
        logger.error("[generate-marketing] error: %s", traceback.format_exc())
        await _safe_respond(respond, ":x: Something went wrong generating marketing content.")


async def handle_regenerate(args: str, respond) -> None:
    """
    /regenerate <channel> <tone>
    Calls the existing marketing endpoint with a different tone.
    """
    logger.info("[regenerate] args=%r", args)
    parts = args.strip().lower().split()

    if len(parts) < 2:
        tones = ", ".join(f"`{t}`" for t in sorted(VALID_TONES))
        channels = ", ".join(f"`{c}`" for c in sorted(VALID_CHANNELS))
        await _safe_respond(
            respond,
            f"Usage: `/regenerate <channel> <tone>`\nChannels: {channels}\nTones: {tones}\nExample: `/regenerate linkedin friendly`"
        )
        return

    channel, tone = parts[0], parts[1]

    if channel not in VALID_CHANNELS:
        await _safe_respond(respond, f":x: Unknown channel `{channel}`.")
        return
    if tone not in VALID_TONES:
        await _safe_respond(respond, f":x: Unknown tone `{tone}`.")
        return

    event = await _get_latest_event()
    if not event:
        await _safe_respond(respond, ":warning: No event found.")
        return

    event_id = event["id"]
    event_name = event.get("name", "your event")
    await _safe_respond(respond, f":arrows_counterclockwise: Regenerating {CHANNEL_DISPLAY[channel]} in *{tone}* tone for *{event_name}*...")

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            resp = await client.post(
                f"{EVENT_BACKEND}/events/{event_id}/marketing",
                json={"types": [channel], "tone": tone},
            )
            logger.info("[regenerate] backend status=%d", resp.status_code)

            if resp.status_code != 200:
                await _safe_respond(respond, f":warning: Marketing service returned {resp.status_code}.")
                return

            content = resp.json().get("content", {}).get(channel, "")
            if not content:
                await _safe_respond(respond, ":x: No content was generated.")
                return

            blocks = [
                {"type": "header", "text": {"type": "plain_text", "text": f"{CHANNEL_DISPLAY[channel]} — {event_name} ({tone.title()})"}},
                {"type": "section", "text": {"type": "mrkdwn", "text": content[:3000]}},
                {"type": "context", "elements": [{"type": "mrkdwn", "text": f"Tone: _{tone}_ · `/regenerate {channel} <tone>`"}]},
            ]
            try:
                await respond(blocks=blocks, text=content[:200])
            except Exception:
                await _safe_respond(respond, content[:2000])

    except httpx.TimeoutException:
        await _safe_respond(respond, ":hourglass: Marketing service timed out.")
    except Exception:
        logger.error("[regenerate] error: %s", traceback.format_exc())
        await _safe_respond(respond, ":x: Something went wrong.")
