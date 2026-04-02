"""HumanManagementAdapter — minimal management for human-driven teams."""

from __future__ import annotations

from pathlib import Path

import yaml

from brick.adapters.human import HumanAdapter
from brick.adapters.management import TeamManagementAdapter


class HumanManagementAdapter(HumanAdapter, TeamManagementAdapter):
    """Human adapter with minimal team management via YAML files."""

    def __init__(self, config: dict | None = None, root_dir: str = "."):
        super().__init__(config)
        self.root_dir = Path(root_dir)

    async def list_members(self, team_id: str) -> list[dict]:
        team_path = self.root_dir / ".bkit" / "teams" / f"{team_id}.yaml"
        if not team_path.exists():
            return []
        data = yaml.safe_load(team_path.read_text())
        return data.get("spec", {}).get("members", [])

    async def add_member(self, team_id: str, config: dict) -> dict:
        raise NotImplementedError("Human teams do not support programmatic member addition")

    async def remove_member(self, team_id: str, member_id: str) -> bool:
        raise NotImplementedError("Human teams do not support programmatic member removal")

    async def list_skills(self, team_id: str) -> list[dict]:
        raise NotImplementedError("Human teams do not support skill management")

    async def get_skill_content(self, team_id: str, skill_id: str) -> str:
        raise NotImplementedError("Human teams do not support skill management")

    async def update_skill(self, team_id: str, skill_id: str, content: str) -> dict:
        raise NotImplementedError("Human teams do not support skill management")

    async def list_mcp_servers(self, team_id: str) -> list[dict]:
        raise NotImplementedError("Human teams do not support MCP server management")

    async def configure_mcp(self, team_id: str, server_id: str, enabled: bool) -> dict:
        raise NotImplementedError("Human teams do not support MCP server management")

    async def get_model_config(self, team_id: str) -> dict:
        raise NotImplementedError("Human teams do not support model configuration")

    async def set_model_config(self, team_id: str, config: dict) -> dict:
        raise NotImplementedError("Human teams do not support model configuration")

    async def get_team_status(self, team_id: str) -> dict:
        raise NotImplementedError("Human teams do not support programmatic status check")
