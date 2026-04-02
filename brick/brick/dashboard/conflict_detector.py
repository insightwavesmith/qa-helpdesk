"""Conflict detection for concurrent editing and gate timeout escalation."""

from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class ConflictEvent:
    resource_kind: str
    resource_name: str
    external_change_at: float
    local_version: str
    file_version: str


class ConflictDetector:
    """Detects external file changes that conflict with in-memory state."""

    def __init__(self):
        self._versions: dict[str, str] = {}

    def track(self, kind: str, name: str, version: str) -> None:
        self._versions[f"{kind}/{name}"] = version

    def check(self, kind: str, name: str, current_file_version: str) -> ConflictEvent | None:
        key = f"{kind}/{name}"
        tracked = self._versions.get(key)
        if tracked and tracked != current_file_version:
            return ConflictEvent(
                resource_kind=kind,
                resource_name=name,
                external_change_at=time.time(),
                local_version=tracked,
                file_version=current_file_version,
            )
        return None


class GateTimeoutHandler:
    """Handles gate timeout → escalation logic."""

    def check_timeout(self, gate_started_at: float, timeout_seconds: int, escalate_to: str) -> dict:
        elapsed = time.time() - gate_started_at
        if elapsed > timeout_seconds:
            return {
                "timed_out": True,
                "elapsed": elapsed,
                "action": "escalate",
                "escalate_to": escalate_to,
            }
        return {"timed_out": False, "elapsed": elapsed}
