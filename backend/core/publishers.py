"""Per-platform publishing. Each publish_* function is a real API call path
that only activates once its credentials are present in the environment;
otherwise it reports exactly which credential is missing instead of
pretending to have posted anything.
"""
import os
from typing import Optional

import httpx

CHANNEL_CREDENTIALS = {
    "linkedin": "LINKEDIN_ACCESS_TOKEN",
    "x": "X_ACCESS_TOKEN",
    "instagram": "INSTAGRAM_ACCESS_TOKEN",
    "email": "RESEND_API_KEY",
}


def missing_credential(channel: str) -> Optional[str]:
    env_name = CHANNEL_CREDENTIALS.get(channel)
    if env_name and not os.getenv(env_name):
        return env_name
    return None


async def publish_linkedin(content: str) -> dict:
    token = os.getenv("LINKEDIN_ACCESS_TOKEN")
    author_urn = os.getenv("LINKEDIN_AUTHOR_URN")  # e.g. "urn:li:person:xxxx" or "urn:li:organization:xxxx"
    if not token or not author_urn:
        return {"status": "needs_connection", "credential": "LINKEDIN_ACCESS_TOKEN / LINKEDIN_AUTHOR_URN"}
    body = {
        "author": author_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": content},
                "shareMediaCategory": "NONE",
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                "https://api.linkedin.com/v2/ugcPosts",
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Restli-Protocol-Version": "2.0.0",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            response.raise_for_status()
        return {"status": "published", "post_id": response.headers.get("x-restli-id")}
    except httpx.HTTPStatusError as exc:
        return {"status": "failed", "error": f"LinkedIn API {exc.response.status_code}: {exc.response.text[:200]}"}
    except Exception as exc:
        return {"status": "failed", "error": str(exc)}


async def publish_x(content: str) -> dict:
    token = os.getenv("X_ACCESS_TOKEN")
    if not token:
        return {"status": "needs_connection", "credential": "X_ACCESS_TOKEN"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                "https://api.twitter.com/2/tweets",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"text": content[:280]},
            )
            response.raise_for_status()
        return {"status": "published", "post_id": response.json().get("data", {}).get("id")}
    except httpx.HTTPStatusError as exc:
        return {"status": "failed", "error": f"X API {exc.response.status_code}: {exc.response.text[:200]}"}
    except Exception as exc:
        return {"status": "failed", "error": str(exc)}


async def publish_instagram(content: str) -> dict:
    token = os.getenv("INSTAGRAM_ACCESS_TOKEN")
    account_id = os.getenv("INSTAGRAM_BUSINESS_ACCOUNT_ID")
    image_url = os.getenv("INSTAGRAM_DEFAULT_IMAGE_URL")  # Graph API requires media for feed posts
    if not token or not account_id:
        return {"status": "needs_connection", "credential": "INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_BUSINESS_ACCOUNT_ID"}
    if not image_url:
        return {"status": "needs_connection", "credential": "INSTAGRAM_DEFAULT_IMAGE_URL"}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            container = await client.post(
                f"https://graph.facebook.com/v19.0/{account_id}/media",
                params={"image_url": image_url, "caption": content, "access_token": token},
            )
            container.raise_for_status()
            creation_id = container.json()["id"]
            publish = await client.post(
                f"https://graph.facebook.com/v19.0/{account_id}/media_publish",
                params={"creation_id": creation_id, "access_token": token},
            )
            publish.raise_for_status()
        return {"status": "published", "post_id": publish.json().get("id")}
    except httpx.HTTPStatusError as exc:
        return {"status": "failed", "error": f"Instagram API {exc.response.status_code}: {exc.response.text[:200]}"}
    except Exception as exc:
        return {"status": "failed", "error": str(exc)}


async def publish_email(content: str, subject: str) -> dict:
    api_key = os.getenv("RESEND_API_KEY")
    from_addr = os.getenv("RESEND_FROM_EMAIL")
    to_addrs = os.getenv("EMAIL_LIST")  # comma-separated recipients
    if not api_key or not from_addr or not to_addrs:
        return {"status": "needs_connection", "credential": "RESEND_API_KEY / RESEND_FROM_EMAIL / EMAIL_LIST"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "from": from_addr,
                    "to": [addr.strip() for addr in to_addrs.split(",") if addr.strip()],
                    "subject": subject,
                    "text": content,
                },
            )
            response.raise_for_status()
        return {"status": "published", "post_id": response.json().get("id")}
    except httpx.HTTPStatusError as exc:
        return {"status": "failed", "error": f"Resend API {exc.response.status_code}: {exc.response.text[:200]}"}
    except Exception as exc:
        return {"status": "failed", "error": str(exc)}


async def publish_to_channel(channel: str, content: str, subject: str = "") -> dict:
    if channel == "linkedin":
        return await publish_linkedin(content)
    if channel == "x":
        return await publish_x(content)
    if channel == "instagram":
        return await publish_instagram(content)
    if channel == "email":
        return await publish_email(content, subject)
    return {"status": "unsupported"}
