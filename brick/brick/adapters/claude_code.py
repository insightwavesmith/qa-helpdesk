"""SingleClaudeCodeAdapter — single Claude Code session."""

from __future__ import annotations

import asyncio
import time

from brick.adapters.base import TeamAdapter
from brick.models.block import Block
from brick.models.team import AdapterStatus


class SingleClaudeCodeAdapter(TeamAdapter):
    """Execute blocks via a single Claude Code subprocess."""

    def __init__(self, config: dict | None = None):
        self.config = config or {}

    async def start_block(self, block: Block, context: dict) -> str:
        execution_id = f"claude-{block.id}-{int(time.time())}"
        cmd = ["claude", "--print", "-m", f"TASK: {block.what}"]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        # Fire-and-forget: don't await completion
        return execution_id

    async def check_status(self, execution_id: str) -> AdapterStatus:
        return AdapterStatus(status="running")

    async def get_artifacts(self, execution_id: str) -> list[str]:
        return []

    async def cancel(self, execution_id: str) -> bool:
        return True
