"""Block model and related configs for Brick Engine."""

from __future__ import annotations

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

    def to_dict(self) -> dict:
        return {
            "approver": self.approver,
            "channel": self.channel,
            "slack_channel": self.slack_channel,
            "dashboard_url": self.dashboard_url,
            "timeout_seconds": self.timeout_seconds,
            "on_timeout": self.on_timeout,
            "reminder_interval": self.reminder_interval,
            "max_reminders": self.max_reminders,
            "context_artifacts": self.context_artifacts,
        }

    @classmethod
    def from_dict(cls, data: dict) -> ApprovalConfig:
        return cls(
            approver=data.get("approver", ""),
            channel=data.get("channel", "slack"),
            slack_channel=data.get("slack_channel", "C0AN7ATS4DD"),
            dashboard_url=data.get("dashboard_url", ""),
            timeout_seconds=data.get("timeout_seconds", 86400),
            on_timeout=data.get("on_timeout", "escalate"),
            reminder_interval=data.get("reminder_interval", 3600),
            max_reminders=data.get("max_reminders", 3),
            context_artifacts=data.get("context_artifacts", []),
        )


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
    metadata: dict | None = None  # http 타입: method, body 등 추가 설정

    def to_dict(self) -> dict:
        d: dict = {"type": self.type, "timeout": self.timeout, "on_fail": self.on_fail,
                    "confidence_threshold": self.confidence_threshold, "retries": self.retries}
        if self.command is not None:
            d["command"] = self.command
        if self.url is not None:
            d["url"] = self.url
        if self.headers is not None:
            d["headers"] = self.headers
        if self.prompt is not None:
            d["prompt"] = self.prompt
        if self.model is not None:
            d["model"] = self.model
        if self.agent_prompt is not None:
            d["agent_prompt"] = self.agent_prompt
        if self.metric is not None:
            d["metric"] = self.metric
        if self.threshold is not None:
            d["threshold"] = self.threshold
        if self.approval is not None:
            d["approval"] = self.approval.to_dict()
        if self.metadata is not None:
            d["metadata"] = self.metadata
        return d

    @classmethod
    def from_dict(cls, data: dict) -> GateHandler:
        approval_data = data.get("approval")
        return cls(
            type=data["type"],
            command=data.get("command"),
            url=data.get("url"),
            headers=data.get("headers"),
            prompt=data.get("prompt"),
            model=data.get("model"),
            agent_prompt=data.get("agent_prompt"),
            timeout=data.get("timeout", 30),
            on_fail=data.get("on_fail", "fail"),
            confidence_threshold=data.get("confidence_threshold", 0.8),
            retries=data.get("retries", 1),
            metric=data.get("metric"),
            threshold=data.get("threshold"),
            approval=ApprovalConfig.from_dict(approval_data) if approval_data else None,
            metadata=data.get("metadata"),
        )


@dataclass
class ReviewConfig:
    coo: bool = False
    timeout: int = 3600
    on_timeout: str = "auto_approve"

    def to_dict(self) -> dict:
        return {"coo": self.coo, "timeout": self.timeout, "on_timeout": self.on_timeout}

    @classmethod
    def from_dict(cls, data: dict) -> ReviewConfig:
        return cls(
            coo=data.get("coo", False),
            timeout=data.get("timeout", 3600),
            on_timeout=data.get("on_timeout", "auto_approve"),
        )


@dataclass
class ReviewRejectConfig:
    max_reviews: int = 3
    on_exhaust: str = "escalate"

    def to_dict(self) -> dict:
        return {"max_reviews": self.max_reviews, "on_exhaust": self.on_exhaust}

    @classmethod
    def from_dict(cls, data: dict) -> ReviewRejectConfig:
        return cls(
            max_reviews=data.get("max_reviews", 3),
            on_exhaust=data.get("on_exhaust", "escalate"),
        )


@dataclass
class GateConfig:
    handlers: list[GateHandler] = field(default_factory=list)
    review: ReviewConfig | None = None
    evaluation: str = "sequential"  # sequential | parallel | vote
    on_fail: str = "retry"  # retry | rollback | escalate | skip
    max_retries: int = 3
    on_review_reject: ReviewRejectConfig | None = None

    def to_dict(self) -> dict:
        d: dict = {
            "handlers": [h.to_dict() for h in self.handlers],
            "evaluation": self.evaluation,
            "on_fail": self.on_fail,
            "max_retries": self.max_retries,
        }
        if self.review is not None:
            d["review"] = self.review.to_dict()
        if self.on_review_reject is not None:
            d["on_review_reject"] = self.on_review_reject.to_dict()
        return d

    @classmethod
    def from_dict(cls, data: dict) -> GateConfig:
        review_data = data.get("review")
        reject_data = data.get("on_review_reject")
        return cls(
            handlers=[GateHandler.from_dict(h) for h in data.get("handlers", [])],
            review=ReviewConfig.from_dict(review_data) if review_data else None,
            evaluation=data.get("evaluation", "sequential"),
            on_fail=data.get("on_fail", "retry"),
            max_retries=data.get("max_retries", 3),
            on_review_reject=ReviewRejectConfig.from_dict(reject_data) if reject_data else None,
        )


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
