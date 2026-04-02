"""CodexAdapter — Phase 2 stub."""

from __future__ import annotations

from brick.adapters.base import TeamAdapter
from brick.models.block import Block
from brick.models.team import AdapterStatus


class CodexAdapter(TeamAdapter):
    """Stub adapter for OpenAI Codex integration (Phase 2)."""

    def __init__(self, config: dict | None = None):
        self.config = config or {}

    async def start_block(self, block: Block, context: dict) -> str:
        raise NotImplementedError("Codex adapter is a Phase 2 stub")

    async def check_status(self, execution_id: str) -> AdapterStatus:
        raise NotImplementedError("Codex adapter is a Phase 2 stub")

    async def get_artifacts(self, execution_id: str) -> list[str]:
        raise NotImplementedError("Codex adapter is a Phase 2 stub")

    async def cancel(self, execution_id: str) -> bool:
        raise NotImplementedError("Codex adapter is a Phase 2 stub")
