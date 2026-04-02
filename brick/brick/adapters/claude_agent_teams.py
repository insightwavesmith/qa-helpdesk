"""ClaudeAgentTeamsAdapter — drives Claude Agent Teams via tmux."""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

from brick.adapters.base import TeamAdapter
from brick.adapters.management import TeamManagementAdapter
from brick.models.block import Block
from brick.models.team import AdapterStatus


class ClaudeAgentTeamsAdapter(TeamAdapter, TeamManagementAdapter):
    """Execute blocks via Claude Agent Teams (tmux session)."""

    def __init__(self, config: dict | None = None):
        config = config or {}
        self.session = config.get("session", "default")
        self.broker_port = config.get("broker_port", 7899)
        self.peer_role = config.get("peer_role", "CTO_LEADER")
        self.team_context_dir = Path(config.get("team_context_dir", ".bkit/runtime"))

    async def start_block(self, block: Block, context: dict) -> str:
        execution_id = f"{block.id}-{int(time.time())}"
        cmd = [
            "tmux", "send-keys", "-t", self.session,
            f"TASK: {block.what}", "Enter",
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        return execution_id

    async def check_status(self, execution_id: str) -> AdapterStatus:
        state_file = self.team_context_dir / f"task-state-{execution_id}.json"
        if state_file.exists():
            data = json.loads(state_file.read_text())
            return AdapterStatus(
                status=data.get("status", "running"),
                progress=data.get("progress"),
                message=data.get("message"),
            )
        return AdapterStatus(status="running")

    async def get_artifacts(self, execution_id: str) -> list[str]:
        state_file = self.team_context_dir / f"task-state-{execution_id}.json"
        if state_file.exists():
            data = json.loads(state_file.read_text())
            return data.get("artifacts", [])
        return []

    async def cancel(self, execution_id: str) -> bool:
        cmd = ["tmux", "send-keys", "-t", self.session, "C-c", ""]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        return proc.returncode == 0

    async def list_members(self) -> list[dict]:
        config_path = Path(f"~/.claude/teams/{self.session}/config.json").expanduser()
        if config_path.exists():
            return json.loads(config_path.read_text()).get("members", [])
        return []

    async def get_team_status(self) -> dict:
        return {"session": self.session, "role": self.peer_role, "status": "active"}
