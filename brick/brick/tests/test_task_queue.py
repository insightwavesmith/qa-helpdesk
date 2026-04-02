"""BK-15~16: TaskQueue tests."""

from __future__ import annotations

import time
import pytest
from pathlib import Path

from brick.engine.task_queue import TaskQueue


class TestTaskQueue:
    """BK-15~16: File-based priority queue."""

    def test_bk15_fifo_order(self, queue_dir):
        """BK-15: enqueue → dequeue maintains FIFO order."""
        q = TaskQueue(queue_dir)

        q.enqueue({"block_id": "A", "adapter": "claude_code"})
        time.sleep(0.001)  # Ensure different timestamps
        q.enqueue({"block_id": "B", "adapter": "claude_code"})
        time.sleep(0.001)
        q.enqueue({"block_id": "C", "adapter": "claude_code"})

        assert q.dequeue()["block_id"] == "A"
        assert q.dequeue()["block_id"] == "B"
        assert q.dequeue()["block_id"] == "C"
        assert q.dequeue() is None

    def test_bk16_priority_queue(self, queue_dir):
        """BK-16: L0 (priority=0) dequeues before L2 (priority=2)."""
        q = TaskQueue(queue_dir)

        # Enqueue L2 first, then L0
        q.enqueue_priority({"block_id": "low", "priority": "L2"}, priority=2)
        q.enqueue_priority({"block_id": "high", "priority": "L0"}, priority=0)

        # L0 should come first
        first = q.dequeue()
        assert first["block_id"] == "high"

        second = q.dequeue()
        assert second["block_id"] == "low"

    def test_peek_returns_all(self, queue_dir):
        """peek() returns all items without removing them."""
        q = TaskQueue(queue_dir)
        q.enqueue({"block_id": "A"})
        q.enqueue({"block_id": "B"})

        items = q.peek()
        assert len(items) == 2

        # Items still in queue
        assert q.dequeue() is not None
        assert q.dequeue() is not None

    def test_dequeue_with_adapter_filter(self, queue_dir):
        """dequeue with adapter_name filter returns matching task."""
        q = TaskQueue(queue_dir)
        q.enqueue({"block_id": "A", "adapter": "human"})
        time.sleep(0.001)
        q.enqueue({"block_id": "B", "adapter": "claude_code"})

        result = q.dequeue(adapter_name="claude_code")
        assert result["block_id"] == "B"
