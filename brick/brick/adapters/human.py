"""HumanAdapter — manual human execution with CLI completion."""

from __future__ import annotations

import time
from pathlib import Path

from brick.adapters.base import TeamAdapter
from brick.models.block import Block
from brick.models.team import AdapterStatus


class HumanAdapter(TeamAdapter):
    """Blocks wait for human completion via file marker."""

    def __init__(self, config: dict | None = None):
        config = config or {}
        self.completions_dir = Path(
            config.get("completions_dir", ".bkit/runtime/human-completions")
        )

    async def start_block(self, block: Block, context: dict) -> str:
        execution_id = f"human-{block.id}-{int(time.time())}"
        workflow_id = context.get("workflow_id", "")
        print(f"\n🧱 Block: {block.what}")
        print(f"   Done: {block.done.artifacts}")
        print(f"   완료하면: brick complete --block {block.id} --workflow {workflow_id}")
        return execution_id

    async def check_status(self, execution_id: str) -> AdapterStatus:
        completion_file = self.completions_dir / execution_id
        if completion_file.exists():
            return AdapterStatus(status="completed")
        return AdapterStatus(status="waiting_human")

    async def get_artifacts(self, execution_id: str) -> list[str]:
        return []

    async def cancel(self, execution_id: str) -> bool:
        return True
