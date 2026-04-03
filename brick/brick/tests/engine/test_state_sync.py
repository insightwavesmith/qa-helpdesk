"""BS-001 ~ BS-020: Brick CLI 상태 동기화 TDD.

executor.py의 complete_block + _execute_command 수정 검증.
state_machine.py는 수정하지 않음 (정상).
"""

from __future__ import annotations

import json
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from brick.engine.checkpoint import CheckpointStore
from brick.engine.event_bus import EventBus
from brick.engine.executor import WorkflowExecutor
from brick.engine.state_machine import StateMachine
from brick.gates.base import GateExecutor
from brick.models.block import Block, DoneCondition
from brick.models.events import (
    BlockStatus,
    Event,
    StartBlockCommand,
    WorkflowStatus,
)
from brick.models.gate import GateResult
from brick.models.link import LinkDefinition
from brick.models.team import TeamDefinition
from brick.models.workflow import WorkflowDefinition, WorkflowInstance


# ── Fixtures ──

class MockAdapter:
    async def start_block(self, block, context):
        return f"exec-{block.id}"

    async def check_status(self, execution_id):
        return MagicMock(status="completed")


class AlwaysPassGateExecutor(GateExecutor):
    async def run_gates(self, block_instance, context):
        return GateResult(passed=True, detail="auto-pass")


class AlwaysFailGateExecutor(GateExecutor):
    async def run_gates(self, block_instance, context):
        return GateResult(passed=False, detail="auto-fail")


@pytest.fixture
def checkpoint_dir(tmp_path):
    return tmp_path / "checkpoints"


@pytest.fixture
def two_block_workflow():
    blocks = [
        Block(id="plan", what="Plan", done=DoneCondition(artifacts=["plan.md"])),
        Block(id="do", what="Do", done=DoneCondition(artifacts=["src/"])),
    ]
    links = [LinkDefinition(from_block="plan", to_block="do")]
    teams = {
        "plan": TeamDefinition(block_id="plan", adapter="mock"),
        "do": TeamDefinition(block_id="do", adapter="mock"),
    }
    return WorkflowDefinition(
        name="two-block", description="", blocks=blocks, links=links, teams=teams,
    )


@pytest.fixture
def three_block_workflow():
    blocks = [
        Block(id="plan", what="Plan", done=DoneCondition(artifacts=["plan.md"])),
        Block(id="do", what="Do", done=DoneCondition(artifacts=["src/"])),
        Block(id="check", what="Check", done=DoneCondition(artifacts=["gap.md"])),
    ]
    links = [
        LinkDefinition(from_block="plan", to_block="do"),
        LinkDefinition(from_block="do", to_block="check"),
    ]
    teams = {
        "plan": TeamDefinition(block_id="plan", adapter="mock"),
        "do": TeamDefinition(block_id="do", adapter="mock"),
        "check": TeamDefinition(block_id="check", adapter="mock"),
    }
    return WorkflowDefinition(
        name="three-block", description="", blocks=blocks, links=links, teams=teams,
    )


def make_executor(checkpoint_dir, gate_executor=None):
    return WorkflowExecutor(
        state_machine=StateMachine(),
        event_bus=EventBus(),
        checkpoint=CheckpointStore(checkpoint_dir),
        gate_executor=gate_executor or AlwaysPassGateExecutor(),
        adapter_pool={"mock": MockAdapter()},
    )


def start_workflow(executor, definition, feature="test-feat"):
    """Start workflow manually (without PresetLoader)."""
    instance = WorkflowInstance.from_definition(definition, feature, "test-task")
    event = Event(type="workflow.start")
    instance, commands = executor.state_machine.transition(instance, event)
    executor.checkpoint.save(instance.id, instance)
    for cmd in commands:
        instance = asyncio.run(
            executor._execute_command(instance, cmd)
        )
    # Reload from checkpoint to get updated state
    return executor.checkpoint.load(instance.id).id


# ══════════════════════════════════════════
# §1 상태 전이 체인 (BS-001 ~ BS-005)
# ══════════════════════════════════════════

class TestStateTransitionChain:

    def test_bs01_workflow_start_first_block_queued(self, checkpoint_dir, two_block_workflow):
        """BS-001: workflow.start → 첫 블록 QUEUED (state_machine이 QUEUED 설정)"""
        executor = make_executor(checkpoint_dir)
        instance = WorkflowInstance.from_definition(two_block_workflow, "feat", "task")
        event = Event(type="workflow.start")
        instance, commands = executor.state_machine.transition(instance, event)
        # state_machine이 첫 블록을 QUEUED로 설정
        assert instance.blocks["plan"].status == BlockStatus.QUEUED

    def test_bs02_execute_command_start_block_running(self, checkpoint_dir, two_block_workflow):
        """BS-002: _execute_command(StartBlockCommand) → status=RUNNING"""
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, two_block_workflow)
        instance = executor.checkpoint.load(wf_id)
        # _execute_command에서 block.started → state_machine → RUNNING
        assert instance.blocks["plan"].status == BlockStatus.RUNNING

    def test_bs03_complete_block_gate_checking(self, checkpoint_dir, two_block_workflow):
        """BS-003: complete_block → block.completed → GATE_CHECKING"""
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, two_block_workflow)

        # Intercept: gate_executor를 mock해서 gate 실행 직전 상태를 캡처
        states_captured = []
        original_run_gates = executor.gate_executor.run_gates

        async def capture_run_gates(block_instance, context):
            inst = executor.checkpoint.load(wf_id)
            states_captured.append(inst.blocks["plan"].status)
            return await original_run_gates(block_instance, context)

        executor.gate_executor.run_gates = capture_run_gates
        asyncio.run(
            executor.complete_block(wf_id, "plan")
        )
        # Gate 실행 시점에 GATE_CHECKING 상태여야 함
        assert states_captured[0] == BlockStatus.GATE_CHECKING

    def test_bs04_gate_pass_completed(self, checkpoint_dir, two_block_workflow):
        """BS-004: gate pass → block.gate_passed → COMPLETED"""
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, two_block_workflow)
        asyncio.run(
            executor.complete_block(wf_id, "plan")
        )
        instance = executor.checkpoint.load(wf_id)
        assert instance.blocks["plan"].status == BlockStatus.COMPLETED

    def test_bs05_full_chain_pending_to_completed(self, checkpoint_dir, two_block_workflow):
        """BS-005: 전체 체인 PENDING→QUEUED→RUNNING→GATE_CHECKING→COMPLETED"""
        executor = make_executor(checkpoint_dir)

        # PENDING
        instance = WorkflowInstance.from_definition(two_block_workflow, "feat", "task")
        assert instance.blocks["plan"].status == BlockStatus.PENDING

        # QUEUED (workflow.start)
        event = Event(type="workflow.start")
        instance, commands = executor.state_machine.transition(instance, event)
        assert instance.blocks["plan"].status == BlockStatus.QUEUED

        # Save and execute → RUNNING
        executor.checkpoint.save(instance.id, instance)
        for cmd in commands:
            instance = asyncio.run(
                executor._execute_command(instance, cmd)
            )
        instance = executor.checkpoint.load(instance.id)
        assert instance.blocks["plan"].status == BlockStatus.RUNNING

        # complete_block → GATE_CHECKING → COMPLETED
        asyncio.run(
            executor.complete_block(instance.id, "plan")
        )
        instance = executor.checkpoint.load(instance.id)
        assert instance.blocks["plan"].status == BlockStatus.COMPLETED


# ══════════════════════════════════════════
# §3.3 events.jsonl 기록 (BS-006 ~ BS-009)
# ══════════════════════════════════════════

class TestEventsJsonl:

    def test_bs06_block_started_recorded(self, checkpoint_dir, two_block_workflow):
        """BS-006: _execute_command 후 events.jsonl에 block.started 기록"""
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, two_block_workflow)
        events = executor.checkpoint.load_events(wf_id)
        started_events = [e for e in events if e.type == "block.started"]
        assert len(started_events) >= 1
        assert started_events[0].data["block_id"] == "plan"

    def test_bs07_block_completed_recorded(self, checkpoint_dir, two_block_workflow):
        """BS-007: complete_block 후 events.jsonl에 block.completed 기록"""
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, two_block_workflow)
        asyncio.run(
            executor.complete_block(wf_id, "plan")
        )
        events = executor.checkpoint.load_events(wf_id)
        completed_events = [e for e in events if e.type == "block.completed"]
        assert len(completed_events) >= 1
        assert completed_events[0].data["block_id"] == "plan"

    def test_bs08_block_gate_passed_recorded(self, checkpoint_dir, two_block_workflow):
        """BS-008: gate pass 후 events.jsonl에 block.gate_passed 기록"""
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, two_block_workflow)
        asyncio.run(
            executor.complete_block(wf_id, "plan")
        )
        events = executor.checkpoint.load_events(wf_id)
        gate_events = [e for e in events if e.type == "block.gate_passed"]
        assert len(gate_events) >= 1

    def test_bs09_event_order_started_completed_gate_passed(self, checkpoint_dir, two_block_workflow):
        """BS-009: 전체 실행 후 events.jsonl 순서: started→completed→gate_passed"""
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, two_block_workflow)
        asyncio.run(
            executor.complete_block(wf_id, "plan")
        )
        events = executor.checkpoint.load_events(wf_id)
        plan_events = [e for e in events if e.data.get("block_id") == "plan"]
        types = [e.type for e in plan_events]
        assert types == ["block.started", "block.completed", "block.gate_passed"]


# ══════════════════════════════════════════
# §3.4 state.json ↔ events.jsonl 일관성 (BS-010 ~ BS-013)
# ══════════════════════════════════════════

EVENT_TO_STATUS = {
    "block.started": BlockStatus.RUNNING,
    "block.completed": BlockStatus.GATE_CHECKING,
    "block.gate_passed": BlockStatus.COMPLETED,
    "block.gate_failed": BlockStatus.FAILED,
}


def verify_consistency(instance: WorkflowInstance, events: list[Event]) -> bool:
    for block_id, block_inst in instance.blocks.items():
        block_events = [e for e in events if e.data.get("block_id") == block_id]
        if not block_events:
            continue
        last_event = block_events[-1]
        expected = EVENT_TO_STATUS.get(last_event.type)
        if expected and block_inst.status != expected:
            # gate_failed + retry → RUNNING (not FAILED)
            if last_event.type == "block.gate_failed" and block_inst.status == BlockStatus.RUNNING:
                continue
            return False
    return True


class TestConsistency:

    def test_bs10_running_matches_block_started(self, checkpoint_dir, two_block_workflow):
        """BS-010: block RUNNING → 마지막 이벤트=block.started"""
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, two_block_workflow)
        instance = executor.checkpoint.load(wf_id)
        events = executor.checkpoint.load_events(wf_id)
        assert instance.blocks["plan"].status == BlockStatus.RUNNING
        plan_events = [e for e in events if e.data.get("block_id") == "plan"]
        assert plan_events[-1].type == "block.started"

    def test_bs11_gate_checking_matches_block_completed(self, checkpoint_dir, two_block_workflow):
        """BS-011: block GATE_CHECKING → 마지막 이벤트=block.completed"""
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, two_block_workflow)

        # Intercept gate execution to check mid-state
        states = {}
        original = executor.gate_executor.run_gates

        async def intercept(block_instance, context):
            inst = executor.checkpoint.load(wf_id)
            evts = executor.checkpoint.load_events(wf_id)
            states["status"] = inst.blocks["plan"].status
            plan_evts = [e for e in evts if e.data.get("block_id") == "plan"]
            states["last_event"] = plan_evts[-1].type if plan_evts else None
            return await original(block_instance, context)

        executor.gate_executor.run_gates = intercept
        asyncio.run(
            executor.complete_block(wf_id, "plan")
        )
        assert states["status"] == BlockStatus.GATE_CHECKING
        assert states["last_event"] == "block.completed"

    def test_bs12_completed_matches_gate_passed(self, checkpoint_dir, two_block_workflow):
        """BS-012: block COMPLETED → 마지막 이벤트=block.gate_passed"""
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, two_block_workflow)
        asyncio.run(
            executor.complete_block(wf_id, "plan")
        )
        instance = executor.checkpoint.load(wf_id)
        events = executor.checkpoint.load_events(wf_id)
        assert instance.blocks["plan"].status == BlockStatus.COMPLETED
        plan_events = [e for e in events if e.data.get("block_id") == "plan"]
        assert plan_events[-1].type == "block.gate_passed"

    def test_bs13_full_verify_consistency(self, checkpoint_dir, two_block_workflow):
        """BS-013: 전체 워크플로우 완료 후 verify_consistency() 통과"""
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, two_block_workflow)
        asyncio.run(
            executor.complete_block(wf_id, "plan")
        )
        asyncio.run(
            executor.complete_block(wf_id, "do")
        )
        instance = executor.checkpoint.load(wf_id)
        events = executor.checkpoint.load_events(wf_id)
        assert verify_consistency(instance, events) is True


# ══════════════════════════════════════════
# §4 엣지 케이스 (BS-014 ~ BS-018)
# ══════════════════════════════════════════

class TestEdgeCases:

    def test_bs14_no_gate_block_still_gate_checking(self, checkpoint_dir, two_block_workflow):
        """BS-014: Gate 없는 블록 → GATE_CHECKING 거쳐 COMPLETED"""
        # Default: no gates configured → GateResult(passed=True) 즉시
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, two_block_workflow)

        states_during_gate = []
        original = executor.gate_executor.run_gates

        async def capture(block_instance, context):
            inst = executor.checkpoint.load(wf_id)
            states_during_gate.append(inst.blocks["plan"].status)
            return await original(block_instance, context)

        executor.gate_executor.run_gates = capture
        asyncio.run(
            executor.complete_block(wf_id, "plan")
        )
        assert states_during_gate[0] == BlockStatus.GATE_CHECKING
        instance = executor.checkpoint.load(wf_id)
        assert instance.blocks["plan"].status == BlockStatus.COMPLETED

    def test_bs15_gate_failed_retry(self, checkpoint_dir):
        """BS-015: gate_failed + retry → GATE_CHECKING→RUNNING 재전이"""
        from brick.models.block import GateConfig, GateHandler
        # state_machine의 retry 로직 직접 검증 (gate config은 직렬화 시 소실되므로 in-memory)
        sm = StateMachine()
        blocks = [
            Block(
                id="plan", what="Plan",
                done=DoneCondition(artifacts=["plan.md"]),
                gate=GateConfig(
                    handlers=[GateHandler(type="command", command="test -f plan.md")],
                    on_fail="retry",
                    max_retries=3,
                ),
            ),
        ]
        definition = WorkflowDefinition(
            name="retry-test", description="", blocks=blocks, links=[],
            teams={"plan": TeamDefinition(block_id="plan", adapter="mock")},
        )
        instance = WorkflowInstance.from_definition(definition, "feat", "task")
        # workflow.start → QUEUED
        instance, _ = sm.transition(instance, Event(type="workflow.start"))
        # block.started → RUNNING
        instance, _ = sm.transition(instance, Event(type="block.started", data={"block_id": "plan"}))
        # block.completed → GATE_CHECKING
        instance, _ = sm.transition(instance, Event(type="block.completed", data={"block_id": "plan"}))
        assert instance.blocks["plan"].status == BlockStatus.GATE_CHECKING
        # gate_failed → retry → RUNNING
        instance, cmds = sm.transition(instance, Event(type="block.gate_failed", data={"block_id": "plan"}))
        assert instance.blocks["plan"].status == BlockStatus.RUNNING
        assert instance.blocks["plan"].retry_count == 1

    def test_bs16_gate_failed_retry_then_pass(self, checkpoint_dir):
        """BS-016: gate_failed + retry 후 재완료 → COMPLETED (state_machine in-memory 검증)"""
        from brick.models.block import GateConfig, GateHandler
        sm = StateMachine()
        blocks = [
            Block(
                id="plan", what="Plan",
                done=DoneCondition(artifacts=["plan.md"]),
                gate=GateConfig(
                    handlers=[GateHandler(type="command", command="test -f plan.md")],
                    on_fail="retry",
                    max_retries=3,
                ),
            ),
        ]
        definition = WorkflowDefinition(
            name="retry-pass", description="", blocks=blocks, links=[],
            teams={"plan": TeamDefinition(block_id="plan", adapter="mock")},
        )
        instance = WorkflowInstance.from_definition(definition, "feat", "task")
        # 1차: start → complete → gate_fail → retry → RUNNING
        instance, _ = sm.transition(instance, Event(type="workflow.start"))
        instance, _ = sm.transition(instance, Event(type="block.started", data={"block_id": "plan"}))
        instance, _ = sm.transition(instance, Event(type="block.completed", data={"block_id": "plan"}))
        instance, _ = sm.transition(instance, Event(type="block.gate_failed", data={"block_id": "plan"}))
        assert instance.blocks["plan"].status == BlockStatus.RUNNING

        # 2차: complete → gate_pass → COMPLETED
        instance, _ = sm.transition(instance, Event(type="block.completed", data={"block_id": "plan"}))
        instance, _ = sm.transition(instance, Event(type="block.gate_passed", data={"block_id": "plan"}))
        assert instance.blocks["plan"].status == BlockStatus.COMPLETED

    def test_bs17_resume_triggers_complete(self, checkpoint_dir, two_block_workflow):
        """BS-017: resume() → complete_block → 정상 전이"""
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, two_block_workflow)

        # resume — adapter.check_status returns "completed"
        asyncio.run(
            executor.resume(wf_id)
        )
        instance = executor.checkpoint.load(wf_id)
        # plan이 COMPLETED가 되어야 함
        assert instance.blocks["plan"].status == BlockStatus.COMPLETED

    def test_bs18_block_started_duplicate_ignored(self, checkpoint_dir, two_block_workflow):
        """BS-018: block.started 중복 호출 → 무시 (이미 RUNNING)"""
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, two_block_workflow)
        instance = executor.checkpoint.load(wf_id)
        assert instance.blocks["plan"].status == BlockStatus.RUNNING

        # 중복 block.started 이벤트
        dup_event = Event(type="block.started", data={"block_id": "plan"})
        instance2, commands = executor.state_machine.transition(instance, dup_event)
        # 이미 RUNNING이므로 상태 변화 없어야 함
        assert instance2.blocks["plan"].status == BlockStatus.RUNNING


# ══════════════════════════════════════════
# 다중 블록 워크플로우 (BS-019 ~ BS-020)
# ══════════════════════════════════════════

class TestMultiBlock:

    def test_bs19_block1_completed_block2_starts(self, checkpoint_dir, two_block_workflow):
        """BS-019: 2블록 순차: block1 COMPLETED → block2 QUEUED→RUNNING"""
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, two_block_workflow)

        # plan complete → do starts
        asyncio.run(
            executor.complete_block(wf_id, "plan")
        )
        instance = executor.checkpoint.load(wf_id)
        assert instance.blocks["plan"].status == BlockStatus.COMPLETED
        # do가 시작됨 (RUNNING — _execute_command에서 block.started 전이)
        assert instance.blocks["do"].status == BlockStatus.RUNNING

    def test_bs20_three_blocks_workflow_completed(self, checkpoint_dir, three_block_workflow):
        """BS-020: 3블록 전체 완료 → workflow.status=COMPLETED"""
        executor = make_executor(checkpoint_dir)
        wf_id = start_workflow(executor, three_block_workflow)

        asyncio.run(
            executor.complete_block(wf_id, "plan")
        )
        asyncio.run(
            executor.complete_block(wf_id, "do")
        )
        asyncio.run(
            executor.complete_block(wf_id, "check")
        )
        instance = executor.checkpoint.load(wf_id)
        assert instance.status == WorkflowStatus.COMPLETED
        assert all(
            b.status == BlockStatus.COMPLETED
            for b in instance.blocks.values()
        )
