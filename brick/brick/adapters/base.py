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
