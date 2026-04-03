"""Block model and related configs for Brick Engine."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class DoneCondition:
    artifacts: list[str] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    custom: list[str] = field(default_factory=list)


@dataclass
class ApprovalConfig:
    """승인 Gate 전용 설정."""
    approver: str = ""
    channel: str = "slack"
    slack_channel: str = "C0AN7ATS4DD"
    dashboard_url: str = ""
    timeout_seconds: int = 86400
    on_timeout: str = "escalate"
    reminder_interval: int = 3600
    max_reminders: int = 3
    context_artifacts: list[str] = field(default_factory=list)


@dataclass
class GateHandler:
    type: str  # command | http | prompt | agent | metric | approval
    command: str | None = None
    url: str | None = None
    headers: dict | None = None
    prompt: str | None = None
    model: str | None = None
    agent_prompt: str | None = None
    timeout: int = 30
    on_fail: str = "fail"  # fail | warn | skip
    confidence_threshold: float = 0.8
    retries: int = 1
    metric: str | None = None  # metric name (e.g. match_rate, build_pass)
    threshold: float | None = None  # metric threshold value
    approval: ApprovalConfig | None = None  # approval 타입일 때 사용


@dataclass
class ReviewConfig:
    coo: bool = False
    timeout: int = 3600
    on_timeout: str = "auto_approve"


@dataclass
class ReviewRejectConfig:
    max_reviews: int = 3
    on_exhaust: str = "escalate"


@dataclass
class GateConfig:
    handlers: list[GateHandler] = field(default_factory=list)
    review: ReviewConfig | None = None
    evaluation: str = "sequential"  # sequential | parallel | vote
    on_fail: str = "retry"  # retry | rollback | escalate | skip
    max_retries: int = 3
    on_review_reject: ReviewRejectConfig | None = None


@dataclass
class InputConfig:
    from_block: str = ""
    artifacts: list[str] = field(default_factory=list)


@dataclass
class Block:
    id: str
    what: str
    done: DoneCondition
    type: str = "Custom"
    description: str = ""
    gate: GateConfig | None = None
    input: InputConfig | None = None
    timeout: int | None = None
    idempotent: bool = True
    metadata: dict = field(default_factory=dict)
    fallback_adapter: str | None = None
