"""Event and Command models for Brick Engine."""

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
    COMPLETED = "completed"
    FAILED = "failed"
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
