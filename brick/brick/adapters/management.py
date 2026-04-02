"""TeamManagementAdapter — management interface separated from execution (ISP)."""

from __future__ import annotations

from abc import ABC, abstractmethod


class TeamManagementAdapter(ABC):
    """Team management interface. Separated from execution (TeamAdapter) per ISP."""

    @abstractmethod
    async def list_members(self, team_id: str) -> list[dict]:
        ...

    @abstractmethod
    async def add_member(self, team_id: str, config: dict) -> dict:
        ...

    @abstractmethod
    async def remove_member(self, team_id: str, member_id: str) -> bool:
        ...

    @abstractmethod
    async def list_skills(self, team_id: str) -> list[dict]:
        ...

    @abstractmethod
    async def get_skill_content(self, team_id: str, skill_id: str) -> str:
        ...

    @abstractmethod
    async def update_skill(self, team_id: str, skill_id: str, content: str) -> dict:
        ...

    @abstractmethod
    async def list_mcp_servers(self, team_id: str) -> list[dict]:
        ...

    @abstractmethod
    async def configure_mcp(self, team_id: str, server_id: str, enabled: bool) -> dict:
        ...

    @abstractmethod
    async def get_model_config(self, team_id: str) -> dict:
        ...

    @abstractmethod
    async def set_model_config(self, team_id: str, config: dict) -> dict:
        ...

    @abstractmethod
    async def get_team_status(self, team_id: str) -> dict:
        ...
