"""Inbound event concierge bot.

Attendees ask questions over WhatsApp or email; the bot answers them from the
RAG knowledge base (the same service that powers the in-app Ask Event chat) and
replies on the channel the question arrived on.

Direction of data:
    attendee --(WhatsApp/email webhook)--> this module --> RAG /answer
    this module --(WhatsApp Graph API / Resend)--> attendee

Every outbound send degrades to a logged no-op when its credentials aren't set,
so the receive->answer path is fully testable before any channel is connected.
"""
import hashlib
import hmac
import logging
import os

import httpx

logger = logging.getLogger("concierge_bot")

# The RAG service (rag-backend) that answers grounded event questions.
RAG_URL = os.getenv("RAG_URL", "http://127.0.0.1:8001").rstrip("/")

# --- WhatsApp (Meta WhatsApp Business Cloud API) ---
WHATSAPP_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "").strip()
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip()
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "").strip()
WHATSAPP_APP_SECRET = os.getenv("WHATSAPP_APP_SECRET", "").strip()

# --- Email (Resend for sending; inbound parsed by any provider webhook) ---
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "").strip()

FALLBACK_ANSWER = (
    "Thanks for your question! I couldn't find that in the event details right now. "
    "The organizer will follow up with you shortly."
)


async def ask_rag(question: str) -> dict:
    """Query the RAG service. Returns {answer, citations} or a safe fallback so
    a downstream reply is always possible even if the RAG service is down."""
    question = (question or "").strip()
    if not question:
        return {"answer": FALLBACK_ANSWER, "citations": []}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(f"{RAG_URL}/answer", json={"query": question})
            response.raise_for_status()
        data = response.json()
        answer = (data.get("answer") or "").strip() or FALLBACK_ANSWER
        return {"answer": answer, "citations": data.get("citations", [])}
    except Exception as exc:
        logger.warning("RAG query failed (%s) — returning fallback", exc)
        return {"answer": FALLBACK_ANSWER, "citations": []}


# ── WhatsApp ────────────────────────────────────────────────────────────────

def verify_whatsapp_webhook(mode: str, token: str, challenge: str):
    """Meta calls GET on the webhook once to verify it. Echo the challenge back
    only when the verify token matches. Returns the challenge string or None."""
    if mode == "subscribe" and token and token == WHATSAPP_VERIFY_TOKEN:
        return challenge
    return None


def verify_whatsapp_signature(body: bytes, signature_header: str) -> bool:
    """Verify Meta's X-Hub-Signature-256 over the raw request body.

    Returns True when no app secret is configured (nothing to verify against
    yet) so the receive->answer path stays testable; once WHATSAPP_APP_SECRET
    is set, unsigned or mismatched requests are rejected."""
    if not WHATSAPP_APP_SECRET:
        return True
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(
        WHATSAPP_APP_SECRET.encode("utf-8"), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def parse_whatsapp_messages(payload: dict) -> list[dict]:
    """Extract inbound text messages from a Meta webhook payload.
    Returns a list of {from, text, message_id}."""
    messages: list[dict] = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for msg in value.get("messages", []):
                if msg.get("type") != "text":
                    continue
                messages.append(
                    {
                        "from": msg.get("from", ""),
                        "text": (msg.get("text") or {}).get("body", ""),
                        "message_id": msg.get("id", ""),
                    }
                )
    return messages


async def send_whatsapp(to: str, text: str) -> dict:
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        logger.info("[whatsapp] not configured — would reply to %s: %s", to, text[:80])
        return {"status": "needs_connection",
                "credential": "WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"https://graph.facebook.com/v19.0/{WHATSAPP_PHONE_NUMBER_ID}/messages",
                headers={"Authorization": f"Bearer {WHATSAPP_TOKEN}"},
                json={
                    "messaging_product": "whatsapp",
                    "to": to,
                    "type": "text",
                    "text": {"body": text[:4096]},
                },
            )
            response.raise_for_status()
        return {"status": "sent", "message_id": response.json().get("messages", [{}])[0].get("id")}
    except httpx.HTTPStatusError as exc:
        return {"status": "failed", "error": f"WhatsApp API {exc.response.status_code}: {exc.response.text[:200]}"}
    except Exception as exc:
        return {"status": "failed", "error": str(exc)}


async def handle_whatsapp_message(msg: dict) -> dict:
    """Answer one inbound WhatsApp message and reply on WhatsApp."""
    rag = await ask_rag(msg.get("text", ""))
    send = await send_whatsapp(msg.get("from", ""), rag["answer"])
    return {"channel": "whatsapp", "from": msg.get("from"), "question": msg.get("text"),
            "answer": rag["answer"], "send": send}


# ── Email ───────────────────────────────────────────────────────────────────

def parse_inbound_email(payload: dict) -> dict:
    """Normalize an inbound-email webhook into {from, subject, text}.

    Different providers use different field names (SendGrid Inbound Parse,
    Mailgun Routes, Resend inbound). We check the common ones."""
    sender = (
        payload.get("from")
        or payload.get("sender")
        or payload.get("From")
        or ""
    )
    subject = payload.get("subject") or payload.get("Subject") or ""
    text = (
        payload.get("text")
        or payload.get("body-plain")
        or payload.get("stripped-text")
        or payload.get("plain")
        or ""
    )
    return {"from": _extract_email_address(sender), "subject": subject, "text": text.strip()}


def _extract_email_address(raw: str) -> str:
    """Pull the bare address out of a "Name <addr@x.com>" header value."""
    raw = (raw or "").strip()
    if "<" in raw and ">" in raw:
        return raw[raw.find("<") + 1:raw.find(">")].strip()
    return raw


async def send_email_reply(to: str, subject: str, text: str) -> dict:
    if not RESEND_API_KEY or not RESEND_FROM_EMAIL:
        logger.info("[email] not configured — would reply to %s: %s", to, text[:80])
        return {"status": "needs_connection", "credential": "RESEND_API_KEY / RESEND_FROM_EMAIL"}
    if not to:
        return {"status": "failed", "error": "No recipient address parsed from inbound email."}
    reply_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}".strip().rstrip(":").strip() or "Re: Your event question"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json={"from": RESEND_FROM_EMAIL, "to": [to], "subject": reply_subject, "text": text},
            )
            response.raise_for_status()
        return {"status": "sent", "message_id": response.json().get("id")}
    except httpx.HTTPStatusError as exc:
        return {"status": "failed", "error": f"Resend API {exc.response.status_code}: {exc.response.text[:200]}"}
    except Exception as exc:
        return {"status": "failed", "error": str(exc)}


async def handle_inbound_email(payload: dict) -> dict:
    """Answer one inbound email and reply by email."""
    parsed = parse_inbound_email(payload)
    rag = await ask_rag(parsed["text"] or parsed["subject"])
    send = await send_email_reply(parsed["from"], parsed["subject"], rag["answer"])
    return {"channel": "email", "from": parsed["from"], "question": parsed["text"] or parsed["subject"],
            "answer": rag["answer"], "send": send}
