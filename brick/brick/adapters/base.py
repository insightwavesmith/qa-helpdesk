"""TeamAdapter — abstract base class for all execution adapters."""

from __future__ import annotations

from abc import ABC, abstractmethod

from brick.models.block import Block
from brick.models.team import AdapterStatus


class TeamAdapter(ABC):
    """Base class for team adapters that execute blocks."""

    @abstractmethod
    async def start_block(self, block: Block, context: dict) -> str:
        """Start block execution. Returns execution_id."""
        ...

    @abstractmethod
    async def check_status(self, execution_id: str) -> AdapterStatus:
        """Check execution status."""
        ...

    @abstractmethod
    async def get_artifacts(self, execution_id: str) -> list[str]:
        """Get artifacts produced by execution."""
        ...

    @abstractmethod
    async def cancel(self, execution_id: str) -> bool:
        """Cancel execution. Returns True if successful."""
        ...

    # Optional methods with default implementations
    async def send_signal(self, execution_id: str, signal: dict) -> None:
        pass

    async def get_logs(self, execution_id: str) -> str:
        return ""

    async def list_members(self) -> list[dict]:
        return []

    async def add_member(self, member: dict) -> str:
        return ""

    async def list_skills(self) -> list[dict]:
        return []

    async def update_skill(self, skill_id: str, config: dict) -> None:
        pass

    async def list_mcp_servers(self) -> list[dict]:
        return []

    async def configure_mcp(self, server_id: str, config: dict) -> None:
        pass

    async def get_model_config(self) -> dict:
        return {}

    async def set_model_config(self, config: dict) -> None:
        pass

    async def get_team_status(self) -> dict:
        return {}
