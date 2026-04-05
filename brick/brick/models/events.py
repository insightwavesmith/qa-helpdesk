"""Event and Command models for Brick Engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from enum import Enum
import time
import uuid


class WorkflowStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SUSPENDED = "suspended"


class BlockStatus(Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    GATE_CHECKING = "gate_checking"
    WAITING_APPROVAL = "waiting_approval"
    COMPLETED = "completed"
    FAILED = "failed"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


@dataclass
class Event:
    type: str  # "workflow.started", "block.completed", etc.
    data: dict = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
    id: str = field(default_factory=lambda: str(uuid.uuid4()))


@dataclass
class Command:
    type: str  # "start_block", "check_gate", "emit_event", "save_checkpoint"
    data: dict = field(default_factory=dict)


@dataclass
class StartBlockCommand(Command):
    type: str = "start_block"
    block_id: str = ""
    adapter: str = ""


@dataclass
class CheckGateCommand(Command):
    type: str = "check_gate"
    block_id: str = ""


@dataclass
class EmitEventCommand(Command):
    type: str = "emit_event"
    event: Event | None = None


@dataclass
class SaveCheckpointCommand(Command):
    type: str = "save_checkpoint"


@dataclass
class RetryAdapterCommand(Command):
    type: str = "retry_adapter"
    block_id: str = ""
    adapter: str = ""
    retry_count: int = 0
    delay: float = 5.0


@dataclass
class NotifyCommand(Command):
    type: str = "notify"
    data: dict = field(default_factory=dict)


@dataclass
class CompeteStartCommand(Command):
    type: str = "compete_start"
    block_id: str = ""
    teams: list[str] = field(default_factory=list)
    judge: dict = field(default_factory=dict)
