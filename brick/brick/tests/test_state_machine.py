"""BK-01~07: StateMachine tests."""

from __future__ import annotations

import pytest

from brick.engine.state_machine import StateMachine
from brick.models.events import Event, WorkflowStatus, BlockStatus


class TestStateMachineWorkflowTransitions:
    """BK-01~06: Workflow-level state transitions."""

    def setup_method(self):
        self.sm = StateMachine()

    def test_bk01_pending_to_running(self, workflow_instance):
        """BK-01: workflow.start → PENDING→RUNNING, first block QUEUED."""
        event = Event(type="workflow.start")
        new_wf, commands = self.sm.transition(workflow_instance, event)

        assert new_wf.status == WorkflowStatus.RUNNING
        assert new_wf.blocks["plan"].status == BlockStatus.QUEUED
        assert new_wf.current_block_id == "plan"
        # Must produce StartBlock + EmitEvent + SaveCheckpoint commands
        cmd_types = [c.type for c in commands]
        assert "start_block" in cmd_types
        assert "save_checkpoint" in cmd_types

    def test_bk02_running_to_completed(self, running_workflow):
        """BK-02: All blocks completed → workflow COMPLETED."""
        wf = running_workflow
        # Complete all blocks directly
        for block_id in wf.blocks:
            wf.blocks[block_id].status = BlockStatus.COMPLETED

        # Last block gate pass should complete workflow
        wf.blocks["review"].status = BlockStatus.GATE_CHECKING
        wf.current_block_id = "review"
        event = Event(type="block.gate_passed", data={"block_id": "review"})
        new_wf, commands = self.sm.transition(wf, event)

        assert new_wf.status == WorkflowStatus.COMPLETED

    def test_bk03_running_to_failed(self, running_workflow):
        """BK-03: workflow.fail → RUNNING→FAILED."""
        event = Event(type="workflow.fail")
        new_wf, commands = self.sm.transition(running_workflow, event)

        assert new_wf.status == WorkflowStatus.FAILED
        assert any(c.type == "save_checkpoint" for c in commands)

    def test_bk04_running_to_suspended(self, running_workflow):
        """BK-04: workflow.suspend → RUNNING→SUSPENDED."""
        event = Event(type="workflow.suspend")
        new_wf, commands = self.sm.transition(running_workflow, event)

        assert new_wf.status == WorkflowStatus.SUSPENDED

    def test_bk05_suspended_to_running(self, running_workflow):
        """BK-05: workflow.resume → SUSPENDED→RUNNING."""
        running_workflow.status = WorkflowStatus.SUSPENDED
        event = Event(type="workflow.resume")
        new_wf, commands = self.sm.transition(running_workflow, event)

        assert new_wf.status == WorkflowStatus.RUNNING

    def test_bk06_transition_is_pure(self, workflow_instance):
        """BK-06: transition() is pure — original workflow unchanged, no IO."""
        original_status = workflow_instance.status
        original_id = id(workflow_instance)
        event = Event(type="workflow.start")

        new_wf, commands = self.sm.transition(workflow_instance, event)

        # Original must be unchanged
        assert workflow_instance.status == original_status
        assert id(new_wf) != original_id
        # New workflow must be different
        assert new_wf.status == WorkflowStatus.RUNNING


class TestStateMachineBlockTransitions:
    """BK-07: Full block transition chain."""

    def setup_method(self):
        self.sm = StateMachine()

    def test_bk07_block_full_chain(self, workflow_instance):
        """BK-07: Block chain: pending→queued→running→gate_checking→completed."""
        wf = workflow_instance

        # Step 1: workflow.start → first block QUEUED
        wf, cmds = self.sm.transition(wf, Event(type="workflow.start"))
        assert wf.blocks["plan"].status == BlockStatus.QUEUED

        # Step 2: block.started → RUNNING
        wf, cmds = self.sm.transition(wf, Event(
            type="block.started", data={"block_id": "plan"}
        ))
        assert wf.blocks["plan"].status == BlockStatus.RUNNING

        # Step 3: block.completed → GATE_CHECKING
        wf, cmds = self.sm.transition(wf, Event(
            type="block.completed", data={"block_id": "plan", "artifacts": ["plan.md"]}
        ))
        assert wf.blocks["plan"].status == BlockStatus.GATE_CHECKING
        assert any(c.type == "check_gate" for c in cmds)

        # Step 4: block.gate_passed → COMPLETED, next block QUEUED
        wf, cmds = self.sm.transition(wf, Event(
            type="block.gate_passed", data={"block_id": "plan"}
        ))
        assert wf.blocks["plan"].status == BlockStatus.COMPLETED
        assert wf.blocks["implement"].status == BlockStatus.QUEUED
        assert any(c.type == "start_block" for c in cmds)
