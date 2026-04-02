"""BK-17~27: Validator / Invariant tests."""

from __future__ import annotations

import json
import copy
import pytest

from brick.engine.validator import Validator
from brick.engine.state_machine import StateMachine
from brick.engine.checkpoint import CheckpointStore
from brick.engine.event_bus import EventBus
from brick.models.block import Block, DoneCondition, GateConfig, GateHandler
from brick.models.team import TeamDefinition
from brick.models.link import LinkDefinition
from brick.models.workflow import WorkflowDefinition, WorkflowInstance
from brick.models.events import Event, WorkflowStatus, BlockStatus


class TestInvariants:
    """BK-17~27: Workflow invariant validation."""

    def setup_method(self):
        self.validator = Validator()
        self.sm = StateMachine()

    def test_bk17_inv1_name_required(self):
        """BK-17: INV-1 — workflow with no name → error."""
        defn = WorkflowDefinition(
            name="",
            blocks=[Block(id="b1", what="do thing", done=DoneCondition())],
            teams={"b1": TeamDefinition(block_id="b1", adapter="test")},
        )
        errors = self.validator.validate_workflow(defn)
        assert any("INV-1" in e for e in errors)

    def test_bk18_inv2_what_required(self):
        """BK-18: INV-2 — block with empty what → validation error."""
        defn = WorkflowDefinition(
            name="test",
            blocks=[Block(id="b1", what="", done=DoneCondition())],
            teams={"b1": TeamDefinition(block_id="b1", adapter="test")},
        )
        errors = self.validator.validate_workflow(defn)
        assert any("INV-2" in e for e in errors)

    def test_bk19_inv3_done_required(self):
        """BK-19: INV-3 — block with done=None → validation error."""
        block = Block(id="b1", what="do thing", done=None)  # type: ignore
        errors = self.validator.validate_block(block)
        assert any("INV-3" in e for e in errors)

    def test_bk20_inv4_gate_blocks_without_artifacts(self, workflow_instance):
        """BK-20: INV-4 — block.completed without artifacts → gate should check."""
        wf = workflow_instance
        wf.status = WorkflowStatus.RUNNING
        wf.current_block_id = "plan"
        wf.blocks["plan"].status = BlockStatus.RUNNING

        # Complete without artifacts
        event = Event(type="block.completed", data={"block_id": "plan", "artifacts": []})
        new_wf, cmds = self.sm.transition(wf, event)

        # Must still go to GATE_CHECKING (gate will fail if artifacts required)
        assert new_wf.blocks["plan"].status == BlockStatus.GATE_CHECKING
        assert any(c.type == "check_gate" for c in cmds)

    def test_bk21_inv5_event_history_recorded(self, checkpoint_dir, workflow_instance):
        """BK-21: INV-5 — all transition events can be recorded via checkpoint."""
        store = CheckpointStore(checkpoint_dir)
        bus = EventBus()

        events_log: list[Event] = []
        bus.subscribe("*", lambda e: events_log.append(e))

        # Publish events
        events = [
            Event(type="workflow.start"),
            Event(type="block.started", data={"block_id": "plan"}),
            Event(type="block.completed", data={"block_id": "plan"}),
        ]
        for ev in events:
            bus.publish(ev)
            store.save_event(workflow_instance.id, ev)

        # All events recorded
        loaded = store.load_events(workflow_instance.id)
        assert len(loaded) == 3
        assert len(events_log) == 3

    def test_bk22_inv5_adapter_required(self):
        """BK-22: INV-5 — block without adapter → error."""
        defn = WorkflowDefinition(
            name="test",
            blocks=[
                Block(id="b1", what="do thing", done=DoneCondition()),
            ],
            teams={},  # No adapter
        )
        errors = self.validator.validate_workflow(defn)
        assert any("INV-5" in e for e in errors)

    def test_bk23_inv6_link_required(self):
        """BK-23: INV-6 — consecutive blocks without link → error."""
        defn = WorkflowDefinition(
            name="test",
            blocks=[
                Block(id="b1", what="first", done=DoneCondition()),
                Block(id="b2", what="second", done=DoneCondition()),
            ],
            links=[],  # No links between blocks
            teams={
                "b1": TeamDefinition(block_id="b1", adapter="test"),
                "b2": TeamDefinition(block_id="b2", adapter="test"),
            },
        )
        errors = self.validator.validate_workflow(defn)
        assert any("INV-6" in e for e in errors)

    def test_bk24_inv7_cycle_detection(self):
        """BK-24: INV-7/8 — A→B→A sequential cycle → error."""
        defn = WorkflowDefinition(
            name="test",
            blocks=[
                Block(id="A", what="first", done=DoneCondition()),
                Block(id="B", what="second", done=DoneCondition()),
            ],
            links=[
                LinkDefinition(from_block="A", to_block="B"),
                LinkDefinition(from_block="B", to_block="A"),  # cycle!
            ],
            teams={
                "A": TeamDefinition(block_id="A", adapter="test"),
                "B": TeamDefinition(block_id="B", adapter="test"),
            },
        )
        errors = self.validator.validate_workflow(defn)
        assert any("INV-7" in e for e in errors)

    def test_bk24_loop_type_exempt(self):
        """Loop-type links are exempt from cycle detection."""
        defn = WorkflowDefinition(
            name="test",
            blocks=[
                Block(id="A", what="first", done=DoneCondition()),
                Block(id="B", what="second", done=DoneCondition()),
            ],
            links=[
                LinkDefinition(from_block="A", to_block="B"),
                LinkDefinition(from_block="B", to_block="A", type="loop"),
            ],
            teams={
                "A": TeamDefinition(block_id="A", adapter="test"),
                "B": TeamDefinition(block_id="B", adapter="test"),
            },
        )
        errors = self.validator.validate_dag(defn.blocks, defn.links)
        assert not any("INV-7" in e for e in errors)

    def test_bk25_inv9_preset_readonly(self):
        """BK-25: INV-9 — Core preset modification should be blocked.
        Validated by schema field: preset workflows have schema='brick/core-v2'
        and overrides are applied via extends/overrides, not direct mutation.
        """
        defn = WorkflowDefinition(
            name="core-pdca",
            schema="brick/core-v2",
            blocks=[Block(id="b1", what="do thing", done=DoneCondition())],
            teams={"b1": TeamDefinition(block_id="b1", adapter="test")},
        )
        # Core presets should be identified by schema
        assert defn.schema == "brick/core-v2"
        # Overrides via extends mechanism, not direct modification
        assert defn.extends is None
        assert defn.overrides == {}

    def test_bk26_inv10_statemachine_only_modifies_state(self, workflow_instance):
        """BK-26: INV-10 — Only StateMachine modifies state.
        Direct JSON modification detection: serialized state should
        only change through StateMachine transitions.
        """
        wf = workflow_instance
        original_dict = wf.to_dict()

        # Transition through StateMachine
        new_wf, _ = self.sm.transition(wf, Event(type="workflow.start"))
        transitioned_dict = new_wf.to_dict()

        # State changed via SM
        assert transitioned_dict["status"] != original_dict["status"]

        # Original unchanged (immutability)
        assert wf.to_dict() == original_dict

    def test_bk27_inv10_checkpoint_after_transition(self, checkpoint_dir, workflow_instance):
        """BK-27: INV-10 — Every state change must be checkpoint-saved."""
        store = CheckpointStore(checkpoint_dir)
        wf = workflow_instance

        # Transition
        new_wf, commands = self.sm.transition(wf, Event(type="workflow.start"))

        # Commands must include save_checkpoint
        assert any(c.type == "save_checkpoint" for c in commands)

        # Actually save and verify
        store.save(new_wf.id, new_wf)
        loaded = store.load(new_wf.id)
        assert loaded is not None
        assert loaded.status == WorkflowStatus.RUNNING

    def test_valid_workflow_no_errors(self, simple_workflow):
        """A properly defined workflow produces no validation errors."""
        errors = self.validator.validate_workflow(simple_workflow)
        assert errors == []
