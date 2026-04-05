"""CompeteManager — compete 블록 모니터링 + 승자 결정."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, asdict

from brick.models.events import BlockStatus, Event
from brick.models.workflow import WorkflowInstance


@dataclass
class CompeteExecution:
    adapter: str
    execution_id: str | None = None
    status: str = "pending"  # pending | running | completed | cancelled


@dataclass
class CompeteGroup:
    block_id: str
    executions: list[CompeteExecution] | None = None
    winner: str | None = None  # 승자 adapter

    def __post_init__(self):
        if self.executions is None:
            self.executions = []


class CompeteManager:
    """compete 블록 모니터링. 1등 완료 시 나머지 취소."""

    POLL_INTERVAL = 5  # compete는 더 빈번하게

    def __init__(self, checkpoint, event_bus, _checkpoint_lock):
        self.checkpoint = checkpoint
        self.event_bus = event_bus
        self._checkpoint_lock = _checkpoint_lock

    async def monitor_compete(
        self,
        instance: WorkflowInstance,
        block_id: str,
        adapter_pool: dict,
        state_machine,
        execute_commands_fn,
        complete_block_fn,
    ):
        while True:
            await asyncio.sleep(self.POLL_INTERVAL)

            instance = self.checkpoint.load(instance.id)
            if not instance:
                break
            block_inst = instance.blocks.get(block_id)
            if not block_inst or block_inst.status != BlockStatus.RUNNING:
                break

            group_data = block_inst.block.metadata.get("compete_group")
            if not group_data:
                break

            executions_data = group_data.get("executions", [])
            executions = [CompeteExecution(**e) for e in executions_data]
            group = CompeteGroup(
                block_id=group_data["block_id"],
                executions=executions,
                winner=group_data.get("winner"),
            )

            winner = None
            for comp_exec in group.executions:
                if comp_exec.status != "running" or not comp_exec.execution_id:
                    continue

                adapter = adapter_pool.get(comp_exec.adapter)
                if not adapter:
                    continue

                try:
                    status = await adapter.check_status(comp_exec.execution_id)
                    if status.status == "completed":
                        winner = comp_exec
                        break
                    elif status.status == "failed":
                        comp_exec.status = "failed"
                except Exception:
                    pass

            if winner:
                # 승자 결정 → 나머지 취소
                group.winner = winner.adapter
                for comp_exec in group.executions:
                    if comp_exec != winner and comp_exec.status == "running":
                        adapter = adapter_pool.get(comp_exec.adapter)
                        if adapter and comp_exec.execution_id:
                            try:
                                await adapter.cancel(comp_exec.execution_id)
                            except Exception:
                                pass
                        comp_exec.status = "cancelled"

                winner.status = "completed"
                block_inst.block.metadata["compete_group"] = asdict(group)
                block_inst.execution_id = winner.execution_id

                # complete_block으로 gate 실행 → 다음 블록 진행
                try:
                    async with self._checkpoint_lock:
                        await complete_block_fn(instance.id, block_id)
                except Exception:
                    pass
                break

            # 전부 실패?
            all_done = all(e.status != "running" for e in group.executions)
            if all_done:
                event = Event(type="block.failed", data={
                    "block_id": block_id,
                    "error": "Compete: 모든 팀 실패",
                })
                async with self._checkpoint_lock:
                    instance, cmds = state_machine.transition(instance, event)
                    self.checkpoint.save(instance.id, instance)
                await execute_commands_fn(instance, cmds)
                break

            # group 상태 저장
            block_inst.block.metadata["compete_group"] = asdict(group)
            async with self._checkpoint_lock:
                self.checkpoint.save(instance.id, instance)
