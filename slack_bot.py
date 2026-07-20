"""Slack integration: plain webhook notifications plus an optional interactive
approval bot. Every function degrades to a no-op when its credentials aren't
configured, so the rest of the app never has to branch on "is Slack set up."
"""
import hashlib
import hmac
import json
import os
import time
from typing import Optional

import httpx

SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "").strip()
SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN", "").strip()
SLACK_SIGNING_SECRET = os.getenv("SLACK_SIGNING_SECRET", "").strip()
SLACK_CHANNEL = os.getenv("SLACK_CHANNEL", "").strip()  # required for bot-token posts

PUBLISHABLE_CHANNELS = ("linkedin", "x", "instagram", "email")


def slack_configured() -> bool:
    return bool(SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN)


def bot_configured() -> bool:
    """Interactive buttons need a bot token + signing secret + a target channel."""
    return bool(SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET and SLACK_CHANNEL)


async def notify(text: str, blocks: Optional[list] = None) -> None:
    """Fire-and-forget style notification. Prefers the bot token (so it can
    return a message ts for later updates); falls back to the webhook."""
    if not slack_configured():
        return
    payload: dict = {"text": text}
    if blocks:
        payload["blocks"] = blocks
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            if SLACK_BOT_TOKEN and SLACK_CHANNEL:
                payload["channel"] = SLACK_CHANNEL
                await client.post(
                    "https://slack.com/api/chat.postMessage",
                    headers={"Authorization": f"Bearer {SLACK_BOT_TOKEN}"},
                    json=payload,
                )
            elif SLACK_WEBHOOK_URL:
                await client.post(SLACK_WEBHOOK_URL, json=payload)
    except Exception:
        # Slack being unreachable must never break the underlying workflow.
        pass


def _approval_blocks(event_id: str, event_name: str, channels: list[str]) -> list[dict]:
    buttons = [
        {
            "type": "button",
            "text": {"type": "plain_text", "text": f"Approve & Publish {ch.capitalize()}"},
            "style": "primary",
            "action_id": f"approve_publish:{ch}",
            "value": json.dumps({"event_id": event_id, "channel": ch}),
        }
        for ch in channels
        if ch in PUBLISHABLE_CHANNELS
    ]
    blocks: list[dict] = [
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Marketing content ready for* `{event_name}`"},
        }
    ]
    if buttons:
        blocks.append({"type": "actions", "elements": buttons})
    return blocks


async def notify_event_created(event: dict) -> None:
    await notify(f"Event created: *{event['name']}* on {event['date']} at {event['venue']}")


async def notify_marketing_ready(event: dict, generated_types: list[str]) -> None:
    text = f"Marketing content ready for *{event['name']}*: {', '.join(generated_types)}"
    if bot_configured():
        await notify(text, blocks=_approval_blocks(event["id"], event["name"], generated_types))
    else:
        await notify(text)


async def notify_rag_indexed(filename: str) -> None:
    await notify(f"Document indexed for Ask Event: *{filename}*")


async def notify_escalation(event_name: str, question: str) -> None:
    await notify(f":rotating_light: Attendee question needs organizer escalation for *{event_name}*:\n>{question}")


async def notify_publish_result(event_name: str, channel: str, status: dict) -> None:
    state = status.get("status")
    if state == "published":
        await notify(f":white_check_mark: Published *{event_name}* to *{channel}*")
    elif state == "needs_connection":
        await notify(
            f":warning: *{channel}* isn't connected yet — set `{status.get('credential')}` to publish "
            f"*{event_name}* there."
        )
    elif state == "failed":
        await notify(f":x: Publishing *{event_name}* to *{channel}* failed: {status.get('error', 'unknown error')}")


def verify_slack_signature(body: bytes, timestamp: str, signature: str) -> bool:
    """Slack's request-signing scheme: https://api.slack.com/authentication/verifying-requests-from-slack"""
    if not SLACK_SIGNING_SECRET:
        return False
    try:
        if abs(time.time() - int(timestamp)) > 60 * 5:
            return False
    except (TypeError, ValueError):
        return False
    basestring = f"v0:{timestamp}:{body.decode('utf-8')}".encode("utf-8")
    computed = "v0=" + hmac.new(SLACK_SIGNING_SECRET.encode("utf-8"), basestring, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, signature or "")
