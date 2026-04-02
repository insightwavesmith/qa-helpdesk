"""BK-76~84: WorkflowExecutor tests."""

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import yaml

from brick.engine.executor import WorkflowExecutor, PresetLoader
from brick.engine.state_machine import StateMachine
from brick.engine.event_bus import EventBus
from brick.engine.checkpoint import CheckpointStore
from brick.engine.validator import Validator
from brick.gates.base import GateExecutor
from brick.models.block import Block, DoneCondition
from brick.models.events import WorkflowStatus, BlockStatus, Event
from brick.models.gate import GateResult
from brick.models.link import LinkDefinition
from brick.models.team import TeamDefinition, AdapterStatus
from brick.models.workflow import WorkflowDefinition, WorkflowInstance


@pytest.fixture
def presets_dir(tmp_path):
    d = tmp_path / "presets"
    d.mkdir()
    preset = {
        "name": "test-l2",
        "$schema": "brick/preset-v2",
        "level": 2,
        "blocks": [
            {"id": "plan", "type": "Plan", "what": "Plan", "done": {"artifacts": ["plan.md"]}},
            {"id": "do", "type": "Do", "what": "Do", "done": {"metrics": {"build_pass": True}}},
        ],
        "links": [{"from": "plan", "to": "do", "type": "sequential"}],
        "teams": {
            "plan": {"adapter": "human", "config": {}},
            "do": {"adapter": "human", "config": {}},
        },
    }
    (d / "test-l2.yaml").write_text(yaml.dump(preset))
    return d


@pytest.fixture
def checkpoint_dir(tmp_path):
    return tmp_path / "workflows"


@pytest.fixture
def mock_adapter():
    adapter = AsyncMock()
    adapter.start_block = AsyncMock(return_value="exec-123")
    adapter.check_status = AsyncMock(return_value=AdapterStatus(status="completed"))
    adapter.get_artifacts = AsyncMock(return_value=[])
    return adapter


@pytest.fixture
def executor(presets_dir, checkpoint_dir, mock_adapter):
    gate = GateExecutor()
    return WorkflowExecutor(
        state_machine=StateMachine(),
        event_bus=EventBus(),
        checkpoint=CheckpointStore(checkpoint_dir),
        gate_executor=gate,
        adapter_pool={"human": mock_adapter},
        preset_loader=PresetLoader(presets_dir),
        validator=Validator(),
    )


class TestPresetLoader:
    def test_bk76_load_and_validate(self, presets_dir):
        """BK-76: 프리셋 로드 + 검증."""
        loader = PresetLoader(presets_dir)
        defn = loader.load("test-l2")
        assert defn.name == "test-l2"
        assert len(defn.blocks) == 2
        assert len(defn.links) == 1
        assert "plan" in defn.teams

    def test_bk76_preset_not_found(self, tmp_path):
        loader = PresetLoader(tmp_path)
        with pytest.raises(FileNotFoundError):
            loader.load("nonexistent")

    def test_bk77_extends_inheritance(self, presets_dir):
        """BK-77: extends 상속."""
        child = {
            "name": "child",
            "extends": "test-l2",
            "level": 3,
            "blocks": [
                {"id": "security", "type": "Review", "what": "Security", "done": {"artifacts": []}},
            ],
            "links": [
                {"from": "plan", "to": "do", "type": "sequential"},
                {"from": "do", "to": "security", "type": "sequential"},
            ],
            "teams": {
                "security": {"adapter": "human", "config": {}},
            },
        }
        (presets_dir / "child.yaml").write_text(yaml.dump(child))
        loader = PresetLoader(presets_dir)
        defn = loader.load("child")
        block_ids = {b.id for b in defn.blocks}
        assert "plan" in block_ids
        assert "do" in block_ids
        assert "security" in block_ids

    def test_bk78_overrides(self, presets_dir):
        """BK-78: overrides 적용."""
        child = {
            "name": "override-test",
            "extends": "test-l2",
            "blocks": [],
            "links": [{"from": "plan", "to": "do", "type": "sequential"}],
            "teams": {},
            "overrides": {"plan": {"what": "Override Plan"}},
        }
        (presets_dir / "override-test.yaml").write_text(yaml.dump(child))
        loader = PresetLoader(presets_dir)
        defn = loader.load("override-test")
        plan = next(b for b in defn.blocks if b.id == "plan")
        assert plan.what == "Override Plan"


class TestWorkflowExecutor:
    @pytest.mark.asyncio
    async def test_bk79_instance_creation_checkpoint(self, executor, checkpoint_dir):
        """BK-79: 인스턴스 생성 + checkpoint."""
        wf_id = await executor.start("test-l2", "feature-x", "task-1")
        assert wf_id.startswith("feature-x-")
        instance = executor.checkpoint.load(wf_id)
        assert instance is not None
        assert instance.status == WorkflowStatus.RUNNING

    @pytest.mark.asyncio
    async def test_bk80_context_auto_inject(self, executor):
        """BK-80: 컨텍스트 자동 주입."""
        wf_id = await executor.start("test-l2", "feat", "task")
        instance = executor.checkpoint.load(wf_id)
        # First block should be queued/running
        first = instance.blocks["plan"]
        assert first.status in (BlockStatus.QUEUED, BlockStatus.RUNNING)

    @pytest.mark.asyncio
    async def test_bk81_workflow_completion(self, executor, mock_adapter):
        """BK-81: 워크플로우 완료."""
        wf_id = await executor.start("test-l2", "feat", "task")
        instance = executor.checkpoint.load(wf_id)
        # Manually set plan to gate_checking for complete_block
        instance.blocks["plan"].status = BlockStatus.GATE_CHECKING
        executor.checkpoint.save(wf_id, instance)
        await executor.complete_block(wf_id, "plan")

        instance = executor.checkpoint.load(wf_id)
        assert instance.blocks["plan"].status == BlockStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_bk82_resume_after_crash(self, executor, mock_adapter):
        """BK-82: resume 크래시 후 재개."""
        wf_id = await executor.start("test-l2", "feat", "task")
        instance = await executor.resume(wf_id)
        assert instance is not None

    @pytest.mark.asyncio
    async def test_bk83_resume_in_progress(self, executor, mock_adapter):
        """BK-83: resume in_progress 블록 상태 확인."""
        wf_id = await executor.start("test-l2", "feat", "task")
        instance = executor.checkpoint.load(wf_id)
        instance.blocks["plan"].status = BlockStatus.RUNNING
        instance.blocks["plan"].execution_id = "exec-123"
        executor.checkpoint.save(wf_id, instance)

        instance = await executor.resume(wf_id)
        # adapter returns completed → should trigger complete_block
        assert instance is not None

    @pytest.mark.asyncio
    async def test_bk84_no_preset_loader(self, checkpoint_dir):
        """BK-84: context_contract 미충족."""
        exec_no_loader = WorkflowExecutor(
            state_machine=StateMachine(),
            event_bus=EventBus(),
            checkpoint=CheckpointStore(checkpoint_dir),
            gate_executor=GateExecutor(),
        )
        with pytest.raises(ValueError, match="No preset loader"):
            await exec_no_loader.start("any", "f", "t")

    @pytest.mark.asyncio
    async def test_complete_block_not_found(self, executor):
        with pytest.raises(ValueError, match="not found"):
            await executor.complete_block("nonexistent", "plan")

    @pytest.mark.asyncio
    async def test_resume_not_found(self, executor):
        with pytest.raises(ValueError, match="not found"):
            await executor.resume("nonexistent")
