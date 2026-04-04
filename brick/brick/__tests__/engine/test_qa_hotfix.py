"""QA 핫픽스 검증 — gate_failed EventBus 발행 + role path traversal 방어 + approval waiting.

수정 대상:
- executor.py: complete_block()에서 gate_failed 이벤트 EventBus publish 누락
- executor.py: approval waiting → WAITING_APPROVAL 상태 전환 (BRK-QA-003)
- claude_local.py: _build_args()에서 role path traversal 미방어
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from brick.adapters.claude_local import ClaudeLocalAdapter
from brick.engine.checkpoint import CheckpointStore
from brick.engine.event_bus import EventBus
from brick.engine.executor import WorkflowExecutor
from brick.engine.state_machine import StateMachine
from brick.gates.base import GateExecutor
from brick.engine.validator import Validator
from brick.models.block import Block, DoneCondition, GateConfig
from brick.models.events import Event, BlockStatus, WorkflowStatus
from brick.models.gate import GateResult
from brick.models.link import LinkDefinition
from brick.models.team import TeamDefinition, AdapterStatus
from brick.models.workflow import WorkflowDefinition, WorkflowInstance


def test_gate_failed_event_reaches_slack_subscriber():
    """gate_failed 이벤트가 EventBus를 통해 SlackSubscriber에 도달하는지 검증."""
    bus = EventBus()
    received: list[Event] = []

    def on_gate_failed(event: Event) -> None:
        received.append(event)

    bus.subscribe("block.gate_failed", on_gate_failed)

    gate_event = Event(
        type="block.gate_failed",
        data={
            "block_id": "review",
            "workflow_id": "wf-001",
            "error": "artifacts missing",
            "reject_reason": "plan.md 누락",
            "retry_count": 1,
        },
    )
    bus.publish(gate_event)

    assert len(received) == 1
    assert received[0].type == "block.gate_failed"
    assert received[0].data["block_id"] == "review"
    assert received[0].data["reject_reason"] == "plan.md 누락"


def test_gate_passed_event_reaches_subscriber():
    """gate_passed 이벤트도 EventBus를 통해 구독자에게 도달하는지 확인 (일관성)."""
    bus = EventBus()
    received: list[Event] = []

    bus.subscribe("block.gate_passed", lambda e: received.append(e))

    gate_event = Event(
        type="block.gate_passed",
        data={
            "block_id": "implement",
            "workflow_id": "wf-002",
        },
    )
    bus.publish(gate_event)

    assert len(received) == 1
    assert received[0].type == "block.gate_passed"


def test_role_path_traversal_blocked():
    """role에 '..'이 포함되면 --agent 추가 안 됨."""
    adapter = ClaudeLocalAdapter({"role": "../../etc/passwd"})
    args = adapter._build_args()
    assert "--agent" not in args, f"path traversal role이 --agent로 전달됨: {args}"
    assert "../../etc/passwd" not in args


def test_role_normal_passes():
    """정상 role은 --agent에 포함됨."""
    adapter = ClaudeLocalAdapter({"role": "backend-dev"})
    args = adapter._build_args()
    assert "--agent" in args
    idx = args.index("--agent")
    assert args[idx + 1] == "backend-dev"


def test_role_with_project_path_traversal_blocked():
    """role에 '..'이 있고 project도 있을 때 --agent 추가 안 됨."""
    adapter = ClaudeLocalAdapter({"role": "../malicious", "project": "bscamp"})
    args = adapter._build_args()
    assert "--agent" not in args
    assert "../malicious" not in args


# ── BRK-QA-003: approval waiting 핫픽스 ──────────────────────────────

def _make_executor(tmp_path, gate_executor=None):
    """테스트용 WorkflowExecutor 생성 헬퍼."""
    checkpoint = CheckpointStore(tmp_path / "workflows")
    event_bus = EventBus()
    mock_adapter = AsyncMock()
    mock_adapter.start_block = AsyncMock(return_value="exec-123")
    mock_adapter.check_status = AsyncMock(return_value=AdapterStatus(status="completed"))
    mock_adapter.get_artifacts = AsyncMock(return_value=[])

    return WorkflowExecutor(
        state_machine=StateMachine(),
        event_bus=event_bus,
        checkpoint=checkpoint,
        gate_executor=gate_executor or GateExecutor(),
        adapter_pool={"human": mock_adapter},
        validator=Validator(),
    ), event_bus


def _make_workflow_instance(block_id="review"):
    """approval gate 테스트용 WorkflowInstance 생성."""
    block = Block(
        id=block_id,
        type="Do",
        what="review task",
        done=DoneCondition(artifacts=["report.md"]),
        gate=GateConfig(handlers=[], on_fail="retry"),
    )
    defn = WorkflowDefinition(
        name="test-approval",
        schema="brick/preset-v2",
        level=2,
        blocks=[block],
        links=[],
        teams={block_id: TeamDefinition(block_id=block_id, adapter="human", config={})},
    )
    instance = WorkflowInstance.from_definition(defn, feature="test", task="qa-003")
    instance.status = WorkflowStatus.RUNNING
    # block을 RUNNING 상태로 설정
    bi = instance.blocks[block_id]
    bi.status = BlockStatus.RUNNING
    bi.started_at = 1000.0
    instance.current_block_id = block_id
    return instance


@pytest.mark.asyncio
async def test_brk_qa_003_approval_waiting_sets_waiting_approval(tmp_path):
    """BRK-QA-003: approval waiting → block WAITING_APPROVAL 상태 전환."""
    gate_exec = GateExecutor()
    executor, event_bus = _make_executor(tmp_path, gate_exec)

    instance = _make_workflow_instance("review")
    executor.checkpoint.save(instance.id, instance)

    # gate가 waiting 반환하도록 mock
    waiting_result = GateResult(
        passed=False,
        detail="approval 대기",
        metadata={"status": "waiting", "approver": "smith", "channel": "slack"},
    )
    gate_exec.run_gates = AsyncMock(return_value=waiting_result)

    # EventBus 구독으로 이벤트 캡처
    captured_events: list[Event] = []
    event_bus.subscribe("block.gate_failed", lambda e: captured_events.append(e))
    event_bus.subscribe("gate.approval_pending", lambda e: captured_events.append(e))

    # complete_block 실행
    result = await executor.complete_block(instance.id, "review")

    # 검증: gate_result 반환
    assert result is not None
    assert not result.passed

    # 검증: block 상태가 WAITING_APPROVAL
    saved = executor.checkpoint.load(instance.id)
    assert saved.blocks["review"].status == BlockStatus.WAITING_APPROVAL

    # 검증: gate_failed + approval_pending 이벤트 발행됨
    event_types = [e.type for e in captured_events]
    assert "block.gate_failed" in event_types
    assert "gate.approval_pending" in event_types

    # 검증: workflow가 FAILED가 아님 (state_machine retry/fail 분기 안 탐)
    assert saved.status == WorkflowStatus.RUNNING


@pytest.mark.asyncio
async def test_brk_qa_003_approval_approve_resumes(tmp_path):
    """BRK-QA-003: approve 후 complete_block 재호출 → gate_passed → 다음 블록."""
    gate_exec = GateExecutor()
    executor, event_bus = _make_executor(tmp_path, gate_exec)

    instance = _make_workflow_instance("review")
    # WAITING_APPROVAL 상태로 설정 (approval waiting 이후 상태)
    instance.blocks["review"].status = BlockStatus.WAITING_APPROVAL
    executor.checkpoint.save(instance.id, instance)

    # approve 시 gate가 passed 반환
    approved_result = GateResult(
        passed=True,
        detail="approved by smith",
        metadata={"status": "approved"},
    )
    gate_exec.run_gates = AsyncMock(return_value=approved_result)

    result = await executor.complete_block(instance.id, "review")

    assert result is not None
    assert result.passed

    # 검증: block 상태가 COMPLETED
    saved = executor.checkpoint.load(instance.id)
    assert saved.blocks["review"].status == BlockStatus.COMPLETED
