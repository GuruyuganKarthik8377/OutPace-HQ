"""Supabase storage layer for OutPace HQ events.

Wraps the sync supabase-py client in asyncio.to_thread so FastAPI
async endpoints can call it without blocking the event loop.
"""
import asyncio
import os
from typing import Optional, Dict

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

_client: Optional[Client] = None


def _get_client() -> Optional[Client]:
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_KEY", "")
        if url and key:
            _client = create_client(url, key)
    return _client


async def insert_event(event: dict) -> None:
    client = _get_client()
    if not client:
        return
    await asyncio.to_thread(
        lambda: client.table("events").insert(event).execute()
    )


async def get_event(event_id: str) -> Optional[dict]:
    client = _get_client()
    if not client:
        return None
    result = await asyncio.to_thread(
        lambda: client.table("events").select("*").eq("id", event_id).execute()
    )
    return result.data[0] if result.data else None


async def update_event(event_id: str, updates: dict) -> None:
    client = _get_client()
    if not client:
        return
    await asyncio.to_thread(
        lambda: client.table("events").update(updates).eq("id", event_id).execute()
    )


async def get_latest_event() -> Optional[dict]:
    client = _get_client()
    if not client:
        return None
    result = await asyncio.to_thread(
        lambda: client.table("events").select("*").order("created_at", desc=True).limit(1).execute()
    )
    return result.data[0] if result.data else None


async def get_all_events() -> Dict[str, dict]:
    client = _get_client()
    if not client:
        return {}
    result = await asyncio.to_thread(
        lambda: client.table("events").select("*").execute()
    )
    return {row["id"]: row for row in (result.data or [])}
