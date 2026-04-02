"""TaskQueue — file-based priority queue for block executions."""

from __future__ import annotations

import json
import time
from pathlib import Path


class TaskQueue:
    """File-based task queue with priority support."""

    def __init__(self, queue_dir: Path) -> None:
        self.queue_dir = queue_dir
        self.queue_dir.mkdir(parents=True, exist_ok=True)

    def enqueue(self, block_execution: dict) -> None:
        self.enqueue_priority(block_execution, priority=2)

    def enqueue_priority(self, block_execution: dict, priority: int) -> None:
        ts = time.time_ns()
        filename = f"{priority:01d}-{ts}.json"
        path = self.queue_dir / filename
        path.write_text(json.dumps(block_execution, ensure_ascii=False, indent=2))

    def dequeue(self, adapter_name: str | None = None) -> dict | None:
        tasks = sorted(self.queue_dir.glob("*.json"))
        for task_path in tasks:
            data = json.loads(task_path.read_text())
            if adapter_name is None or data.get("adapter") == adapter_name:
                task_path.unlink()
                return data
        return None

    def peek(self) -> list[dict]:
        tasks = sorted(self.queue_dir.glob("*.json"))
        result = []
        for task_path in tasks:
            data = json.loads(task_path.read_text())
            result.append(data)
        return result
