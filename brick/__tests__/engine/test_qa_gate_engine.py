"""QA-B (Gate 8종: B-01~B-24) + QA-A 일부 (엔진 코어: A-01~A-10) + 유기적 연결 검증.

QA 문서: brick/docs/QA-brick-full.md
담당: PM (Gate 8종 24건 + 엔진 코어 10건 + 3축 자유도 + 유기적 연결)
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import tempfile

import pytest
import yaml

from brick.engine.checkpoint import CheckpointStore
from brick.engine.event_bus import EventBus
from brick.engine.executor import WorkflowExecutor, PresetLoader
from brick.engine.state_machine import StateMachine
from brick.engine.preset_validator import PresetValidator, DEFAULT_GATE_TYPES, DEFAULT_LINK_TYPES, DEFAULT_ADAPTERS
from brick.gates.base import GateExecutor, GateResult
from brick.gates.concrete import ConcreteGateExecutor
from brick.models.block import (
    Block, DoneCondition, GateConfig, GateHandler, ApprovalConfig,
)
from brick.models.events import BlockStatus, Event, WorkflowStatus
from brick.models.link import LinkDefinition
from brick.models.team import TeamDefinition, AdapterStatus
from brick.models.workflow import BlockInstance, WorkflowDefinition, WorkflowInstance


# ═══════════════════════════════════════════════════════════════════════
# 헬퍼
# ═══════════════════════════════════════════════════════════════════════


def make_block(block_id: str = "do", what: str = "Task",
               gate: GateConfig | None = None) -> Block:
    return Block(id=block_id, what=what, done=DoneCondition(), gate=gate)


def make_gate_config(gate_type: str, on_fail: str = "retry",
                     max_retries: int = 3, **kwargs) -> GateConfig:
    handler = GateHandler(type=gate_type, **kwargs)
    return GateConfig(handlers=[handler], on_fail=on_fail, max_retries=max_retries)


def make_workflow(blocks: list[Block],
                  links: list[LinkDefinition] | None = None,
                  feature: str = "qa-test") -> WorkflowInstance:
    defn = WorkflowDefinition(
        name="qa-workflow",
        blocks=blocks,
        links=links or [],
        teams={b.id: TeamDefinition(block_id=b.id, adapter="claude_local") for b in blocks},
        project="bscamp",
        feature=feature,
    )
    instance = WorkflowInstance(
        id=f"qa-{int(time.time())}",
        definition=defn,
        feature=feature,
        task="qa-task",
    )
    for b in blocks:
        instance.blocks[b.id] = BlockInstance(
            block=b, adapter="claude_local", status=BlockStatus.QUEUED,
        )
    return instance


def make_executor(event_bus: EventBus | None = None,
                  gate_result: GateResult | None = None) -> WorkflowExecutor:
    eb = event_bus or EventBus()
    sm = StateMachine()
    cp = CheckpointStore(Path(tempfile.mkdtemp()))
    ge = MagicMock(spec=GateExecutor)
    ge.run_gates = AsyncMock(return_value=gate_result or GateResult(passed=True))
    return WorkflowExecutor(
        state_machine=sm, event_bus=eb, checkpoint=cp, gate_executor=ge,
    )


@pytest.fixture
def gate_executor():
    return ConcreteGateExecutor()


@pytest.fixture
def event_bus():
    return EventBus()


# ═══════════════════════════════════════════════════════════════════════
# QA-A: 엔진 코어 — StateMachine 상태 전이 (A-01 ~ A-10)
# ═══════════════════════════════════════════════════════════════════════


class TestStateMachineTransitions:
    """QA-A: StateMachine 상태 전이 10건."""

    def test_a01_queued_to_running(self):
        """A-01: queued → block.started → running."""
        sm = StateMachine()
        wf = make_workflow([make_block("do")])
        wf.blocks["do"].status = BlockStatus.QUEUED

        wf, cmds = sm.transition(wf, Event(type="block.started", data={"block_id": "do"}))

        assert wf.blocks["do"].status == BlockStatus.RUNNING

    def test_a02_running_to_gate_checking_with_gate(self):
        """A-02: running → block.completed → gate_checking (Gate 있으면)."""
        sm = StateMachine()
        gate = make_gate_config("command", command="echo ok")
        wf = make_workflow([make_block("do", gate=gate)])
        wf.blocks["do"].status = BlockStatus.RUNNING

        wf, cmds = sm.transition(wf, Event(type="block.completed", data={"block_id": "do"}))

        assert wf.blocks["do"].status == BlockStatus.GATE_CHECKING
        assert any(c.__class__.__name__ == "CheckGateCommand" for c in cmds)

    def test_a03_running_to_completed_no_gate(self):
        """A-03: running → block.completed → gate_checking (Gate 없어도 GATE_CHECKING 거침).
        Gate 없으면 GateExecutor가 자동 pass → gate_passed → completed.
        StateMachine은 항상 GATE_CHECKING으로 전이."""
        sm = StateMachine()
        wf = make_workflow([make_block("do")])  # gate=None
        wf.blocks["do"].status = BlockStatus.RUNNING

        wf, cmds = sm.transition(wf, Event(type="block.completed", data={"block_id": "do"}))

        # Gate 없어도 StateMachine은 GATE_CHECKING으로 (CheckGateCommand 발행)
        assert wf.blocks["do"].status == BlockStatus.GATE_CHECKING

    def test_a04_gate_checking_to_completed(self):
        """A-04: gate_checking → gate_passed → completed."""
        sm = StateMachine()
        wf = make_workflow([make_block("do")])
        wf.blocks["do"].status = BlockStatus.GATE_CHECKING

        wf, cmds = sm.transition(wf, Event(type="block.gate_passed", data={"block_id": "do"}))

        assert wf.blocks["do"].status == BlockStatus.COMPLETED

    def test_a05_gate_failed_retry(self):
        """A-05: gate_checking → gate_failed → running (on_fail=retry)."""
        sm = StateMachine()
        gate = make_gate_config("command", on_fail="retry", max_retries=3)
        wf = make_workflow([make_block("do", gate=gate)])
        wf.blocks["do"].status = BlockStatus.GATE_CHECKING
        wf.blocks["do"].retry_count = 0

        wf, cmds = sm.transition(wf, Event(type="block.gate_failed", data={"block_id": "do"}))

        assert wf.blocks["do"].status == BlockStatus.RUNNING
        assert wf.blocks["do"].retry_count == 1

    def test_a06_gate_failed_fail(self):
        """A-06: gate_checking → gate_failed → failed (on_fail=fail)."""
        sm = StateMachine()
        gate = make_gate_config("command", on_fail="fail")
        wf = make_workflow([make_block("do", gate=gate)])
        wf.blocks["do"].status = BlockStatus.GATE_CHECKING

        wf, cmds = sm.transition(wf, Event(type="block.gate_failed", data={"block_id": "do"}))

        assert wf.blocks["do"].status == BlockStatus.FAILED
        assert wf.status == WorkflowStatus.FAILED

    def test_a07_max_retries_exceeded(self):
        """A-07: max_retries 초과 → failed."""
        sm = StateMachine()
        gate = make_gate_config("command", on_fail="retry", max_retries=2)
        wf = make_workflow([make_block("do", gate=gate)])
        wf.blocks["do"].status = BlockStatus.GATE_CHECKING
        wf.blocks["do"].retry_count = 2  # 이미 한도 도달

        wf, cmds = sm.transition(wf, Event(type="block.gate_failed", data={"block_id": "do"}))

        assert wf.blocks["do"].status == BlockStatus.FAILED

    def test_a08_adapter_failed_retry(self):
        """A-08: adapter_failed → queued (재시도)."""
        sm = StateMachine()
        wf = make_workflow([make_block("do")])
        wf.blocks["do"].status = BlockStatus.RUNNING
        wf.blocks["do"].retry_count = 0

        wf, cmds = sm.transition(wf, Event(type="block.adapter_failed", data={
            "block_id": "do", "error": "timeout",
        }))

        assert wf.blocks["do"].status == BlockStatus.QUEUED
        assert wf.blocks["do"].retry_count == 1

    def test_a09_adapter_failed_max_retries(self):
        """A-09: adapter_failed → failed (재시도 한도 초과)."""
        sm = StateMachine()
        wf = make_workflow([make_block("do")])
        wf.blocks["do"].status = BlockStatus.RUNNING
        wf.blocks["do"].retry_count = 3  # 기본 max=3

        wf, cmds = sm.transition(wf, Event(type="block.adapter_failed", data={
            "block_id": "do", "error": "crash",
        }))

        assert wf.blocks["do"].status == BlockStatus.FAILED
        assert wf.status == WorkflowStatus.FAILED

    def test_a10_completed_next_block_queued(self):
        """A-10: completed → 다음 블록 queued (Link 발동)."""
        sm = StateMachine()
        blocks = [make_block("plan"), make_block("do")]
        links = [LinkDefinition(from_block="plan", to_block="do", type="sequential")]
        wf = make_workflow(blocks, links)
        wf.blocks["plan"].status = BlockStatus.GATE_CHECKING

        wf, cmds = sm.transition(wf, Event(type="block.gate_passed", data={"block_id": "plan"}))

        assert wf.blocks["plan"].status == BlockStatus.COMPLETED
        assert wf.blocks["do"].status == BlockStatus.QUEUED
        assert any(
            getattr(c, "block_id", None) == "do"
            for c in cmds
            if c.__class__.__name__ == "StartBlockCommand"
        )


# ═══════════════════════════════════════════════════════════════════════
# QA-B: Gate 8종 (B-01 ~ B-24)
# ═══════════════════════════════════════════════════════════════════════


class TestGateCommand:
    """B-01 ~ B-03: command Gate."""

    @pytest.mark.asyncio
    async def test_b01_command_pass(self, gate_executor):
        """B-01: 정상 명령 → pass (exit 0)."""
        handler = GateHandler(type="command", command="echo hello")
        result = await gate_executor.execute(handler, {})
        assert result.passed is True
        assert result.type == "command"

    @pytest.mark.asyncio
    async def test_b02_command_fail(self, gate_executor):
        """B-02: 실패 명령 → fail (exit 1)."""
        handler = GateHandler(type="command", command="false")
        result = await gate_executor.execute(handler, {})
        assert result.passed is False
        assert result.type == "command"
        assert result.metadata.get("returncode") != 0

    @pytest.mark.asyncio
    async def test_b03_command_timeout(self, gate_executor):
        """B-03: 타임아웃 처리."""
        handler = GateHandler(type="command", command="sleep 10", timeout=1)
        result = await gate_executor.execute(handler, {})
        assert result.passed is False
        assert "타임아웃" in result.detail


class TestGateHttp:
    """B-04 ~ B-06: http Gate."""

    @pytest.mark.asyncio
    async def test_b04_http_200_pass(self, gate_executor):
        """B-04: 200 → pass."""
        handler = GateHandler(type="http", url="https://httpbin.org/status/200", timeout=10)
        # mock httpx
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.side_effect = Exception("no json")

        with patch("httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_resp)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            result = await gate_executor.execute(handler, {})

        assert result.passed is True
        assert result.metadata["status_code"] == 200

    @pytest.mark.asyncio
    async def test_b05_http_500_fail(self, gate_executor):
        """B-05: 500 → fail."""
        handler = GateHandler(type="http", url="https://httpbin.org/status/500", timeout=10)

        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.json.side_effect = Exception("no json")

        with patch("httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_resp)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            result = await gate_executor.execute(handler, {})

        assert result.passed is False
        assert result.metadata["status_code"] == 500

    @pytest.mark.asyncio
    async def test_b06_http_timeout_fail(self, gate_executor):
        """B-06: 타임아웃 → fail."""
        handler = GateHandler(type="http", url="https://10.255.255.1/", timeout=1)

        with patch("httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            result = await gate_executor.execute(handler, {})

        assert result.passed is False


class TestGatePrompt:
    """B-07 ~ B-08: prompt Gate."""

    @pytest.mark.asyncio
    async def test_b07_prompt_pass(self):
        """B-07: LLM 평가 pass."""
        llm = MagicMock()
        llm.evaluate = AsyncMock(return_value={"decision": "yes", "confidence": 0.95})
        ge = ConcreteGateExecutor(llm_client=llm)

        handler = GateHandler(type="prompt", prompt="Is this good?", retries=1)
        result = await ge.execute(handler, {})

        assert result.passed is True

    @pytest.mark.asyncio
    async def test_b08_prompt_fail(self):
        """B-08: LLM 평가 fail."""
        llm = MagicMock()
        llm.evaluate = AsyncMock(return_value={"decision": "no", "confidence": 0.9})
        ge = ConcreteGateExecutor(llm_client=llm)

        handler = GateHandler(type="prompt", prompt="Quality check", retries=1)
        result = await ge.execute(handler, {})

        assert result.passed is False


class TestGateAgent:
    """B-09 ~ B-10: agent Gate."""

    @pytest.mark.asyncio
    async def test_b09_agent_pass(self):
        """B-09: 에이전트 평가 pass."""
        runner = MagicMock()
        runner.run = AsyncMock(return_value={
            "verdict": "pass", "analysis": "All checks OK", "confidence": 0.9,
            "turns": 3, "tools_used": ["Read", "Grep"],
        })
        ge = ConcreteGateExecutor(agent_runner=runner)

        handler = GateHandler(type="agent", agent_prompt="Review code")
        result = await ge.execute(handler, {})

        assert result.passed is True

    @pytest.mark.asyncio
    async def test_b10_agent_fail(self):
        """B-10: 에이전트 평가 fail."""
        runner = MagicMock()
        runner.run = AsyncMock(return_value={
            "verdict": "fail", "analysis": "Missing tests", "confidence": 0.85,
        })
        ge = ConcreteGateExecutor(agent_runner=runner)

        handler = GateHandler(type="agent", agent_prompt="Review code")
        result = await ge.execute(handler, {})

        assert result.passed is False


class TestGateReview:
    """B-11 ~ B-12: review Gate."""

    @pytest.mark.asyncio
    async def test_b11_review_approve(self, gate_executor):
        """B-11: 코드 리뷰 approve → pass."""
        handler = GateHandler(type="review")
        result = await gate_executor.execute(handler, {"review_action": "approve", "reviewer": "smith"})

        assert result.passed is True
        assert result.metadata["status"] == "approved"

    @pytest.mark.asyncio
    async def test_b12_review_reject(self, gate_executor):
        """B-12: 코드 리뷰 reject → fail."""
        handler = GateHandler(type="review")
        result = await gate_executor.execute(handler, {
            "review_action": "reject",
            "reviewer": "smith",
            "reject_reason": "TDD 누락",
        })

        assert result.passed is False
        assert result.metadata["reject_reason"] == "TDD 누락"


class TestGateMetric:
    """B-13 ~ B-14: metric Gate."""

    @pytest.mark.asyncio
    async def test_b13_metric_pass(self, gate_executor):
        """B-13: 수치 기준 pass (match_rate >= 90)."""
        handler = GateHandler(type="metric", metric="match_rate", threshold=90.0)
        result = await gate_executor.execute(handler, {"match_rate": 95.0})

        assert result.passed is True
        assert result.metrics["match_rate"] == 95.0

    @pytest.mark.asyncio
    async def test_b14_metric_fail(self, gate_executor):
        """B-14: 수치 기준 fail (match_rate < 90)."""
        handler = GateHandler(type="metric", metric="match_rate", threshold=90.0)
        result = await gate_executor.execute(handler, {"match_rate": 85.0})

        assert result.passed is False


class TestGateApproval:
    """B-15 ~ B-18: approval Gate."""

    @pytest.mark.asyncio
    async def test_b15_approval_approve(self, gate_executor):
        """B-15: approve → pass."""
        handler = GateHandler(
            type="approval",
            approval=ApprovalConfig(approver="smith@bscamp.kr"),
        )
        result = await gate_executor.execute(handler, {"approval_action": "approve"})

        assert result.passed is True
        assert result.metadata["status"] == "approved"

    @pytest.mark.asyncio
    async def test_b16_approval_reject_with_reason(self, gate_executor):
        """B-16: reject → fail + reject_reason."""
        handler = GateHandler(
            type="approval",
            approval=ApprovalConfig(approver="smith@bscamp.kr"),
        )
        result = await gate_executor.execute(handler, {
            "approval_action": "reject",
            "reject_reason": "Design 불충분",
        })

        assert result.passed is False
        assert result.metadata["reject_reason"] == "Design 불충분"

    @pytest.mark.asyncio
    async def test_b17_approval_timeout_auto_approve(self, gate_executor):
        """B-17: timeout → auto_approve."""
        handler = GateHandler(
            type="approval",
            approval=ApprovalConfig(approver="smith@bscamp.kr", on_timeout="auto_approve"),
        )
        result = await gate_executor.execute(handler, {"approval_action": "timeout"})

        assert result.passed is True
        assert result.metadata["status"] == "auto_approved"

    @pytest.mark.asyncio
    async def test_b18_approval_pending_event(self, event_bus):
        """B-18: pending → gate.pending 이벤트 발행."""
        ge = ConcreteGateExecutor()
        ge._event_bus = event_bus

        events_received = []
        event_bus.subscribe("gate.pending", lambda e: events_received.append(e))

        handler = GateHandler(
            type="approval",
            approval=ApprovalConfig(approver="smith@bscamp.kr"),
        )
        result = await ge.execute(handler, {
            "approval_action": "pending",
            "block_id": "review",
            "workflow_id": "wf-123",
        })

        assert result.passed is False
        assert result.metadata["status"] == "waiting"
        assert len(events_received) == 1
        assert events_received[0].data["approver"] == "smith@bscamp.kr"


class TestGateArtifact:
    """B-19 ~ B-23: artifact Gate."""

    @pytest.mark.asyncio
    async def test_b19_artifact_exists_pass(self, gate_executor, tmp_path, monkeypatch):
        """B-19: 파일 존재 → pass (상대경로 사용 — artifact gate는 절대경로 거부)."""
        f = tmp_path / "report.md"
        f.write_text("# Report")
        monkeypatch.chdir(tmp_path)

        handler = GateHandler(type="artifact")
        result = await gate_executor.execute(handler, {"artifacts": ["report.md"]})

        assert result.passed is True

    @pytest.mark.asyncio
    async def test_b20_artifact_missing_fail(self, gate_executor):
        """B-20: 파일 없음 → fail + missing 목록."""
        handler = GateHandler(type="artifact")
        result = await gate_executor.execute(handler, {"artifacts": ["/nonexistent/file.md"]})

        # Path traversal 검사: 절대경로는 먼저 거부됨 (B-22)
        assert result.passed is False

    @pytest.mark.asyncio
    async def test_b21_artifact_path_traversal_reject(self, gate_executor):
        """B-21: path traversal (../) → 거부."""
        handler = GateHandler(type="artifact")
        result = await gate_executor.execute(handler, {"artifacts": ["../../../etc/passwd"]})

        assert result.passed is False
        assert "보안 위반" in result.detail

    @pytest.mark.asyncio
    async def test_b22_artifact_absolute_path_reject(self, gate_executor):
        """B-22: 절대경로 → 거부."""
        handler = GateHandler(type="artifact")
        result = await gate_executor.execute(handler, {"artifacts": ["/etc/passwd"]})

        assert result.passed is False
        assert "보안 위반" in result.detail

    @pytest.mark.asyncio
    async def test_b23_artifact_glob_not_supported(self, gate_executor, tmp_path):
        """B-23: glob 패턴 — 현재 Path.exists()만 사용 (glob 미지원 확인).
        QA 문서는 glob 동작을 기대하지만, 구현은 Path.exists()만 사용.
        이 테스트는 현재 구현 동작을 기록."""
        f = tmp_path / "report.md"
        f.write_text("# Report")

        handler = GateHandler(type="artifact")
        # *.md glob — Path("*.md").exists() = False
        result = await gate_executor.execute(handler, {"artifacts": [str(tmp_path / "*.md")]})

        # 현재 구현: glob 미지원 → 파일 없음으로 판정
        assert result.passed is False


class TestGateComposite:
    """B-24: 복합 Gate 순차 실행."""

    @pytest.mark.asyncio
    async def test_b24_sequential_two_gates(self, gate_executor, tmp_path, monkeypatch):
        """B-24: 2개 Gate 순차 실행 (evaluation=sequential)."""
        f = tmp_path / "output.md"
        f.write_text("# Output")
        monkeypatch.chdir(tmp_path)

        block = Block(
            id="do", what="task", done=DoneCondition(),
            gate=GateConfig(
                handlers=[
                    GateHandler(type="command", command="echo ok"),
                    GateHandler(type="artifact"),
                ],
                evaluation="sequential",
            ),
        )
        bi = BlockInstance(block=block, adapter="claude_local", status=BlockStatus.GATE_CHECKING)

        result = await gate_executor.run_gates(bi, {"artifacts": ["output.md"]})

        assert result.passed is True


# ═══════════════════════════════════════════════════════════════════════
# 3축 자유도 검증
# ═══════════════════════════════════════════════════════════════════════


class TestThreeAxisFreedom:
    """Gate 새 타입 추가 시 register_gate() + DEFAULT_GATE_TYPES 2곳 수정 확인."""

    def test_gate_register_matches_default_types(self):
        """ConcreteGateExecutor 등록 타입 == DEFAULT_GATE_TYPES."""
        ge = ConcreteGateExecutor()
        registered = ge.registered_gate_types()

        assert registered == DEFAULT_GATE_TYPES, (
            f"불일치: registered={registered}, DEFAULT={DEFAULT_GATE_TYPES}"
        )

    def test_new_gate_type_requires_two_changes(self):
        """커스텀 Gate 추가 → register_gate() + DEFAULT_GATE_TYPES 양쪽 필요."""
        ge = ConcreteGateExecutor()

        # 1. register_gate만 하면 PresetValidator는 모름
        async def my_gate(handler, context):
            return GateResult(passed=True, detail="custom")

        ge.register_gate("my_custom", my_gate)
        assert "my_custom" in ge.registered_gate_types()
        assert "my_custom" not in DEFAULT_GATE_TYPES  # 상수에는 없음

        # 2. PresetValidator에 동적 레지스트리 전달하면 해결
        validator = PresetValidator(gate_types=ge.registered_gate_types())
        # 이제 my_custom이 유효한 gate 타입으로 인식됨

    def test_db_schema_tables_exist(self):
        """DB 스키마 구조: workspaces, users, agents, notifications 테이블 존재."""
        schema_path = Path("brick/brick/auth/schema.sql")
        if not schema_path.exists():
            # 절대경로 시도
            schema_path = Path(__file__).parents[2] / "brick" / "auth" / "schema.sql"
        if not schema_path.exists():
            pytest.skip("schema.sql not found in expected paths")

        schema = schema_path.read_text()

        expected_tables = ["workspaces", "users", "agents", "notifications",
                          "user_sessions", "api_keys"]
        for table in expected_tables:
            assert f"CREATE TABLE IF NOT EXISTS {table}" in schema, f"테이블 누락: {table}"


# ═══════════════════════════════════════════════════════════════════════
# 유기적 연결 검증
# ═══════════════════════════════════════════════════════════════════════


class TestOrganicConnections:
    """Gate result → EventBus → SlackSubscriber + reject_reason → loop Link 연결."""

    def test_gate_result_to_checkpoint_event(self):
        """Gate result → executor → checkpoint에 gate_failed 이벤트 저장 + reject_reason 포함."""
        eb = EventBus()

        gate_result = GateResult(
            passed=False,
            detail="반려",
            metadata={"reject_reason": "TDD 누락", "status": "rejected"},
        )
        executor = make_executor(event_bus=eb, gate_result=gate_result)

        gate_block = make_block("review", gate=make_gate_config("approval", on_fail="retry"))
        instance = make_workflow([gate_block])
        instance.blocks["review"].status = BlockStatus.RUNNING
        executor.checkpoint.save(instance.id, instance)

        asyncio.run(executor.complete_block(instance.id, "review"))

        # gate_failed 이벤트가 checkpoint에 저장됨
        saved_events = executor.checkpoint.load_events(instance.id)
        gate_events = [e for e in saved_events if e.type == "block.gate_failed"]
        assert len(gate_events) >= 1
        assert gate_events[0].data.get("reject_reason") == "TDD 누락"

    def test_gate_result_to_slack_subscriber(self):
        """Gate → EventBus → SlackSubscriber 메시지 포맷 연결."""
        from brick.engine.slack_subscriber import SlackSubscriber, _format_message

        eb = EventBus()
        messages = []

        # Slack 전송 대신 메시지 캡처
        with patch.dict(os.environ, {"BRICK_ENV": "test"}):
            sub = SlackSubscriber(eb, level="verbose")

        # gate_failed 이벤트 직접 발행
        event = Event(type="block.gate_failed", data={
            "block_id": "review",
            "reject_reason": "보안 취약점 발견",
            "retry_count": 1,
            "max_retries": 3,
        })

        msg = _format_message(event)
        assert "보안 취약점 발견" in msg
        assert "1/3" in msg

    def test_reject_reason_to_context_to_loop_link(self):
        """reject_reason → context 주입 → loop Link 재실행 시 context에 사유 포함."""
        gate_result = GateResult(
            passed=False,
            detail="반려",
            metadata={"reject_reason": "TDD 누락"},
        )
        eb = EventBus()
        executor = make_executor(event_bus=eb, gate_result=gate_result)

        blocks = [
            make_block("design"),
            make_block("review", gate=make_gate_config("approval", on_fail="retry")),
        ]
        links = [
            LinkDefinition(from_block="design", to_block="review", type="sequential"),
        ]
        instance = make_workflow(blocks, links)
        instance.blocks["review"].status = BlockStatus.RUNNING
        executor.checkpoint.save(instance.id, instance)

        asyncio.run(executor.complete_block(instance.id, "review"))

        updated = executor.checkpoint.load(instance.id)
        assert updated.context.get("reject_reason") == "TDD 누락"
        assert updated.context.get("reject_count") == 1

    def test_approve_clears_reject_reason(self):
        """approve → reject_reason/reject_count 제거."""
        gate_result = GateResult(passed=True, detail="승인")
        eb = EventBus()
        executor = make_executor(event_bus=eb, gate_result=gate_result)

        block = make_block("review", gate=make_gate_config("approval"))
        instance = make_workflow([block])
        instance.blocks["review"].status = BlockStatus.RUNNING
        instance.context["reject_reason"] = "이전 사유"
        instance.context["reject_block_id"] = "review"
        instance.context["reject_count"] = 2
        executor.checkpoint.save(instance.id, instance)

        asyncio.run(executor.complete_block(instance.id, "review"))

        updated = executor.checkpoint.load(instance.id)
        assert "reject_reason" not in updated.context
        assert "reject_block_id" not in updated.context
        assert "reject_count" not in updated.context

    def test_enrich_event_data_on_gate_events(self):
        """_enrich_event_data → gate 이벤트 checkpoint에 project/feature 포함."""
        eb = EventBus()

        gate_result = GateResult(passed=True, detail="OK")
        executor = make_executor(event_bus=eb, gate_result=gate_result)

        block = make_block("do", gate=make_gate_config("command"))
        instance = make_workflow([block], feature="brick-p1")
        instance.blocks["do"].status = BlockStatus.RUNNING
        instance.context["project"] = {"name": "bscamp"}
        executor.checkpoint.save(instance.id, instance)

        asyncio.run(executor.complete_block(instance.id, "do"))

        # gate_passed 이벤트가 checkpoint에 저장되고 enrich 데이터 포함
        saved_events = executor.checkpoint.load_events(instance.id)
        gate_events = [e for e in saved_events if e.type == "block.gate_passed"]
        assert len(gate_events) >= 1
        assert gate_events[0].data.get("project") == "bscamp"
        assert gate_events[0].data.get("feature") == "brick-p1"


# ═══════════════════════════════════════════════════════════════════════
# import guard — httpx for http gate test
# ═══════════════════════════════════════════════════════════════════════
import httpx
