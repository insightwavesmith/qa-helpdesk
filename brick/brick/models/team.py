"""Team models for Brick Engine."""

from dataclasses import dataclass, field


@dataclass
class TeamConfig:
    adapter: str  # "claude_agent_teams", "human", "webhook", etc.
    config: dict = field(default_factory=dict)


@dataclass
class CommunicationConfig:
    """MCP/tmux 통신 설정."""
    method: str = "mcp"          # "mcp" | "tmux"
    ack_required: bool = True
    ack_timeout: int = 30        # seconds
    retry_count: int = 3
    fallback_to_tmux: bool = True


@dataclass
class IdlePolicy:
    """팀원 idle 정책."""
    action: str = "terminate"    # "terminate" | "suspend" | "keep"
    timeout_seconds: int = 300
    notify_before: bool = True


@dataclass
class TeammateSpec:
    """팀원 스펙 정의."""
    name: str = ""
    role: str = "developer"      # "developer" | "researcher" | "qa"
    lifetime: str = "persistent"  # "persistent" | "ephemeral"
    model: str = "opus"


@dataclass
class TeamDefinition:
    block_id: str = ""
    adapter: str = ""
    config: dict = field(default_factory=dict)
    communication: CommunicationConfig = field(default_factory=CommunicationConfig)
    teammates: list[TeammateSpec] = field(default_factory=list)
    idle_policy: IdlePolicy = field(default_factory=IdlePolicy)
    max_depth: int = 1


@dataclass
class AdapterStatus:
    status: str  # "running", "completed", "failed", "waiting_human"
    progress: float | None = None
    message: str | None = None
