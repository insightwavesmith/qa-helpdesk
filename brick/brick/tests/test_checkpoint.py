"""BK-11~14: CheckpointStore tests."""

from __future__ import annotations

import json
import pytest
from pathlib import Path

from brick.engine.checkpoint import CheckpointStore
from brick.models.events import Event, WorkflowStatus, BlockStatus
from brick.models.workflow import WorkflowInstance


class TestCheckpointStore:
    """BK-11~14: Atomic checkpoint persistence."""

    def test_bk11_save_load_roundtrip(self, checkpoint_dir, workflow_instance):
        """BK-11: save → load produces identical state."""
        store = CheckpointStore(checkpoint_dir)
        wf = workflow_instance
        wf.status = WorkflowStatus.RUNNING

        store.save(wf.id, wf)
        loaded = store.load(wf.id)

        assert loaded is not None
        assert loaded.id == wf.id
        assert loaded.status == WorkflowStatus.RUNNING
        assert loaded.feature == wf.feature
        assert loaded.task == wf.task
        assert set(loaded.blocks.keys()) == set(wf.blocks.keys())

    def test_bk12_atomic_save_via_tmp_rename(self, checkpoint_dir, workflow_instance):
        """BK-12: Atomic save uses tmp→rename. No partial writes."""
        store = CheckpointStore(checkpoint_dir)
        wf = workflow_instance

        # After save, state.json must exist and no .tmp
        store.save(wf.id, wf)
        state_path = checkpoint_dir / wf.id / "state.json"
        tmp_path = checkpoint_dir / wf.id / "state.tmp"

        assert state_path.exists()
        assert not tmp_path.exists()

        # Verify content is valid JSON
        data = json.loads(state_path.read_text())
        assert data["id"] == wf.id

    def test_bk13_list_active(self, checkpoint_dir, simple_workflow):
        """BK-13: list_active() returns only running/pending workflows."""
        store = CheckpointStore(checkpoint_dir)

        # Create 2 running + 1 completed
        for i, status in enumerate([WorkflowStatus.RUNNING, WorkflowStatus.RUNNING, WorkflowStatus.COMPLETED]):
            wf = WorkflowInstance.from_definition(simple_workflow, feature=f"feat-{i}", task=f"task-{i}")
            wf.status = status
            store.save(wf.id, wf)

        active = store.list_active()
        assert len(active) == 2

    def test_bk14_save_event_append_only(self, checkpoint_dir):
        """BK-14: save_event() is append-only → 3 events = 3 lines in events.jsonl."""
        store = CheckpointStore(checkpoint_dir)
        wf_id = "test-workflow-1"

        events = [
            Event(type="workflow.started", data={"step": 1}),
            Event(type="block.started", data={"step": 2}),
            Event(type="block.completed", data={"step": 3}),
        ]
        for ev in events:
            store.save_event(wf_id, ev)

        # Check file has 3 lines
        events_path = checkpoint_dir / wf_id / "events.jsonl"
        lines = events_path.read_text().strip().split("\n")
        assert len(lines) == 3

        # Verify load
        loaded = store.load_events(wf_id)
        assert len(loaded) == 3
        assert loaded[0].type == "workflow.started"
        assert loaded[2].data == {"step": 3}

    def test_load_nonexistent_returns_none(self, checkpoint_dir):
        """Loading nonexistent workflow returns None."""
        store = CheckpointStore(checkpoint_dir)
        assert store.load("nonexistent") is None

    def test_load_events_nonexistent_returns_empty(self, checkpoint_dir):
        """Loading events for nonexistent workflow returns empty list."""
        store = CheckpointStore(checkpoint_dir)
        assert store.load_events("nonexistent") == []
