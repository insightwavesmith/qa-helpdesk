"""be_20~be_21: CompeteManager 모듈 분리 TDD."""

import asyncio
from unittest.mock import AsyncMock, MagicMock


def test_be20_compete_manager_importable():
    """be_20: from brick.engine.compete_manager import CompeteManager, CompeteExecution, CompeteGroup."""
    from brick.engine.compete_manager import CompeteManager, CompeteExecution, CompeteGroup
    assert CompeteManager is not None
    assert CompeteExecution is not None
    assert CompeteGroup is not None


def test_be21_compete_manager_cancel_losers():
    """be_21: CompeteManager.monitor_compete에서 승자 결정 시 나머지 cancel 호출."""
    from brick.engine.compete_manager import CompeteManager, CompeteExecution, CompeteGroup
    from dataclasses import asdict

    async def _run():
        cp = MagicMock()
        eb = MagicMock()
        lock = asyncio.Lock()
        manager = CompeteManager(checkpoint=cp, event_bus=eb, _checkpoint_lock=lock)

        # CompeteGroup 데이터 준비
        group = CompeteGroup(
            block_id="b1",
            executions=[
                CompeteExecution(adapter="a1", execution_id="e1", status="running"),
                CompeteExecution(adapter="a2", execution_id="e2", status="running"),
            ],
        )

        # 어댑터 mock: a1 completed, a2 running
        adapter_a1 = AsyncMock()
        adapter_a1.check_status = AsyncMock(return_value=MagicMock(status="completed"))
        adapter_a2 = AsyncMock()
        adapter_a2.check_status = AsyncMock(return_value=MagicMock(status="running"))
        adapter_a2.cancel = AsyncMock()

        adapter_pool = {"a1": adapter_a1, "a2": adapter_a2}

        # instance mock
        block_inst = MagicMock()
        block_inst.status = MagicMock()  # BlockStatus.RUNNING
        block_inst.status.name = "RUNNING"
        block_inst.block.metadata = {"compete_group": asdict(group)}

        instance = MagicMock()
        instance.id = "wf1"
        instance.blocks = {"b1": block_inst}

        # checkpoint.load returns instance on first call, None on second (to exit loop)
        cp.load = MagicMock(side_effect=[instance, None])

        # BlockStatus 비교를 위해 block_inst.status를 실제 값으로
        from brick.models.events import BlockStatus
        block_inst.status = BlockStatus.RUNNING

        state_machine = MagicMock()
        complete_block_fn = AsyncMock()

        await manager.monitor_compete(
            instance=instance,
            block_id="b1",
            adapter_pool=adapter_pool,
            state_machine=state_machine,
            execute_commands_fn=AsyncMock(),
            complete_block_fn=complete_block_fn,
        )

        # a2가 cancel 되었는지 확인
        adapter_a2.cancel.assert_called_once_with("e2")

    asyncio.run(_run())
