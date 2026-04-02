"""WebhookAdapter — HTTP webhook-based execution."""

from __future__ import annotations

import time

import httpx

from brick.adapters.base import TeamAdapter
from brick.models.block import Block
from brick.models.team import AdapterStatus


class WebhookAdapter(TeamAdapter):
    """Execute blocks via HTTP webhook calls."""

    def __init__(self, config: dict | None = None):
        config = config or {}
        self.url = config.get("url", "")
        self.headers = config.get("headers", {})
        self.timeout = config.get("timeout", 30)
        self.status_url = config.get("status_url", "")

    async def start_block(self, block: Block, context: dict) -> str:
        execution_id = f"webhook-{block.id}-{int(time.time())}"
        payload = {
            "execution_id": execution_id,
            "block_id": block.id,
            "what": block.what,
            "context": context,
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                self.url,
                json=payload,
                headers=self.headers,
                timeout=self.timeout,
            )
            resp.raise_for_status()
        return execution_id

    async def check_status(self, execution_id: str) -> AdapterStatus:
        if not self.status_url:
            return AdapterStatus(status="running")
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.status_url}/{execution_id}",
                headers=self.headers,
                timeout=self.timeout,
            )
            if resp.status_code == 200:
                data = resp.json()
                return AdapterStatus(
                    status=data.get("status", "running"),
                    progress=data.get("progress"),
                    message=data.get("message"),
                )
        return AdapterStatus(status="running")

    async def get_artifacts(self, execution_id: str) -> list[str]:
        return []

    async def cancel(self, execution_id: str) -> bool:
        return True
