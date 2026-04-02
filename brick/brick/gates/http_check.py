"""HttpCheckGate — generic HTTP endpoint check."""

from __future__ import annotations

import httpx

from brick.models.gate import GateResult


class HttpCheckGate:
    """Generic HTTP check gate."""

    def __init__(self, url: str = "", headers: dict | None = None, timeout: int = 30):
        self.url = url
        self.headers = headers or {}
        self.timeout = timeout

    async def check(self, context: dict) -> GateResult:
        url = self.url or context.get("url", "")
        if not url:
            return GateResult(passed=False, detail="No URL configured", type="http")
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers=self.headers, timeout=self.timeout)
                return GateResult(
                    passed=resp.status_code == 200,
                    detail=f"HTTP {resp.status_code}",
                    type="http",
                )
        except httpx.HTTPError as e:
            return GateResult(passed=False, detail=str(e), type="http")
