"""Google Sign-In — Google ID 토큰 검증 (MC 패턴 포팅)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import quote

import httpx

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")


@dataclass
class GoogleIdTokenPayload:
    sub: str
    email: str
    name: str | None = None
    picture: str | None = None


async def verify_google_id_token(id_token: str) -> GoogleIdTokenPayload:
    """Google ID 토큰 검증."""
    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={quote(id_token)}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
    if resp.status_code != 200:
        raise ValueError("Invalid Google token")

    payload = resp.json()
    if GOOGLE_CLIENT_ID and payload.get("aud") != GOOGLE_CLIENT_ID:
        raise ValueError("Google token audience mismatch")
    if not payload.get("email"):
        raise ValueError("Google token missing email")
    if payload.get("email_verified") not in (True, "true"):
        raise ValueError("Google email not verified")

    return GoogleIdTokenPayload(
        sub=payload["sub"],
        email=payload["email"],
        name=payload.get("name"),
        picture=payload.get("picture"),
    )
