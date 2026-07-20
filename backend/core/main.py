import asyncio
import json
import os
import time
from collections import defaultdict, deque

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel
import httpx
from uuid import uuid4

from intelligence import generate_intelligence, get_fallback
from scraper import scrape_company
from publishers import publish_to_channel
import slack_bot
import concierge_bot
import luma_bot
import db

NODE_DELAY_SECONDS = 1.5
LIVE_CACHE_TTL_SECONDS = 600   # repeat live lookups within 10 min return instantly
LIVE_CACHE_MAX = 256           # cap cache entries so memory can't grow unbounded
MAX_COMPANY_LEN = 80           # clamp user input length
RATE_LIMIT_MAX = 30            # max research calls per IP...
RATE_LIMIT_WINDOW = 60         # ...within this many seconds

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

state = {"demo_mode": os.getenv("DEMO_MODE", "false").lower() == "true"}

# CORS origins are configurable via ALLOWED_ORIGINS (comma-separated); default
# "*" keeps local dev working. Set an explicit list in production.
_cors_env = os.getenv("ALLOWED_ORIGINS", "*").strip()
_allow_origins = ["*"] if _cors_env == "*" else [o.strip() for o in _cors_env.split(",") if o.strip()]

app = FastAPI()


class EventPayload(BaseModel):
    name: str
    description: str
    date: str
    venue: str


class MarketingPayload(BaseModel):
    types: list[str]
    tone: str = "professional"


class PublishPayload(BaseModel):
    channels: list[str]
    content: dict[str, str]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/events")
async def create_event(payload: EventPayload):
    event = payload.model_dump()
    if not all(str(value).strip() for value in event.values()):
        raise HTTPException(status_code=400, detail="All event details are required.")
    event_id = str(uuid4())
    record = {
        "id": event_id,
        **event,
        "marketing": {},
        "publish_status": {},
        "luma_url": None,
        "luma_status": None,
    }

    luma_result = await luma_bot.create_luma_event(
        name=event.get("name", ""),
        description=event.get("description", ""),
        date=event.get("date", ""),
        venue=event.get("venue", ""),
    )
    luma_status = luma_result.get("status")
    record["luma_status"] = luma_status
    if luma_status == "created":
        record["luma_url"] = luma_result.get("event_url")
    else:
        record["luma_error"] = luma_result.get("error")

    await db.insert_event(record)
    await slack_bot.notify_event_created(record)
    return record


@app.post("/events/{event_id}/marketing")
async def create_marketing(event_id: str, payload: MarketingPayload):
    event = await db.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found. Create the event first.")
    allowed = {"linkedin", "instagram", "email", "whatsapp", "speaker", "reminder"}
    types = [item for item in payload.types if item in allowed]
    if not types:
        raise HTTPException(status_code=400, detail="Select at least one content type.")
    prompt = f"""Create concise event marketing copy as JSON for these channels: {', '.join(types)}.
Event: {event['name']}\nDate: {event['date']}\nVenue: {event['venue']}\nDescription: {event['description']}\nTone: {payload.tone}
Return only a JSON object where each channel name maps to its copy."""
    try:
        key = os.getenv("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured")
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"), "max_tokens": 1400,
                      "messages": [{"role": "user", "content": prompt}]},
            )
            response.raise_for_status()
        text = response.json()["content"][0]["text"].strip()
        start, end = text.find("{"), text.rfind("}")
        result = json.loads(text[start:end + 1])
        content = {kind: str(result.get(kind, "")) for kind in types}
    except Exception:
        prefix = f"{event['name']} — {event['date']} at {event['venue']}"
        content = {kind: f"{prefix}\n\n{event['description']}\n\nJoin us — register now." for kind in types}
    merged_marketing = {**(event.get("marketing") or {}), **content}
    await db.update_event(event_id, {"marketing": merged_marketing})
    event["marketing"] = merged_marketing
    await slack_bot.notify_marketing_ready(event, types)
    return {"content": content}


_DIRECTLY_PUBLISHABLE = {"linkedin", "x", "instagram", "email"}


@app.post("/events/{event_id}/publish")
async def publish_event_marketing(event_id: str, payload: PublishPayload):
    """Provider contract for publishing. Real providers are enabled only when
    their user-owned credentials are configured in the environment."""
    event = await db.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    supported = {"luma", "linkedin", "x", "instagram", "whatsapp", "email"}
    statuses = {}
    for channel in payload.channels:
        if channel not in supported:
            statuses[channel] = {"status": "unsupported"}
            continue
        if channel in _DIRECTLY_PUBLISHABLE:
            content = payload.content.get(channel) or (event.get("marketing") or {}).get(channel, "")
            statuses[channel] = await publish_to_channel(channel, content, subject=event["name"])
        else:
            credential = f"{channel.upper().replace('-', '_')}_ACCESS_TOKEN"
            statuses[channel] = (
                {"status": "ready_to_publish"} if os.getenv(credential)
                else {"status": "needs_connection", "credential": credential}
            )
        await slack_bot.notify_publish_result(event["name"], channel, statuses[channel])
    merged_publish = {**(event.get("publish_status") or {}), **statuses}
    await db.update_event(event_id, {"publish_status": merged_publish})
    return {"event_id": event_id, "channels": statuses}


@app.post("/slack/interactions")
async def slack_interactions(request: Request):
    """Handles Slack's 'Approve & Publish' button clicks. Requires a Slack app
    (bot token + signing secret) pointed at this endpoint's public URL."""
    body = await request.body()
    if not slack_bot.verify_slack_signature(
        body,
        request.headers.get("X-Slack-Request-Timestamp", ""),
        request.headers.get("X-Slack-Signature", ""),
    ):
        raise HTTPException(status_code=401, detail="Invalid Slack signature.")

    form = await request.form()
    try:
        interaction = json.loads(form["payload"])
        action = interaction["actions"][0]
        action_id: str = action["action_id"]
        value = json.loads(action["value"])
    except (KeyError, ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Malformed Slack interaction payload.")

    if not action_id.startswith("approve_publish:"):
        return {"ok": True}

    channel = value.get("channel")
    event_id = value.get("event_id")
    event = await db.get_event(event_id)
    if not event or channel not in _DIRECTLY_PUBLISHABLE:
        await slack_bot.notify(f":x: Could not publish — unknown event or channel `{channel}`.")
        return {"ok": True}

    content = (event.get("marketing") or {}).get(channel, "")
    status = await publish_to_channel(channel, content, subject=event["name"])
    merged_publish = {**(event.get("publish_status") or {}), channel: status}
    await db.update_event(event_id, {"publish_status": merged_publish})
    await slack_bot.notify_publish_result(event["name"], channel, status)
    return {"ok": True}


# ── Inbound concierge bot (WhatsApp + email) ─────────────────────────────────

class AskPayload(BaseModel):
    question: str
    channel: str = "test"          # "test" | "whatsapp" | "email"
    to: str = ""                   # recipient for whatsapp/email replies


@app.post("/bot/ask")
async def bot_ask(payload: AskPayload):
    """Direct entry point: answer a question from the RAG and (optionally) send
    the reply over a channel. Used by internal tools and for testing the bot
    without wiring a real WhatsApp/email webhook."""
    rag = await concierge_bot.ask_rag(payload.question)
    result = {"question": payload.question, "answer": rag["answer"], "citations": rag["citations"]}
    if payload.channel == "whatsapp" and payload.to:
        result["send"] = await concierge_bot.send_whatsapp(payload.to, rag["answer"])
    elif payload.channel == "email" and payload.to:
        result["send"] = await concierge_bot.send_email_reply(payload.to, "Your event question", rag["answer"])
    return result


@app.get("/bot/whatsapp")
async def whatsapp_verify(request: Request):
    """Meta's one-time webhook verification handshake."""
    params = request.query_params
    challenge = concierge_bot.verify_whatsapp_webhook(
        params.get("hub.mode", ""),
        params.get("hub.verify_token", ""),
        params.get("hub.challenge", ""),
    )
    if challenge is None:
        raise HTTPException(status_code=403, detail="Verification token mismatch.")
    return PlainTextResponse(challenge)


@app.post("/bot/whatsapp")
async def whatsapp_webhook(request: Request):
    """Receive inbound WhatsApp messages, answer via RAG, reply on WhatsApp."""
    body = await request.body()
    if not concierge_bot.verify_whatsapp_signature(
        body, request.headers.get("X-Hub-Signature-256", "")
    ):
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")
    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")
    replies = []
    for msg in concierge_bot.parse_whatsapp_messages(payload):
        replies.append(await concierge_bot.handle_whatsapp_message(msg))
    # Meta requires a fast 200 regardless; surface what we did for observability.
    return {"handled": len(replies), "replies": replies}


@app.post("/bot/email")
async def email_webhook(request: Request):
    """Receive an inbound email (from any provider's inbound-parse webhook),
    answer via RAG, reply by email. Accepts JSON or form-encoded payloads."""
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        payload = await request.json()
    else:
        form = await request.form()
        payload = {k: str(v) for k, v in form.items()}
    result = await concierge_bot.handle_inbound_email(payload)
    return result


def _cache_dir() -> str:
    return os.path.join(os.path.dirname(__file__), "cache")


def _cached_companies() -> list[str]:
    return sorted(f[:-5] for f in os.listdir(_cache_dir()) if f.endswith(".json"))


def _generic_fallback(company: str) -> dict:
    return {
        "nodes": [
            {"id": "1", "label": "Funding", "data": f"No public funding data found for {company}"},
            {"id": "2", "label": "People", "data": f"No hiring signals found for {company}"},
            {"id": "3", "label": "Product", "data": f"No product changes detected for {company}"},
            {"id": "4", "label": "Threat", "data": "Insufficient data to assess threat level"},
            {"id": "5", "label": "Your Move", "data": "Conduct manual research on LinkedIn and Crunchbase"},
        ],
        "edges": [
            {"source": "1", "target": "4"},
            {"source": "2", "target": "3"},
            {"source": "3", "target": "4"},
            {"source": "4", "target": "5"},
        ],
        "threatLevel": "LOW",
        "threatBrief": f"Insufficient public data found for {company}. Manual research recommended.",
        "gtmMoves": [
            "Search LinkedIn for recent hires and leadership changes",
            "Check Crunchbase for funding history and investors",
            "Review their website changelog and pricing page",
        ],
    }


def _demo_result(company: str) -> dict:
    cache_path = os.path.join(_cache_dir(), f"{company.lower().replace(' ', '_')}.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r") as f:
                return json.load(f)
        except Exception:
            return _generic_fallback(company)
    return _generic_fallback(company)


_VALID_THREAT_LEVELS = {"HIGH", "MEDIUM", "LOW"}
_live_cache: dict[str, tuple[float, dict]] = {}
_inflight: dict[str, asyncio.Future] = {}
_rate_hits: dict[str, deque] = defaultdict(deque)


def _clean_company(company: str) -> str:
    return (company or "").strip()[:MAX_COMPANY_LEN]


def _rate_limit(request: Request) -> None:
    """Per-IP sliding-window limit on the expensive research endpoints so a
    burst of requests can't run up the Anthropic bill."""
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    hits = _rate_hits[ip]
    while hits and now - hits[0] > RATE_LIMIT_WINDOW:
        hits.popleft()
    if len(hits) >= RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Rate limit exceeded, slow down.")
    hits.append(now)


def _remember(key: str, result: dict) -> None:
    _live_cache[key] = (time.time(), result)
    if len(_live_cache) > LIVE_CACHE_MAX:
        oldest = min(_live_cache, key=lambda k: _live_cache[k][0])
        _live_cache.pop(oldest, None)


def _is_valid_result(result: dict) -> bool:
    try:
        nodes = result["nodes"]
        if not isinstance(nodes, list) or len(nodes) != 5:
            return False
        if not all(all(k in n for k in ("id", "label", "data")) for n in nodes):
            return False
        return (
            isinstance(result.get("edges"), list)
            and result.get("threatLevel") in _VALID_THREAT_LEVELS
            and isinstance(result.get("threatBrief"), str)
            and isinstance(result.get("gtmMoves"), list)
        )
    except (KeyError, TypeError):
        return False


def _persist_new_company(company: str, result: dict) -> None:
    # Warm the on-disk cache for companies we don't already curate, so future
    # demo-mode lookups (and /companies) include them. Never clobber an
    # existing curated cache file.
    path = os.path.join(_cache_dir(), f"{company.lower().replace(' ', '_')}.json")
    if os.path.exists(path):
        return
    try:
        with open(path, "w") as f:
            json.dump(result, f, indent=2)
    except Exception:
        pass


async def _compute_live(company: str, key: str) -> dict:
    try:
        scraped_data = await scrape_company(company)
        result = await generate_intelligence(company, scraped_data)
    except Exception:
        return get_fallback(company)

    if _is_valid_result(result):
        _remember(key, result)
        _persist_new_company(company, result)
    return result


async def _live_intelligence(company: str) -> dict:
    """Live scrape + Claude with a TTL cache (instant repeats) and single-flight
    coalescing (concurrent identical requests share one computation instead of
    each firing their own scrape+Claude). Never leaks another company's data:
    on failure it returns the company-specific get_fallback()."""
    key = company.strip().lower()
    if not key:
        return _generic_fallback("the requested company")

    cached = _live_cache.get(key)
    if cached and (time.time() - cached[0]) < LIVE_CACHE_TTL_SECONDS:
        return cached[1]

    existing = _inflight.get(key)
    if existing is not None:
        return await existing

    task = asyncio.ensure_future(_compute_live(company, key))
    _inflight[key] = task
    try:
        return await task
    finally:
        _inflight.pop(key, None)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/events/latest")
async def get_latest_event():
    """Return the most recently created event (used by Slack commands)."""
    latest = await db.get_latest_event()
    if not latest:
        raise HTTPException(status_code=404, detail="No events found.")
    return latest


@app.post("/demo/on")
async def demo_on():
    state["demo_mode"] = True
    return {"demo_mode": True}


@app.post("/demo/off")
async def demo_off():
    state["demo_mode"] = False
    return {"demo_mode": False}


@app.get("/demo/status")
async def demo_status():
    return {"demo_mode": state["demo_mode"]}


@app.get("/companies")
async def companies():
    return {
        "cached": _cached_companies(),
        "live": True,
        "demo_mode": state["demo_mode"],
    }


@app.post("/research")
async def research(company: str, _: None = Depends(_rate_limit)):
    company = _clean_company(company)
    if state["demo_mode"]:
        return _demo_result(company)
    return await _live_intelligence(company)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


async def _research_events(company: str):
    if state["demo_mode"]:
        result = _demo_result(company)
    else:
        result = await _live_intelligence(company)

    try:
        for node in result["nodes"]:
            yield _sse({"type": "node", "node": node})
            await asyncio.sleep(NODE_DELAY_SECONDS)

        yield _sse({"type": "edges", "edges": result["edges"]})
        yield _sse(
            {
                "type": "meta",
                "threatLevel": result["threatLevel"],
                "threatBrief": result["threatBrief"],
                "gtmMoves": result["gtmMoves"],
            }
        )
    except Exception:
        pass

    yield _sse({"type": "done"})


@app.get("/research/stream")
async def research_stream(company: str, _: None = Depends(_rate_limit)):
    return StreamingResponse(
        _research_events(_clean_company(company)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Slack integration ─────────────────────────────────────────────────────────
import logging as _logging
import traceback as _traceback

try:
    from slack.bot import handler as _slack_handler
    from slack.commands import register_commands
    from slack.bot import app as _slack_app
    register_commands(_slack_app)

    _slack_logger = _logging.getLogger("slack.endpoint")

    @app.post("/slack/events")
    async def slack_events(request: Request):
        """Entry point for all Slack slash commands and event callbacks.
        Slack signature verification is handled by slack_bolt internally."""
        body = await request.body()
        _slack_logger.info(
            "Slack request: %d bytes | content-type: %s | ts: %s | sig: %s",
            len(body),
            request.headers.get("content-type", ""),
            request.headers.get("x-slack-request-timestamp", "missing"),
            request.headers.get("x-slack-signature", "missing")[:20] + "...",
        )
        try:
            response = await _slack_handler.handle(request)
            _slack_logger.info("Slack response: status=%s", response.status_code)
            return response
        except Exception as _e:
            _slack_logger.error("Slack handler raised:\n%s", _traceback.format_exc())
            raise

except Exception as _slack_err:
    _logging.getLogger("slack").warning(
        "Slack integration not loaded: %s\n%s",
        _slack_err,
        _traceback.format_exc(),
    )
