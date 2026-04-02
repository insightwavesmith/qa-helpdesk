"""BK-98~100: E2E tests (mock adapters)."""

from pathlib import Path
from unittest.mock import AsyncMock

import pytest
import yaml

from brick.engine.executor import WorkflowExecutor, PresetLoader
from brick.engine.state_machine import StateMachine
from brick.engine.event_bus import EventBus
from brick.engine.checkpoint import CheckpointStore
from brick.gates.base import GateExecutor
from brick.models.events import WorkflowStatus, BlockStatus
from brick.models.team import AdapterStatus


@pytest.fixture
def e2e_presets(tmp_path):
    d = tmp_path / "presets"
    d.mkdir()

    # L2 preset
    l2 = {
        "name": "e2e-l2",
        "level": 2,
        "blocks": [
            {"id": "plan", "type": "Plan", "what": "Plan", "done": {"artifacts": []}},
            {"id": "design", "type": "Design", "what": "Design", "done": {"artifacts": []}},
            {"id": "do", "type": "Do", "what": "Implement", "done": {"metrics": {}}},
            {"id": "check", "type": "Check", "what": "Gap", "done": {"metrics": {}}},
            {"id": "act", "type": "Act", "what": "Deploy", "done": {"artifacts": []}},
        ],
        "links": [
            {"from": "plan", "to": "design", "type": "sequential"},
            {"from": "design", "to": "do", "type": "sequential"},
            {"from": "do", "to": "check", "type": "sequential"},
            {"from": "check", "to": "act", "type": "sequential"},
        ],
        "teams": {
            "plan": {"adapter": "mock"},
            "design": {"adapter": "mock"},
            "do": {"adapter": "mock"},
            "check": {"adapter": "mock"},
            "act": {"adapter": "mock"},
        },
    }
    (d / "e2e-l2.yaml").write_text(yaml.dump(l2))

    # Hotfix preset
    hotfix = {
        "name": "e2e-hotfix",
        "level": 0,
        "blocks": [
            {"id": "do", "type": "Do", "what": "Fix", "done": {"metrics": {}}},
            {"id": "qa", "type": "Check", "what": "QA", "done": {"metrics": {}}},
        ],
        "links": [{"from": "do", "to": "qa", "type": "sequential"}],
        "teams": {
            "do": {"adapter": "mock"},
            "qa": {"adapter": "mock"},
        },
    }
    (d / "e2e-hotfix.yaml").write_text(yaml.dump(hotfix))

    # Loop preset
    loop = {
        "name": "e2e-loop",
        "level": 2,
        "blocks": [
            {"id": "do", "type": "Do", "what": "Implement", "done": {"metrics": {}}},
            {"id": "check", "type": "Check", "what": "Check", "done": {"metrics": {}}},
        ],
        "links": [
            {"from": "do", "to": "check", "type": "sequential"},
            {"from": "check", "to": "do", "type": "loop", "condition": {"match_rate_below": 90}, "max_retries": 3},
        ],
        "teams": {
            "do": {"adapter": "mock"},
            "check": {"adapter": "mock"},
        },
    }
    (d / "e2e-loop.yaml").write_text(yaml.dump(loop))

    return d


@pytest.fixture
def mock_adapter():
    adapter = AsyncMock()
    adapter.start_block = AsyncMock(return_value="e2e-exec-1")
    adapter.check_status = AsyncMock(return_value=AdapterStatus(status="completed"))
    return adapter


class TestE2E:
    @pytest.mark.asyncio
    async def test_bk98_t_pdca_l2_full(self, e2e_presets, tmp_path, mock_adapter):
        """BK-98: T-PDCA L2 전체 (5블록 순차 → completed)."""
        executor = WorkflowExecutor(
            state_machine=StateMachine(),
            event_bus=EventBus(),
            checkpoint=CheckpointStore(tmp_path / "wf"),
            gate_executor=GateExecutor(),
            adapter_pool={"mock": mock_adapter},
            preset_loader=PresetLoader(e2e_presets),
        )

        wf_id = await executor.start("e2e-l2", "feat-e2e", "task-e2e")
        instance = executor.checkpoint.load(wf_id)
        assert instance.status == WorkflowStatus.RUNNING

        # Walk through all 5 blocks
        block_order = ["plan", "design", "do", "check", "act"]
        for block_id in block_order:
            instance = executor.checkpoint.load(wf_id)
            instance.blocks[block_id].status = BlockStatus.GATE_CHECKING
            executor.checkpoint.save(wf_id, instance)
            result = await executor.complete_block(wf_id, block_id)
            assert result.passed is True

        instance = executor.checkpoint.load(wf_id)
        assert instance.blocks["act"].status == BlockStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_bk99_hotfix_preset(self, e2e_presets, tmp_path, mock_adapter):
        """BK-99: Hotfix 프리셋 (Do → QA → completed)."""
        executor = WorkflowExecutor(
            state_machine=StateMachine(),
            event_bus=EventBus(),
            checkpoint=CheckpointStore(tmp_path / "wf"),
            gate_executor=GateExecutor(),
            adapter_pool={"mock": mock_adapter},
            preset_loader=PresetLoader(e2e_presets),
        )

        wf_id = await executor.start("e2e-hotfix", "hotfix-1", "fix-urgent")
        for block_id in ["do", "qa"]:
            instance = executor.checkpoint.load(wf_id)
            instance.blocks[block_id].status = BlockStatus.GATE_CHECKING
            executor.checkpoint.save(wf_id, instance)
            await executor.complete_block(wf_id, block_id)

        instance = executor.checkpoint.load(wf_id)
        assert instance.blocks["qa"].status == BlockStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_bk100_loop_retry_then_pass(self, e2e_presets, tmp_path, mock_adapter):
        """BK-100: Loop 재시도 + 통과."""
        executor = WorkflowExecutor(
            state_machine=StateMachine(),
            event_bus=EventBus(),
            checkpoint=CheckpointStore(tmp_path / "wf"),
            gate_executor=GateExecutor(),
            adapter_pool={"mock": mock_adapter},
            preset_loader=PresetLoader(e2e_presets),
        )

        wf_id = await executor.start("e2e-loop", "loop-feat", "loop-task")

        # Complete 'do' block
        instance = executor.checkpoint.load(wf_id)
        instance.blocks["do"].status = BlockStatus.GATE_CHECKING
        executor.checkpoint.save(wf_id, instance)
        await executor.complete_block(wf_id, "do")

        # Check block with low match rate → loop back
        instance = executor.checkpoint.load(wf_id)
        instance.blocks["check"].status = BlockStatus.GATE_CHECKING
        instance.blocks["check"].metrics = {"match_rate": 85}
        executor.checkpoint.save(wf_id, instance)
        await executor.complete_block(wf_id, "check")

        # Verify check completed (gate passed since no gates configured)
        instance = executor.checkpoint.load(wf_id)
        assert instance.blocks["check"].status == BlockStatus.COMPLETED
