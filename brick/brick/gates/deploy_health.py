"""DeployHealthGate — HTTP health check after deployment."""

from __future__ import annotations

import httpx

from brick.models.gate import GateResult


class DeployHealthGate:
    """Check deployment health via HTTP GET."""

    def __init__(self, url: str = "", timeout: int = 10):
        self.url = url
        self.timeout = timeout

    async def check(self, context: dict) -> GateResult:
        url = self.url or context.get("health_url", "")
        if not url:
            return GateResult(passed=False, detail="No health URL configured", type="http")
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, timeout=self.timeout)
                return GateResult(
                    passed=resp.status_code == 200,
                    detail=f"HTTP {resp.status_code}",
                    type="http",
                )
        except httpx.HTTPError as e:
            return GateResult(passed=False, detail=str(e), type="http")
