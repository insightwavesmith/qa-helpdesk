"""Team models for Brick Engine."""

from dataclasses import dataclass, field


@dataclass
class TeamConfig:
    adapter: str  # "claude_agent_teams", "human", "webhook", etc.
    config: dict = field(default_factory=dict)


@dataclass
class TeamDefinition:
    block_id: str
    adapter: str
    config: dict = field(default_factory=dict)


@dataclass
class AdapterStatus:
    status: str  # "running", "completed", "failed", "waiting_human"
    progress: float | None = None
    message: str | None = None
