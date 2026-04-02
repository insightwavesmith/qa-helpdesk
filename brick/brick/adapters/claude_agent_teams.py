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

    def __init__(self, config: dict | None = None, root_dir: str = "."):
        config = config or {}
        self.root_dir = Path(root_dir)
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

    # ── Management methods (file-based) ──────────────────────

    def _team_config_path(self, team_id: str) -> Path:
        tid = team_id or self.session
        return self.root_dir / ".claude" / "teams" / tid / "config.json"

    async def list_members(self, team_id: str = "") -> list[dict]:
        config_path = self._team_config_path(team_id)
        if config_path.exists():
            return json.loads(config_path.read_text()).get("members", [])
        return []

    async def add_member(self, team_id: str, config: dict) -> dict:
        config_path = self._team_config_path(team_id)
        if config_path.exists():
            data = json.loads(config_path.read_text())
        else:
            config_path.parent.mkdir(parents=True, exist_ok=True)
            data = {"members": []}
        data["members"].append(config)
        config_path.write_text(json.dumps(data, indent=2))
        return config

    async def remove_member(self, team_id: str, member_id: str) -> bool:
        config_path = self._team_config_path(team_id)
        if not config_path.exists():
            return False
        data = json.loads(config_path.read_text())
        original = len(data.get("members", []))
        data["members"] = [m for m in data["members"] if m.get("name") != member_id]
        config_path.write_text(json.dumps(data, indent=2))
        return len(data["members"]) < original

    async def list_skills(self, team_id: str = "") -> list[dict]:
        skills_dir = self.root_dir / ".bkit" / "skills"
        if not skills_dir.exists():
            return []
        result = []
        for p in sorted(skills_dir.glob("*.md")):
            result.append({
                "id": p.stem,
                "name": p.stem,
                "path": str(p),
                "size": p.stat().st_size,
            })
        return result

    async def get_skill_content(self, team_id: str, skill_id: str) -> str:
        skill_path = self.root_dir / ".bkit" / "skills" / f"{skill_id}.md"
        if skill_path.exists():
            return skill_path.read_text()
        return ""

    async def update_skill(self, team_id: str, skill_id: str, content: str) -> dict:
        skill_path = self.root_dir / ".bkit" / "skills" / f"{skill_id}.md"
        skill_path.parent.mkdir(parents=True, exist_ok=True)
        skill_path.write_text(content)
        return {"skill_id": skill_id, "size": len(content)}

    async def list_mcp_servers(self, team_id: str = "") -> list[dict]:
        settings_path = self.root_dir / ".claude" / "settings.local.json"
        if not settings_path.exists():
            return []
        data = json.loads(settings_path.read_text())
        servers = data.get("mcpServers", {})
        result = []
        for sid, cfg in servers.items():
            result.append({
                "id": sid,
                "name": sid,
                "enabled": not cfg.get("disabled", False),
                "tools_count": len(cfg.get("tools", [])),
            })
        return result

    async def configure_mcp(self, team_id: str, server_id: str, enabled: bool) -> dict:
        settings_path = self.root_dir / ".claude" / "settings.local.json"
        if settings_path.exists():
            data = json.loads(settings_path.read_text())
        else:
            data = {"mcpServers": {}}
        if server_id in data.get("mcpServers", {}):
            data["mcpServers"][server_id]["disabled"] = not enabled
        settings_path.write_text(json.dumps(data, indent=2))
        return {"server_id": server_id, "enabled": enabled}

    async def get_model_config(self, team_id: str = "") -> dict:
        settings_path = self.root_dir / ".claude" / "settings.json"
        if not settings_path.exists():
            return {}
        data = json.loads(settings_path.read_text())
        return {
            "model": data.get("model", ""),
            "fallback": data.get("fallbackModel", ""),
        }

    async def set_model_config(self, team_id: str, config: dict) -> dict:
        settings_path = self.root_dir / ".claude" / "settings.json"
        if settings_path.exists():
            data = json.loads(settings_path.read_text())
        else:
            settings_path.parent.mkdir(parents=True, exist_ok=True)
            data = {}
        data["model"] = config.get("model", data.get("model", ""))
        data["fallbackModel"] = config.get("fallback", data.get("fallbackModel", ""))
        settings_path.write_text(json.dumps(data, indent=2))
        return {"model": data["model"], "fallback": data["fallbackModel"]}

    async def get_team_status(self, team_id: str = "") -> dict:
        peer_map_path = self.root_dir / ".bkit" / "runtime" / "peer-map.json"
        if peer_map_path.exists():
            data = json.loads(peer_map_path.read_text())
            return {"session": self.session, "role": self.peer_role, "members": data}
        return {"session": self.session, "role": self.peer_role, "status": "active", "members": {}}
