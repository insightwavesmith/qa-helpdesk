"""BlockMonitor — 어댑터 완료 폴링 + staleness 감지."""

from __future__ import annotations

import asyncio
import time

from brick.models.events import BlockStatus, Event
from brick.models.workflow import WorkflowInstance


class BlockMonitor:
    """어댑터 완료 폴링. 10초 간격. staleness 감지 + 실패 처리."""

    POLL_INTERVAL = 10
    STALE_THRESHOLD = 300       # 5분 — 경고 이벤트
    STALE_HARD_TIMEOUT = 600    # 10분 — adapter_failed 발행 → 재시도 진입

    def __init__(self, checkpoint, event_bus, _checkpoint_lock):
        self.checkpoint = checkpoint
        self.event_bus = event_bus
        self._checkpoint_lock = _checkpoint_lock

    async def monitor(
        self,
        instance: WorkflowInstance,
        block_id: str,
        adapter_pool: dict,
        state_machine,
        execute_commands_fn,
        complete_block_fn,
    ):
        last_change_time = time.time()
        last_status = None

        while True:
            await asyncio.sleep(self.POLL_INTERVAL)

            # 최신 인스턴스 로드
            instance = self.checkpoint.load(instance.id)
            if not instance:
                break
            block_inst = instance.blocks.get(block_id)
            if not block_inst or block_inst.status != BlockStatus.RUNNING:
                break
            if not block_inst.execution_id:
                break

            adapter = adapter_pool.get(block_inst.adapter)
            if not adapter:
                break

            try:
                status = await adapter.check_status(block_inst.execution_id)

                # staleness 감지
                if status.status != last_status:
                    last_status = status.status
                    last_change_time = time.time()
                elif time.time() - last_change_time > self.STALE_THRESHOLD:
                    # 5분 경고
                    self.event_bus.publish(Event(type="block.stale", data={
                        "workflow_id": instance.id,
                        "block_id": block_id,
                        "last_status": last_status,
                        "stale_seconds": int(time.time() - last_change_time),
                    }))

                # 10분 초과 → adapter_failed로 재시도 태움
                if time.time() - last_change_time > self.STALE_HARD_TIMEOUT:
                    event = Event(type="block.adapter_failed", data={
                        "block_id": block_id,
                        "workflow_id": instance.id,
                        "error": f"Stale 타임아웃: {int(time.time() - last_change_time)}초 간 상태 변화 없음",
                    })
                    async with self._checkpoint_lock:
                        instance, cmds = state_machine.transition(instance, event)
                        self.checkpoint.save(instance.id, instance)
                    await execute_commands_fn(instance, cmds)
                    break

                if status.status == "completed":
                    try:
                        async with self._checkpoint_lock:
                            await complete_block_fn(instance.id, block_id)
                    except Exception as e:
                        self.event_bus.publish(Event(type="block.monitor_error", data={
                            "workflow_id": instance.id,
                            "block_id": block_id,
                            "error": str(e),
                        }))
                    break

                elif status.status == "failed":
                    event = Event(type="block.adapter_failed", data={
                        "block_id": block_id,
                        "workflow_id": instance.id,
                        "error": status.error or "Adapter reported failure",
                        "stderr": getattr(status, "stderr", "") or "",
                        "exit_code": getattr(status, "exit_code", None),
                        "adapter": block_inst.adapter if block_inst else "",
                        "role": block_inst.block.metadata.get("role", "") if block_inst else "",
                    })
                    async with self._checkpoint_lock:
                        instance, cmds = state_machine.transition(instance, event)
                        self.checkpoint.save(instance.id, instance)
                    await execute_commands_fn(instance, cmds)
                    break

            except Exception:
                pass  # 네트워크 에러 등 — 다음 폴링에서 재시도
