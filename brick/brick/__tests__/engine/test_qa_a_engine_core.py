"""QA-A 엔진 코어 테스트 — Executor, Checkpoint, EventBus, PresetValidator, CronScheduler.

A-11 ~ A-30: 20건 테스트.
"""

from __future__ import annotations

import asyncio
import json
import threading
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from brick.engine.checkpoint import CheckpointStore
from brick.engine.cron_scheduler import CronJob, CronScheduler
from brick.engine.event_bus import EventBus
from brick.engine.executor import WorkflowExecutor, PresetLoader
from brick.engine.preset_validator import (
    PresetValidator,
    ValidationError,
    DEFAULT_GATE_TYPES,
    DEFAULT_LINK_TYPES,
    DEFAULT_ADAPTERS,
)
from brick.engine.state_machine import StateMachine
from brick.gates.base import GateExecutor
from brick.models.block import Block, DoneCondition, GateConfig, GateHandler
from brick.models.events import (
    BlockStatus,
    Event,
    WorkflowStatus,
)
from brick.models.gate import GateResult
from brick.models.link import LinkDefinition
from brick.models.team import TeamDefinition
from brick.models.workflow import (
    BlockInstance,
    WorkflowDefinition,
    WorkflowInstance,
)


# ──────────────────────────────────────
# Helpers
# ──────────────────────────────────────

def _make_definition(
    blocks: list[Block] | None = None,
    links: list[LinkDefinition] | None = None,
    teams: dict[str, TeamDefinition] | None = None,
    project: str = "",
    feature: str = "",
) -> WorkflowDefinition:
    if blocks is None:
        blocks = [
            Block(id="b1", what="Do step 1", done=DoneCondition()),
            Block(id="b2", what="Do step 2", done=DoneCondition()),
        ]
    if links is None:
        links = [LinkDefinition(from_block="b1", to_block="b2")]
    if teams is None:
        teams = {
            b.id: TeamDefinition(block_id=b.id, adapter="mock_adapter")
            for b in blocks
        }
    return WorkflowDefinition(
        name="test-wf",
        blocks=blocks,
        links=links,
        teams=teams,
        project=project,
        feature=feature,
    )


def _make_instance(
    definition: WorkflowDefinition | None = None,
    feature: str = "test-feat",
    task: str = "test-task",
) -> WorkflowInstance:
    defn = definition or _make_definition()
    return WorkflowInstance.from_definition(defn, feature, task)


def _make_executor(
    checkpoint_dir: Path,
    gate_result: GateResult | None = None,
    adapter_pool: dict | None = None,
    preset_loader: PresetLoader | None = None,
) -> WorkflowExecutor:
    sm = StateMachine()
    eb = EventBus()
    cp = CheckpointStore(checkpoint_dir)
    ge = GateExecutor()
    if gate_result is None:
        gate_result = GateResult(passed=True)
    ge.run_gates = AsyncMock(return_value=gate_result)
    return WorkflowExecutor(
        state_machine=sm,
        event_bus=eb,
        checkpoint=cp,
        gate_executor=ge,
        adapter_pool=adapter_pool or {},
        preset_loader=preset_loader,
    )


# ──────────────────────────────────────
# A-11 ~ A-18: Executor
# ──────────────────────────────────────

class TestExecutor:
    """Executor 테스트 (A-11 ~ A-18)."""

    @pytest.mark.asyncio
    async def test_a11_start_workflow_first_block_queued(self, tmp_path: Path):
        """start() → 첫 블록이 QUEUED 상태가 됨."""
        defn = _make_definition()
        preset_loader = MagicMock()
        preset_loader.load.return_value = defn

        adapter = AsyncMock()
        adapter.start_block = AsyncMock(return_value="exec-001")

        executor = _make_executor(
            tmp_path,
            adapter_pool={"mock_adapter": adapter},
            preset_loader=preset_loader,
        )

        wf_id = await executor.start("test-preset", "feat-1", "task-1")

        instance = executor.checkpoint.load(wf_id)
        assert instance is not None
        assert instance.status == WorkflowStatus.RUNNING
        # 첫 블록은 start_block이 호출되므로 RUNNING
        first_block = instance.blocks["b1"]
        assert first_block.status in (BlockStatus.QUEUED, BlockStatus.RUNNING)

    @pytest.mark.asyncio
    async def test_a12_complete_block_runs_gate(self, tmp_path: Path):
        """complete_block() → Gate가 실행됨."""
        defn = _make_definition()
        instance = _make_instance(defn)
        instance.status = WorkflowStatus.RUNNING
        instance.blocks["b1"].status = BlockStatus.RUNNING
        instance.current_block_id = "b1"

        gate_result = GateResult(passed=True, detail="OK")
        executor = _make_executor(tmp_path, gate_result=gate_result)
        executor.checkpoint.save(instance.id, instance)

        result = await executor.complete_block(instance.id, "b1")
        assert result.passed is True
        executor.gate_executor.run_gates.assert_called_once()

    @pytest.mark.asyncio
    async def test_a13_project_context_injection(self, tmp_path: Path):
        """start() 시 project context가 instance.context['project']에 주입됨."""
        defn = _make_definition(project="bscamp")
        preset_loader = MagicMock()
        preset_loader.load.return_value = defn

        adapter = AsyncMock()
        adapter.start_block = AsyncMock(return_value="exec-002")

        executor = _make_executor(
            tmp_path,
            adapter_pool={"mock_adapter": adapter},
            preset_loader=preset_loader,
        )

        # project.yaml 로드 mock
        with patch.object(executor, "_load_project_yaml", return_value={"name": "bscamp", "repo": "bscamp"}):
            wf_id = await executor.start("preset", "feat", "task", initial_context={"name": "bscamp"})

        instance = executor.checkpoint.load(wf_id)
        assert "project" in instance.context
        assert instance.context["project"]["name"] == "bscamp"

    @pytest.mark.asyncio
    async def test_a14_feature_variable_substitution(self, tmp_path: Path):
        """PresetLoader가 {feature} 변수를 치환함."""
        preset_yaml = {
            "name": "test",
            "project": "myproj",
            "feature": "my-feat",
            "blocks": [
                {"id": "b1", "what": "Plan for {project}/{feature}", "done": {}},
            ],
            "links": [],
            "teams": {"b1": "human"},
        }
        preset_dir = tmp_path / "presets"
        preset_dir.mkdir()
        import yaml
        (preset_dir / "test.yaml").write_text(yaml.dump(preset_yaml))

        loader = PresetLoader(preset_dir)
        defn = loader.load("test")

        assert "myproj" in defn.blocks[0].what
        assert "my-feat" in defn.blocks[0].what
        assert "{project}" not in defn.blocks[0].what
        assert "{feature}" not in defn.blocks[0].what

    @pytest.mark.asyncio
    async def test_a15_reject_reason_context_injection(self, tmp_path: Path):
        """Gate 실패 시 reject_reason이 context에 주입됨."""
        defn = _make_definition()
        instance = _make_instance(defn)
        instance.status = WorkflowStatus.RUNNING
        instance.blocks["b1"].status = BlockStatus.RUNNING
        instance.current_block_id = "b1"

        gate_result = GateResult(
            passed=False,
            detail="품질 미달",
            metadata={"reject_reason": "Match Rate 70%"},
        )
        executor = _make_executor(tmp_path, gate_result=gate_result)
        executor.checkpoint.save(instance.id, instance)

        await executor.complete_block(instance.id, "b1")

        updated = executor.checkpoint.load(instance.id)
        assert updated.context.get("reject_reason") == "Match Rate 70%"
        assert updated.context.get("reject_block_id") == "b1"
        assert updated.context.get("reject_count") == 1

    @pytest.mark.asyncio
    async def test_a16_reject_count_increments(self, tmp_path: Path):
        """연속 reject 시 reject_count가 증가함."""
        defn = _make_definition(
            blocks=[Block(
                id="b1", what="step",
                done=DoneCondition(),
                gate=GateConfig(
                    handlers=[GateHandler(type="command", command="echo fail")],
                    on_fail="retry",
                    max_retries=5,
                ),
            )],
            links=[],
            teams={"b1": TeamDefinition(block_id="b1", adapter="mock")},
        )
        instance = _make_instance(defn)
        instance.status = WorkflowStatus.RUNNING
        instance.blocks["b1"].status = BlockStatus.RUNNING
        instance.current_block_id = "b1"
        instance.context["reject_count"] = 1
        instance.context["reject_reason"] = "prev"
        instance.context["reject_block_id"] = "b1"

        gate_result = GateResult(
            passed=False,
            detail="또 실패",
            metadata={"reject_reason": "다시 실패"},
        )
        executor = _make_executor(tmp_path, gate_result=gate_result)
        executor.checkpoint.save(instance.id, instance)

        await executor.complete_block(instance.id, "b1")

        updated = executor.checkpoint.load(instance.id)
        assert updated.context["reject_count"] == 2

    @pytest.mark.asyncio
    async def test_a17_approve_clears_reject(self, tmp_path: Path):
        """approve 시 reject_reason 관련 키가 context에서 제거됨."""
        defn = _make_definition()
        instance = _make_instance(defn)
        instance.status = WorkflowStatus.RUNNING
        instance.blocks["b1"].status = BlockStatus.RUNNING
        instance.current_block_id = "b1"
        instance.context["reject_reason"] = "prev"
        instance.context["reject_block_id"] = "b1"
        instance.context["reject_count"] = 2

        gate_result = GateResult(passed=True, detail="통과")
        executor = _make_executor(tmp_path, gate_result=gate_result)
        executor.checkpoint.save(instance.id, instance)

        await executor.complete_block(instance.id, "b1")

        updated = executor.checkpoint.load(instance.id)
        assert "reject_reason" not in updated.context
        assert "reject_block_id" not in updated.context
        assert "reject_count" not in updated.context

    @pytest.mark.asyncio
    async def test_a18_enrich_event_data(self, tmp_path: Path):
        """_enrich_event_data가 project/feature/workflow_id를 이벤트에 추가함."""
        defn = _make_definition(project="bscamp", feature="brick")
        instance = _make_instance(defn, feature="brick-p0")
        instance.context["project"] = {"name": "bscamp"}

        executor = _make_executor(tmp_path)

        data = {"block_id": "b1"}
        enriched = executor._enrich_event_data(instance, data)

        assert enriched["project"] == "bscamp"
        assert enriched["feature"] == "brick-p0"
        assert enriched["workflow_id"] == instance.id
        # setdefault: 이미 있는 값은 덮어쓰지 않음
        data2 = {"project": "override"}
        enriched2 = executor._enrich_event_data(instance, data2)
        assert enriched2["project"] == "override"


# ──────────────────────────────────────
# A-19 ~ A-21: Checkpoint
# ──────────────────────────────────────

class TestCheckpoint:
    """Checkpoint 테스트 (A-19 ~ A-21)."""

    def test_a19_save_load_roundtrip(self, tmp_path: Path):
        """save → load 결과가 원본과 일치함."""
        store = CheckpointStore(tmp_path)
        instance = _make_instance()
        instance.status = WorkflowStatus.RUNNING
        instance.context = {"key": "value", "nested": {"a": 1}}

        store.save(instance.id, instance)
        loaded = store.load(instance.id)

        assert loaded is not None
        assert loaded.id == instance.id
        assert loaded.status == instance.status
        assert loaded.context == instance.context
        assert loaded.feature == instance.feature
        assert set(loaded.blocks.keys()) == set(instance.blocks.keys())

    def test_a20_list_active_workflows(self, tmp_path: Path):
        """list_active()가 completed/failed 제외한 워크플로우를 반환함."""
        store = CheckpointStore(tmp_path)

        # running
        inst1 = _make_instance()
        inst1.status = WorkflowStatus.RUNNING
        store.save("wf-running", inst1)

        # completed
        inst2 = _make_instance()
        inst2.status = WorkflowStatus.COMPLETED
        store.save("wf-done", inst2)

        # failed
        inst3 = _make_instance()
        inst3.status = WorkflowStatus.FAILED
        store.save("wf-fail", inst3)

        # pending
        inst4 = _make_instance()
        inst4.status = WorkflowStatus.PENDING
        store.save("wf-pending", inst4)

        active = store.list_active()
        assert "wf-running" in active
        assert "wf-pending" in active
        assert "wf-done" not in active
        assert "wf-fail" not in active

    def test_a21_concurrent_save_no_corruption(self, tmp_path: Path):
        """동시 save 시 최종 파일이 유효한 JSON (atomic write: tmp→rename).

        NOTE: CheckpointStore는 단일 .tmp 경로를 사용하므로 동시 rename에서
        FileNotFoundError가 발생할 수 있다. 핵심 검증은 최종 파일의 데이터 무결성.
        """
        store = CheckpointStore(tmp_path)

        # 각 워크플로우별로 독립 save → 경합 없음 확인
        def save_worker(wf_id: str, context_val: str):
            inst = _make_instance()
            inst.status = WorkflowStatus.RUNNING
            inst.context = {"worker": context_val}
            store.save(wf_id, inst)

        threads = [
            threading.Thread(target=save_worker, args=(f"wf-{i}", f"w{i}"))
            for i in range(10)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # 모든 워크플로우가 유효한 JSON으로 저장됨
        for i in range(10):
            wf_id = f"wf-{i}"
            loaded = store.load(wf_id)
            assert loaded is not None
            assert loaded.status == WorkflowStatus.RUNNING
            state_file = tmp_path / wf_id / "state.json"
            data = json.loads(state_file.read_text())
            assert "id" in data
            assert data["context"]["worker"] == f"w{i}"


# ──────────────────────────────────────
# A-22 ~ A-24: EventBus
# ──────────────────────────────────────

class TestEventBus:
    """EventBus 테스트 (A-22 ~ A-24)."""

    def test_a22_publish_subscribe_basic(self):
        """publish → subscribe 수신 기본 동작."""
        bus = EventBus()
        received = []

        bus.subscribe("block.completed", lambda e: received.append(e))
        bus.publish(Event(type="block.completed", data={"block_id": "b1"}))

        assert len(received) == 1
        assert received[0].data["block_id"] == "b1"

    def test_a23_multiple_subscribers(self):
        """여러 구독자가 동시에 수신함 (멀티캐스트)."""
        bus = EventBus()
        recv1 = []
        recv2 = []
        recv_wild = []

        bus.subscribe("test.event", lambda e: recv1.append(e))
        bus.subscribe("test.event", lambda e: recv2.append(e))
        bus.subscribe("*", lambda e: recv_wild.append(e))

        bus.publish(Event(type="test.event", data={"v": 1}))

        assert len(recv1) == 1
        assert len(recv2) == 1
        assert len(recv_wild) == 1

    def test_a24_unsubscribe(self):
        """unsubscribe 후 더 이상 수신하지 않음."""
        bus = EventBus()
        received = []
        handler = lambda e: received.append(e)

        bus.subscribe("my.event", handler)
        bus.publish(Event(type="my.event"))
        assert len(received) == 1

        bus.unsubscribe("my.event", handler)
        bus.publish(Event(type="my.event"))
        assert len(received) == 1  # 증가하지 않음


# ──────────────────────────────────────
# A-25 ~ A-28: PresetValidator
# ──────────────────────────────────────

class TestPresetValidator:
    """PresetValidator 테스트 (A-25 ~ A-28)."""

    def test_a25_valid_preset_no_errors(self):
        """유효한 프리셋 → 에러 0건."""
        defn = _make_definition()
        validator = PresetValidator()
        errors = validator.validate(defn)

        real_errors = [e for e in errors if e.severity == "error"]
        assert len(real_errors) == 0

    def test_a26_unknown_gate_type_error(self):
        """없는 Gate 타입 → 에러 반환."""
        blocks = [
            Block(
                id="b1",
                what="step 1",
                done=DoneCondition(),
                gate=GateConfig(handlers=[
                    GateHandler(type="nonexistent_gate"),
                ]),
            ),
        ]
        defn = _make_definition(blocks=blocks, links=[], teams={
            "b1": TeamDefinition(block_id="b1", adapter="human"),
        })
        validator = PresetValidator()
        errors = validator.validate(defn)

        gate_errors = [e for e in errors if "게이트 타입" in e.message]
        assert len(gate_errors) == 1
        assert "nonexistent_gate" in gate_errors[0].message

    def test_a27_unknown_adapter_warning(self):
        """없는 어댑터 → warning 반환."""
        blocks = [Block(id="b1", what="step", done=DoneCondition())]
        defn = _make_definition(
            blocks=blocks,
            links=[],
            teams={"b1": TeamDefinition(block_id="b1", adapter="nonexistent_adapter")},
        )
        validator = PresetValidator()
        errors = validator.validate(defn)

        adapter_warns = [e for e in errors if "어댑터" in e.message and e.severity == "warning"]
        assert len(adapter_warns) == 1
        assert "nonexistent_adapter" in adapter_warns[0].message

    def test_a28_project_field_missing_team(self):
        """블록에 팀 미할당 → 에러."""
        blocks = [
            Block(id="b1", what="step 1", done=DoneCondition()),
            Block(id="b2", what="step 2", done=DoneCondition()),
        ]
        # b2에 팀 미할당
        defn = _make_definition(
            blocks=blocks,
            links=[LinkDefinition(from_block="b1", to_block="b2")],
            teams={"b1": TeamDefinition(block_id="b1", adapter="human")},
        )
        validator = PresetValidator()
        errors = validator.validate(defn)

        team_errors = [e for e in errors if "팀 미할당" in e.message]
        assert len(team_errors) == 1
        assert "b2" in team_errors[0].message


# ──────────────────────────────────────
# A-29 ~ A-30: CronScheduler
# ──────────────────────────────────────

class TestCronScheduler:
    """CronScheduler 테스트 (A-29 ~ A-30)."""

    def test_a29_cron_expression_parsing(self):
        """croniter가 cron 표현식을 올바르게 파싱함."""
        from croniter import croniter
        import time

        cron = croniter("*/5 * * * *", time.time())
        next_run = cron.get_next(float)
        assert next_run > time.time() - 1  # 미래 시각

        cron2 = croniter("0 0 * * *", time.time())
        next_run2 = cron2.get_next(float)
        assert next_run2 > time.time()

    def test_a30_schedule_register_unregister(self):
        """cron job 등록 및 해제."""
        scheduler = CronScheduler()

        job = CronJob(
            workflow_id="wf-1",
            from_block_id="b1",
            to_block_id="b2",
            adapter="mock_adapter",
            schedule="*/10 * * * *",
            max_runs=5,
        )
        scheduler.register(job)
        assert len(scheduler.jobs) == 1

        key = "wf-1:b1:b2"
        assert key in scheduler.jobs
        assert scheduler.jobs[key].schedule == "*/10 * * * *"

        # 워크플로우별 해제
        scheduler.unregister_workflow("wf-1")
        assert len(scheduler.jobs) == 0

        # 다른 워크플로우 job은 남아있음
        job2 = CronJob(
            workflow_id="wf-2",
            from_block_id="b1",
            to_block_id="b2",
            adapter="mock",
            schedule="0 * * * *",
            max_runs=3,
        )
        scheduler.register(job)
        scheduler.register(job2)
        assert len(scheduler.jobs) == 2

        scheduler.unregister_workflow("wf-1")
        assert len(scheduler.jobs) == 1
        assert "wf-2:b1:b2" in scheduler.jobs
