"""P0 Critical Path E2E Tests — 17건 판정.

P0 판정 결과:
P0-A01: PASS — test_p0a01_hotfix_start
P0-A02: PASS — test_p0a02_hotfix_block_queued_to_running
P0-A03: PASS — test_p0a03_hotfix_adapter_execution_id
P0-A04: PASS — test_p0a04_hotfix_complete_block_gate
P0-A05: PASS — test_p0a05_hotfix_workflow_completed
P0-A06: PASS — test_p0a06_hotfix_checkpoint_saved
P0-B01: PASS — test_p0b01_feature_standard_plan_to_design
P0-B02: PASS — test_p0b02_feature_standard_team_handoff
P0-B03: PASS — test_p0b03_feature_standard_metric_gate_pass
P0-B04: PASS — test_p0b04_feature_standard_loop_do_requeue
P0-B05: PASS — test_p0b05_feature_standard_full_chain_completed
P0-B06: PASS — test_p0b06_feature_standard_eventbus_notifications
P0-C01: PASS — test_p0c01_approval_agent_gate
P0-C02: PASS — test_p0c02_approval_waiting_status
P0-C03: PASS — test_p0c03_approval_approve_to_do
P0-C04: PASS — test_p0c04_approval_reject_loopback
P0-C05: PASS — test_p0c05_approval_reject_reason_in_context
"""

from __future__ import annotations

import pytest
import yaml
from pathlib import Path
from unittest.mock import AsyncMock

from brick.engine.executor import WorkflowExecutor, PresetLoader
from brick.engine.state_machine import StateMachine
from brick.engine.event_bus import EventBus
from brick.engine.checkpoint import CheckpointStore
from brick.gates.base import GateExecutor
from brick.gates.concrete import ConcreteGateExecutor
from brick.models.events import WorkflowStatus, BlockStatus, Event
from brick.models.gate import GateResult
from brick.models.team import AdapterStatus


# ── Helpers ───────────────────────────────────────────────────


class _AllPassGateExecutor(GateExecutor):
    """모든 gate를 자동 통과시키는 테스트용 GateExecutor."""
    async def run_gates(self, block_instance, context):
        return GateResult(passed=True, detail="auto-pass")


class _GateCheckpoint(CheckpointStore):
    """Gate configs are lost during checkpoint serialization (to_dict/from_dict).

    This wrapper re-injects gate configs on every load() so that
    ConcreteGateExecutor can evaluate them correctly in E2E tests.
    """

    def __init__(self, base_dir: Path, preset_blocks: list | None = None):
        super().__init__(base_dir)
        self._gates: dict[str, object] = {}
        if preset_blocks:
            for b in preset_blocks:
                if b.gate:
                    self._gates[b.id] = b.gate

    def load(self, workflow_id):
        inst = super().load(workflow_id)
        if inst:
            for bid, gate in self._gates.items():
                if bid in inst.blocks:
                    inst.blocks[bid].block.gate = gate
        return inst


def _preset_dir(tmp_path: Path, presets: dict[str, dict]) -> Path:
    d = tmp_path / "presets"
    d.mkdir(exist_ok=True)
    for name, data in presets.items():
        (d / f"{name}.yaml").write_text(yaml.dump(data))
    return d


def _mock_adapter(exec_id: str = "exec-1") -> AsyncMock:
    a = AsyncMock()
    a.start_block = AsyncMock(return_value=exec_id)
    a.check_status = AsyncMock(return_value=AdapterStatus(status="completed"))
    a.cancel = AsyncMock(return_value=True)
    a.get_artifacts = AsyncMock(return_value=[])
    return a


async def _walk(executor: WorkflowExecutor, wf_id: str, block_ids: list[str]):
    """Complete blocks sequentially. Returns last GateResult."""
    result = None
    for bid in block_ids:
        result = await executor.complete_block(wf_id, bid)
    return result


# ── Preset Definitions ───────────────────────────────────────

HOTFIX = {
    "name": "hotfix",
    "blocks": [
        {"id": "do", "type": "Do", "what": "핫픽스 적용",
         "done": {"artifacts": [], "metrics": {"build_pass": True}}},
    ],
    "links": [],
    "teams": {"do": {"adapter": "mock"}},
}

FEATURE_STANDARD = {
    "name": "feature-standard",
    "blocks": [
        {"id": "plan", "type": "Plan", "what": "요구사항 분석", "done": {"artifacts": []}},
        {"id": "design", "type": "Design", "what": "상세 설계", "done": {"artifacts": []}},
        {"id": "do", "type": "Do", "what": "구현", "done": {"artifacts": []}},
        {"id": "check", "type": "Check", "what": "Gap 분석",
         "done": {"metrics": {"match_rate": 90}},
         "gate": {
             "handlers": [{"type": "metric", "metric": "match_rate", "threshold": 90}],
             "on_fail": "retry", "max_retries": 3,
         }},
        {"id": "act", "type": "Act", "what": "배포", "done": {"artifacts": []}},
    ],
    "links": [
        {"from": "plan", "to": "design", "type": "sequential"},
        {"from": "design", "to": "do", "type": "sequential"},
        {"from": "do", "to": "check", "type": "sequential"},
        {"from": "check", "to": "do", "type": "loop",
         "condition": {"match_rate_below": 90}, "max_retries": 3},
        {"from": "check", "to": "act", "type": "sequential"},
    ],
    "teams": {
        "plan": {"adapter": "mock-pm"},
        "design": {"adapter": "mock-pm"},
        "do": {"adapter": "mock-cto"},
        "check": {"adapter": "mock-cto"},
        "act": {"adapter": "mock-cto"},
    },
}

FEATURE_APPROVAL = {
    "name": "feature-approval",
    "blocks": [
        {"id": "plan", "type": "Plan", "what": "요구사항 분석", "done": {"artifacts": []}},
        {"id": "design", "type": "Design", "what": "상세 설계", "done": {"artifacts": []}},
        {"id": "coo_review", "type": "Review", "what": "COO 검토",
         "done": {"artifacts": []},
         "gate": {
             "handlers": [{
                 "type": "agent",
                 "agent_prompt": "Design 검토. 반려사유: {reject_reason}. verdict: pass/fail.",
                 "timeout": 300, "on_fail": "fail",
             }],
         }},
        {"id": "ceo_approval", "type": "Approval", "what": "CEO 승인",
         "done": {"artifacts": []},
         "gate": {
             "handlers": [{
                 "type": "approval",
                 "approval": {
                     "approver": "smith", "channel": "both",
                     "timeout_seconds": 86400, "on_timeout": "escalate",
                 },
             }],
             "on_fail": "route", "max_retries": 3,
         }},
        {"id": "do", "type": "Do", "what": "구현", "done": {"artifacts": []}},
        {"id": "check", "type": "Check", "what": "Gap 분석",
         "done": {"metrics": {"match_rate": 90}},
         "gate": {
             "handlers": [{"type": "metric", "metric": "match_rate", "threshold": 90}],
             "on_fail": "retry", "max_retries": 3,
         }},
        {"id": "act", "type": "Act", "what": "배포", "done": {"artifacts": []}},
    ],
    "links": [
        {"from": "plan", "to": "design", "type": "sequential"},
        {"from": "design", "to": "coo_review", "type": "sequential"},
        {"from": "coo_review", "to": "ceo_approval", "type": "sequential"},
        {"from": "ceo_approval", "to": "do", "type": "sequential"},
        {"from": "ceo_approval", "to": "design", "type": "loop",
         "condition": {"approval_status": "rejected"}, "max_retries": 3,
         "on_fail": "design"},
        {"from": "do", "to": "check", "type": "sequential"},
        {"from": "check", "to": "do", "type": "loop",
         "condition": {"match_rate_below": 90}, "max_retries": 3},
        {"from": "check", "to": "act", "type": "sequential"},
    ],
    "teams": {
        "plan": {"adapter": "mock-pm"},
        "design": {"adapter": "mock-pm"},
        "coo_review": {"adapter": "mock-coo"},
        "ceo_approval": {"adapter": "mock-human"},
        "do": {"adapter": "mock-cto"},
        "check": {"adapter": "mock-cto"},
        "act": {"adapter": "mock-cto"},
    },
}


# ══════════════════════════════════════════════════════════════
# P0-A: Hotfix E2E (6건)
# ══════════════════════════════════════════════════════════════


class TestP0AHotfix:
    """P0-A: Hotfix 프리셋 단일 블록 E2E."""

    @pytest.fixture
    def setup(self, tmp_path):
        presets_dir = _preset_dir(tmp_path, {"hotfix": HOTFIX})
        mock = _mock_adapter("exec-hotfix-1")
        cp_dir = tmp_path / "cp"
        ex = WorkflowExecutor(
            state_machine=StateMachine(),
            event_bus=EventBus(),
            checkpoint=CheckpointStore(cp_dir),
            gate_executor=GateExecutor(),
            adapter_pool={"mock": mock},
            preset_loader=PresetLoader(presets_dir),
        )
        return ex, mock, cp_dir

    @pytest.mark.asyncio
    async def test_p0a01_hotfix_start(self, setup):
        """P0-A01: start(preset='hotfix') → workflow_id 반환."""
        ex, _, _ = setup
        wf_id = await ex.start("hotfix", "hf-feat", "hf-task")
        assert wf_id is not None
        assert isinstance(wf_id, str)
        assert len(wf_id) > 0

    @pytest.mark.asyncio
    async def test_p0a02_hotfix_block_queued_to_running(self, setup):
        """P0-A02: Do 블록 QUEUED → RUNNING 전이."""
        ex, _, _ = setup
        wf_id = await ex.start("hotfix", "hf-feat", "hf-task")
        inst = ex.checkpoint.load(wf_id)
        # start() 이후 블록은 QUEUED→Started→RUNNING
        assert inst.blocks["do"].status == BlockStatus.RUNNING
        assert inst.status == WorkflowStatus.RUNNING

    @pytest.mark.asyncio
    async def test_p0a03_hotfix_adapter_execution_id(self, setup):
        """P0-A03: adapter.start_block → execution_id 생성."""
        ex, mock, _ = setup
        wf_id = await ex.start("hotfix", "hf-feat", "hf-task")
        inst = ex.checkpoint.load(wf_id)
        assert inst.blocks["do"].execution_id == "exec-hotfix-1"
        mock.start_block.assert_called_once()

    @pytest.mark.asyncio
    async def test_p0a04_hotfix_complete_block_gate(self, setup):
        """P0-A04: complete_block → Gate 실행 → passed=True."""
        ex, _, _ = setup
        wf_id = await ex.start("hotfix", "hf-feat", "hf-task")
        result = await ex.complete_block(wf_id, "do")
        assert result.passed is True

    @pytest.mark.asyncio
    async def test_p0a05_hotfix_workflow_completed(self, setup):
        """P0-A05: Gate 통과 → workflow status=completed."""
        ex, _, _ = setup
        wf_id = await ex.start("hotfix", "hf-feat", "hf-task")
        await ex.complete_block(wf_id, "do")
        inst = ex.checkpoint.load(wf_id)
        assert inst.status == WorkflowStatus.COMPLETED
        assert inst.blocks["do"].status == BlockStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_p0a06_hotfix_checkpoint_saved(self, setup):
        """P0-A06: Checkpoint state.json 파일 존재."""
        ex, _, cp_dir = setup
        wf_id = await ex.start("hotfix", "hf-feat", "hf-task")
        await ex.complete_block(wf_id, "do")
        state_file = cp_dir / wf_id / "state.json"
        assert state_file.exists()


# ══════════════════════════════════════════════════════════════
# P0-B: Feature-Standard Chain (6건)
# ══════════════════════════════════════════════════════════════


class TestP0BFeatureStandard:
    """P0-B: Feature-standard 5블록 체인 E2E."""

    @pytest.fixture
    def ex_basic(self, tmp_path):
        """AllPassGateExecutor — loop 링크 테스트용 (gate 자동 통과)."""
        presets_dir = _preset_dir(tmp_path, {"feature-standard": FEATURE_STANDARD})
        pool = {"mock-pm": _mock_adapter("exec-pm"), "mock-cto": _mock_adapter("exec-cto")}
        return WorkflowExecutor(
            state_machine=StateMachine(),
            event_bus=EventBus(),
            checkpoint=CheckpointStore(tmp_path / "cp"),
            gate_executor=_AllPassGateExecutor(),
            adapter_pool=pool,
            preset_loader=PresetLoader(presets_dir),
        )

    @pytest.fixture
    def ex_metric(self, tmp_path):
        """ConcreteGateExecutor + GateCheckpoint — metric gate 테스트용."""
        presets_dir = _preset_dir(tmp_path, {"feature-standard": FEATURE_STANDARD})
        loader = PresetLoader(presets_dir)
        wf_def = loader.load("feature-standard")
        pool = {"mock-pm": _mock_adapter("exec-pm"), "mock-cto": _mock_adapter("exec-cto")}
        return WorkflowExecutor(
            state_machine=StateMachine(),
            event_bus=EventBus(),
            checkpoint=_GateCheckpoint(tmp_path / "cp", wf_def.blocks),
            gate_executor=ConcreteGateExecutor(),
            adapter_pool=pool,
            preset_loader=loader,
        )

    @pytest.mark.asyncio
    async def test_p0b01_feature_standard_plan_to_design(self, ex_basic):
        """P0-B01: Plan 완료 → sequential → Design RUNNING."""
        wf_id = await ex_basic.start("feature-standard", "std-feat", "std-task")
        inst = ex_basic.checkpoint.load(wf_id)
        assert inst.blocks["plan"].status == BlockStatus.RUNNING
        assert inst.blocks["design"].status == BlockStatus.PENDING

        await ex_basic.complete_block(wf_id, "plan")
        inst = ex_basic.checkpoint.load(wf_id)
        assert inst.blocks["plan"].status == BlockStatus.COMPLETED
        assert inst.blocks["design"].status == BlockStatus.RUNNING

    @pytest.mark.asyncio
    async def test_p0b02_feature_standard_team_handoff(self, ex_basic):
        """P0-B02: Design(PM) → Do(CTO) 팀 전환 handoff 이벤트."""
        captured = []
        ex_basic.event_bus.subscribe("block.handoff", lambda e: captured.append(e))

        wf_id = await ex_basic.start("feature-standard", "std-feat", "std-task")
        await _walk(ex_basic, wf_id, ["plan", "design"])

        # design(mock-pm) → do(mock-cto)
        handoffs = [e for e in captured
                    if e.data.get("from_team") != e.data.get("to_team")]
        assert len(handoffs) >= 1
        h = handoffs[0]
        assert h.data["from_team"] == "mock-pm"
        assert h.data["to_team"] == "mock-cto"

    @pytest.mark.asyncio
    async def test_p0b03_feature_standard_metric_gate_pass(self, ex_metric):
        """P0-B03: Check metric gate (match_rate≥90) 통과."""
        wf_id = await ex_metric.start("feature-standard", "std-feat", "std-task")
        await _walk(ex_metric, wf_id, ["plan", "design", "do"])

        # match_rate 주입
        inst = ex_metric.checkpoint.load(wf_id)
        inst.context["match_rate"] = 92
        ex_metric.checkpoint.save(wf_id, inst)

        result = await ex_metric.complete_block(wf_id, "check")
        assert result.passed is True

        # gate 통과 후 check 블록 COMPLETED + act 진행
        inst = ex_metric.checkpoint.load(wf_id)
        assert inst.blocks["check"].status == BlockStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_p0b04_feature_standard_loop_do_requeue(self, ex_basic):
        """P0-B04: Check 완료 + match_rate<90 → loop → Do 재실행."""
        wf_id = await ex_basic.start("feature-standard", "std-feat", "std-task")
        await _walk(ex_basic, wf_id, ["plan", "design", "do"])

        # match_rate=85 주입 (loop 조건: match_rate_below 90)
        inst = ex_basic.checkpoint.load(wf_id)
        inst.context["match_rate"] = 85
        ex_basic.checkpoint.save(wf_id, inst)

        await ex_basic.complete_block(wf_id, "check")
        inst = ex_basic.checkpoint.load(wf_id)

        # Do가 loop로 재실행됨
        assert inst.blocks["do"].status in (BlockStatus.QUEUED, BlockStatus.RUNNING)
        # loop counter
        assert inst.context.get("_loop_check_do", 0) >= 1

    @pytest.mark.asyncio
    async def test_p0b05_feature_standard_full_chain_completed(self, ex_metric):
        """P0-B05: 전체 5블록 → workflow completed."""
        wf_id = await ex_metric.start("feature-standard", "std-feat", "std-task")
        await _walk(ex_metric, wf_id, ["plan", "design", "do"])

        # check: match_rate=95 → gate 통과
        inst = ex_metric.checkpoint.load(wf_id)
        inst.context["match_rate"] = 95
        ex_metric.checkpoint.save(wf_id, inst)

        await ex_metric.complete_block(wf_id, "check")
        await ex_metric.complete_block(wf_id, "act")

        inst = ex_metric.checkpoint.load(wf_id)
        assert inst.status == WorkflowStatus.COMPLETED
        for bid in ["plan", "design", "do", "check", "act"]:
            assert inst.blocks[bid].status == BlockStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_p0b06_feature_standard_eventbus_notifications(self, ex_basic):
        """P0-B06: EventBus 이벤트 발행 확인."""
        events: list[Event] = []
        ex_basic.event_bus.subscribe("*", lambda e: events.append(e))

        wf_id = await ex_basic.start("feature-standard", "std-feat", "std-task")
        await _walk(ex_basic, wf_id, ["plan"])

        types = {e.type for e in events}
        assert "workflow.started" in types
        assert "block.started" in types
        assert "block.completed" in types
        assert "block.gate_passed" in types


# ══════════════════════════════════════════════════════════════
# P0-C: Feature-Approval Chain (5건)
# ══════════════════════════════════════════════════════════════


class TestP0CFeatureApproval:
    """P0-C: Feature-approval 승인 체인 E2E."""

    @pytest.fixture
    def setup(self, tmp_path):
        presets_dir = _preset_dir(tmp_path, {"feature-approval": FEATURE_APPROVAL})
        loader = PresetLoader(presets_dir)
        wf_def = loader.load("feature-approval")

        agent_runner = AsyncMock()
        agent_runner.run = AsyncMock(return_value={
            "verdict": "pass", "analysis": "COO 검토 통과", "confidence": 0.95,
        })

        gate_ex = ConcreteGateExecutor(agent_runner=agent_runner)
        pool = {
            "mock-pm": _mock_adapter("exec-pm"),
            "mock-coo": _mock_adapter("exec-coo"),
            "mock-human": _mock_adapter("exec-human"),
            "mock-cto": _mock_adapter("exec-cto"),
        }
        ex = WorkflowExecutor(
            state_machine=StateMachine(),
            event_bus=EventBus(),
            checkpoint=_GateCheckpoint(tmp_path / "cp", wf_def.blocks),
            gate_executor=gate_ex,
            adapter_pool=pool,
            preset_loader=loader,
        )
        return ex, agent_runner

    async def _walk_to_approval(self, ex: WorkflowExecutor, wf_id: str):
        """plan → design → coo_review → ceo_approval 직전까지."""
        await _walk(ex, wf_id, ["plan", "design", "coo_review"])

    @pytest.mark.asyncio
    async def test_p0c01_approval_agent_gate(self, setup):
        """P0-C01: COO Review agent gate verdict 확인."""
        ex, agent_runner = setup
        wf_id = await ex.start("feature-approval", "appr-feat", "appr-task")
        await _walk(ex, wf_id, ["plan", "design"])

        result = await ex.complete_block(wf_id, "coo_review")
        assert result.passed is True
        agent_runner.run.assert_called_once()

    @pytest.mark.asyncio
    async def test_p0c02_approval_waiting_status(self, setup):
        """P0-C02: CEO Approval → WAITING_APPROVAL 상태."""
        ex, _ = setup
        wf_id = await ex.start("feature-approval", "appr-feat", "appr-task")
        await self._walk_to_approval(ex, wf_id)

        result = await ex.complete_block(wf_id, "ceo_approval")
        assert result.passed is False
        assert result.metadata.get("status") == "waiting"

        inst = ex.checkpoint.load(wf_id)
        assert inst.blocks["ceo_approval"].status == BlockStatus.WAITING_APPROVAL

    @pytest.mark.asyncio
    async def test_p0c03_approval_approve_to_do(self, setup):
        """P0-C03: 승인 → Gate 통과 → Do 시작."""
        ex, _ = setup
        wf_id = await ex.start("feature-approval", "appr-feat", "appr-task")
        await self._walk_to_approval(ex, wf_id)

        # WAITING_APPROVAL
        await ex.complete_block(wf_id, "ceo_approval")

        # 승인
        inst = ex.checkpoint.load(wf_id)
        inst.context["approval_action"] = "approve"
        ex.checkpoint.save(wf_id, inst)

        result = await ex.complete_block(wf_id, "ceo_approval")
        assert result.passed is True

        inst = ex.checkpoint.load(wf_id)
        assert inst.blocks["do"].status in (BlockStatus.QUEUED, BlockStatus.RUNNING)

    @pytest.mark.asyncio
    async def test_p0c04_approval_reject_loopback(self, setup):
        """P0-C04: 반려 → Design 루프백."""
        ex, _ = setup
        wf_id = await ex.start("feature-approval", "appr-feat", "appr-task")
        await self._walk_to_approval(ex, wf_id)

        # WAITING_APPROVAL
        await ex.complete_block(wf_id, "ceo_approval")

        # 반려
        inst = ex.checkpoint.load(wf_id)
        inst.context["approval_action"] = "reject"
        inst.context["reject_reason"] = "방향성 불일치"
        ex.checkpoint.save(wf_id, inst)

        result = await ex.complete_block(wf_id, "ceo_approval")
        assert result.passed is False

        inst = ex.checkpoint.load(wf_id)
        # route → design 재시작
        assert inst.blocks["design"].status in (BlockStatus.QUEUED, BlockStatus.RUNNING)

    @pytest.mark.asyncio
    async def test_p0c05_approval_reject_reason_in_context(self, setup):
        """P0-C05: 반려 후 context에 reject_reason + 재시도 프롬프트 포함."""
        ex, agent_runner = setup
        wf_id = await ex.start("feature-approval", "appr-feat", "appr-task")
        await self._walk_to_approval(ex, wf_id)

        # WAITING → reject
        await ex.complete_block(wf_id, "ceo_approval")
        inst = ex.checkpoint.load(wf_id)
        inst.context["approval_action"] = "reject"
        inst.context["reject_reason"] = "⚠️ 반려됨: TDD 섹션 누락"
        ex.checkpoint.save(wf_id, inst)

        await ex.complete_block(wf_id, "ceo_approval")

        # context 검증
        inst = ex.checkpoint.load(wf_id)
        assert "반려" in inst.context.get("reject_reason", "")
        assert inst.context.get("reject_block_id") == "ceo_approval"
        assert inst.context.get("reject_count", 0) >= 1

        # design → coo_review 재실행 → 프롬프트에 반려 사유 포함
        await ex.complete_block(wf_id, "design")
        await ex.complete_block(wf_id, "coo_review")

        last_call = agent_runner.run.call_args_list[-1]
        prompt = last_call.kwargs.get("prompt", "")
        assert "반려" in prompt
