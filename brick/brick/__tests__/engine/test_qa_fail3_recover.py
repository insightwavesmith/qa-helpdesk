"""P2-A01 자동 복구 테스트."""
from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from brick.engine.checkpoint import CheckpointStore
from brick.models.events import BlockStatus, WorkflowStatus
from brick.models.block import Block, DoneCondition
from brick.models.link import LinkDefinition
from brick.models.team import TeamDefinition
from brick.models.workflow import WorkflowDefinition, WorkflowInstance


@pytest.mark.asyncio
async def test_p2a01_auto_recover_resumes_running(tmp_path):
    """RUNNING 블록이 있으면 _monitor_block 재개."""
    from brick.dashboard.routes.engine_bridge import _auto_recover_workflows
    import brick.dashboard.routes.engine_bridge as bridge

    cs = CheckpointStore(tmp_path / "workflows")

    block = Block(id="do", what="work", done=DoneCondition())
    defn = WorkflowDefinition(
        name="test", blocks=[block], links=[],
        teams={"do": TeamDefinition(block_id="do", adapter="human")},
    )
    instance = WorkflowInstance.from_definition(defn, "test", "recovery")
    instance.status = WorkflowStatus.RUNNING
    instance.blocks["do"].status = BlockStatus.RUNNING
    instance.blocks["do"].execution_id = "exec-123"
    cs.save(instance.id, instance)

    mock_executor = MagicMock()
    mock_executor._monitor_block = AsyncMock()

    old_cs = bridge.checkpoint_store
    old_ex = bridge.executor
    bridge.checkpoint_store = cs
    bridge.executor = mock_executor
    try:
        await _auto_recover_workflows()
        mock_executor._monitor_block.assert_called_once()
        call_args = mock_executor._monitor_block.call_args
        assert call_args[0][1] == "do"
    finally:
        bridge.checkpoint_store = old_cs
        bridge.executor = old_ex


@pytest.mark.asyncio
async def test_p2a01_auto_recover_skips_completed(tmp_path):
    """COMPLETED 블록은 스킵."""
    from brick.dashboard.routes.engine_bridge import _auto_recover_workflows
    import brick.dashboard.routes.engine_bridge as bridge

    cs = CheckpointStore(tmp_path / "workflows")

    block = Block(id="do", what="work", done=DoneCondition())
    defn = WorkflowDefinition(
        name="test", blocks=[block], links=[],
        teams={"do": TeamDefinition(block_id="do", adapter="human")},
    )
    instance = WorkflowInstance.from_definition(defn, "test", "skip")
    instance.status = WorkflowStatus.RUNNING
    instance.blocks["do"].status = BlockStatus.COMPLETED
    cs.save(instance.id, instance)

    mock_executor = MagicMock()
    mock_executor._monitor_block = AsyncMock()

    old_cs = bridge.checkpoint_store
    old_ex = bridge.executor
    bridge.checkpoint_store = cs
    bridge.executor = mock_executor
    try:
        await _auto_recover_workflows()
        mock_executor._monitor_block.assert_not_called()
    finally:
        bridge.checkpoint_store = old_cs
        bridge.executor = old_ex
