"""CheckpointStore — file-based atomic checkpoint persistence."""

from __future__ import annotations

import json
from pathlib import Path

from brick.models.events import Event, WorkflowStatus
from brick.models.workflow import WorkflowInstance


class CheckpointStore:
    """Atomic file-based checkpoint store. Uses tmp→rename for atomicity."""

    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir

    def save(self, workflow_id: str, state: WorkflowInstance) -> None:
        path = self.base_dir / workflow_id / "state.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(state.to_dict(), indent=2, ensure_ascii=False))
        tmp.rename(path)

    def load(self, workflow_id: str) -> WorkflowInstance | None:
        path = self.base_dir / workflow_id / "state.json"
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        return WorkflowInstance.from_dict(data)

    def list_active(self) -> list[str]:
        active = []
        if not self.base_dir.exists():
            return active
        for wf_dir in self.base_dir.iterdir():
            if not wf_dir.is_dir():
                continue
            state_file = wf_dir / "state.json"
            if state_file.exists():
                try:
                    data = json.loads(state_file.read_text())
                    status = data.get("status", "")
                    if status not in (WorkflowStatus.COMPLETED.value, WorkflowStatus.FAILED.value):
                        active.append(wf_dir.name)
                except (json.JSONDecodeError, KeyError):
                    continue
        return active

    def save_event(self, workflow_id: str, event: Event) -> None:
        path = self.base_dir / workflow_id / "events.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        event_data = {
            "type": event.type,
            "data": event.data,
            "timestamp": event.timestamp,
            "id": event.id,
        }
        with open(path, "a") as f:
            f.write(json.dumps(event_data, ensure_ascii=False) + "\n")

    def load_events(self, workflow_id: str) -> list[Event]:
        path = self.base_dir / workflow_id / "events.jsonl"
        if not path.exists():
            return []
        events = []
        for line in path.read_text().strip().split("\n"):
            if not line:
                continue
            data = json.loads(line)
            events.append(Event(
                type=data["type"],
                data=data.get("data", {}),
                timestamp=data.get("timestamp", 0.0),
                id=data.get("id", ""),
            ))
        return events
