"""StateMachine — pure functional state transitions. Zero side effects."""

from __future__ import annotations

import copy
import time

from brick.models.events import (
    Event, Command, StartBlockCommand, CheckGateCommand,
    EmitEventCommand, SaveCheckpointCommand,
    RetryAdapterCommand, NotifyCommand, CompeteStartCommand,
    WorkflowStatus, BlockStatus,
)
from brick.models.workflow import WorkflowInstance, BlockInstance


class StateMachine:
    """Pure functional state machine. transition() returns a NEW WorkflowInstance."""

    def transition(
        self, workflow: WorkflowInstance, event: Event
    ) -> tuple[WorkflowInstance, list[Command]]:
        wf = copy.deepcopy(workflow)
        wf.updated_at = time.time()

        if event.type.startswith("workflow."):
            return self._handle_workflow_event(wf, event)
        elif event.type.startswith("block."):
            return self._handle_block_event(wf, event)
        else:
            return wf, []

    def _handle_workflow_event(
        self, wf: WorkflowInstance, event: Event
    ) -> tuple[WorkflowInstance, list[Command]]:
        commands: list[Command] = []

        if event.type == "workflow.start":
            if wf.status != WorkflowStatus.PENDING:
                return wf, []
            wf.status = WorkflowStatus.RUNNING
            first_block = wf.get_first_block()
            first_block.status = BlockStatus.QUEUED
            wf.current_block_id = first_block.block.id
            commands.append(StartBlockCommand(
                block_id=first_block.block.id,
                adapter=first_block.adapter,
            ))
            commands.append(EmitEventCommand(
                event=Event(type="workflow.started", data={"workflow_id": wf.id}),
            ))
            commands.append(SaveCheckpointCommand())

        elif event.type == "workflow.suspend":
            if wf.status == WorkflowStatus.RUNNING:
                wf.status = WorkflowStatus.SUSPENDED
                commands.append(SaveCheckpointCommand())

        elif event.type == "workflow.resume":
            if wf.status == WorkflowStatus.SUSPENDED:
                wf.status = WorkflowStatus.RUNNING
                commands.append(SaveCheckpointCommand())

        elif event.type == "workflow.fail":
            if wf.status == WorkflowStatus.RUNNING:
                wf.status = WorkflowStatus.FAILED
                commands.append(SaveCheckpointCommand())

        return wf, commands

    def _handle_block_event(
        self, wf: WorkflowInstance, event: Event
    ) -> tuple[WorkflowInstance, list[Command]]:
        commands: list[Command] = []
        block_id = event.data.get("block_id", wf.current_block_id)
        if not block_id or block_id not in wf.blocks:
            return wf, []

        block_inst = wf.blocks[block_id]

        if event.type == "block.started":
            if block_inst.status in (BlockStatus.QUEUED, BlockStatus.PENDING):
                block_inst.status = BlockStatus.RUNNING
                block_inst.started_at = time.time()
                commands.append(SaveCheckpointCommand())

        elif event.type == "block.completed":
            if block_inst.status == BlockStatus.RUNNING:
                block_inst.status = BlockStatus.GATE_CHECKING
                block_inst.artifacts = event.data.get("artifacts", [])
                block_inst.metrics = event.data.get("metrics", {})
                commands.append(CheckGateCommand(block_id=block_id))
                commands.append(SaveCheckpointCommand())

        elif event.type == "block.gate_passed":
            if block_inst.status == BlockStatus.GATE_CHECKING:
                block_inst.status = BlockStatus.COMPLETED
                block_inst.completed_at = time.time()

                # Find next block via links
                self._compete_commands = []
                next_blocks = self._find_next_blocks(wf, block_id)

                # compete commands 추가
                for cc in self._compete_commands:
                    commands.append(cc)

                if next_blocks:
                    for next_id in next_blocks:
                        next_block = wf.blocks[next_id]
                        next_block.status = BlockStatus.QUEUED
                        wf.current_block_id = next_id
                        commands.append(StartBlockCommand(
                            block_id=next_id,
                            adapter=next_block.adapter,
                        ))
                elif not self._compete_commands:
                    # Check if all blocks completed
                    if self._all_blocks_completed(wf):
                        wf.status = WorkflowStatus.COMPLETED
                        commands.append(EmitEventCommand(
                            event=Event(type="workflow.completed", data={"workflow_id": wf.id}),
                        ))
                commands.append(SaveCheckpointCommand())

        elif event.type == "block.gate_failed":
            gate_config = block_inst.block.gate
            on_fail = gate_config.on_fail if gate_config else "fail"
            max_retries = gate_config.max_retries if gate_config else 0

            if on_fail == "retry" and block_inst.retry_count < max_retries:
                block_inst.retry_count += 1
                block_inst.status = BlockStatus.RUNNING
                commands.append(StartBlockCommand(
                    block_id=block_id,
                    adapter=block_inst.adapter,
                ))
            elif on_fail == "skip":
                block_inst.status = BlockStatus.COMPLETED
                block_inst.completed_at = time.time()
                next_blocks = self._find_next_blocks(wf, block_id)
                if next_blocks:
                    for next_id in next_blocks:
                        wf.blocks[next_id].status = BlockStatus.QUEUED
                        wf.current_block_id = next_id
                        commands.append(StartBlockCommand(
                            block_id=next_id,
                            adapter=wf.blocks[next_id].adapter,
                        ))
                elif self._all_blocks_completed(wf):
                    wf.status = WorkflowStatus.COMPLETED
            else:
                block_inst.status = BlockStatus.FAILED
                block_inst.error = event.data.get("error", "Gate check failed")
                wf.status = WorkflowStatus.FAILED

            commands.append(SaveCheckpointCommand())

        elif event.type == "block.failed":
            block_inst.status = BlockStatus.FAILED
            block_inst.error = event.data.get("error", "Block execution failed")
            wf.status = WorkflowStatus.FAILED
            commands.append(SaveCheckpointCommand())

        elif event.type == "block.adapter_failed":
            # adapter 실패 재시도 — gate_failed의 retry 패턴 재사용
            block_config = block_inst.block
            max_retries = block_config.adapter_max_retries if hasattr(block_config, 'adapter_max_retries') else 3

            if block_inst.retry_count < max_retries:
                block_inst.retry_count += 1
                block_inst.status = BlockStatus.QUEUED  # QUEUED로 복귀 (RUNNING이 아님)
                block_inst.error = None
                commands.append(RetryAdapterCommand(
                    block_id=block_id,
                    adapter=block_inst.adapter,
                    retry_count=block_inst.retry_count,
                    delay=5 * (3 ** (block_inst.retry_count - 1)),  # 5s, 15s, 45s
                ))
            else:
                # 재시도 소진 → 워크플로우 FAILED + 알림 이벤트
                block_inst.status = BlockStatus.FAILED
                block_inst.error = f"Adapter 재시도 {max_retries}회 소진: {event.data.get('error', '')}"
                wf.status = WorkflowStatus.FAILED
                commands.append(NotifyCommand(
                    type="adapter_exhausted",
                    data={
                        "workflow_id": wf.id,
                        "block_id": block_id,
                        "adapter": block_inst.adapter,
                        "retries": max_retries,
                        "error": block_inst.error,
                    }
                ))

            commands.append(SaveCheckpointCommand())

        return wf, commands

    def _find_next_blocks(
        self, wf: WorkflowInstance, block_id: str
    ) -> list[str]:
        """link type과 condition을 평가하여 다음 블록 결정."""
        from brick.engine.condition_evaluator import evaluate_condition

        next_ids = []
        context = wf.context

        for link in wf.definition.links:
            if link.from_block != block_id:
                continue

            if link.type == "sequential":
                next_ids.append(link.to_block)

            elif link.type == "loop":
                if evaluate_condition(link.condition, context):
                    loop_key = f"_loop_{block_id}_{link.to_block}"
                    loop_count = context.get(loop_key, 0)
                    max_iter = link.max_retries
                    if loop_count < max_iter:
                        context[loop_key] = loop_count + 1
                        next_ids.append(link.to_block)

            elif link.type == "branch":
                if evaluate_condition(link.condition, context):
                    next_ids.append(link.to_block)

            elif link.type == "parallel":
                next_ids.append(link.to_block)

            elif link.type == "compete":
                if link.teams:
                    # compete: 여러 팀 경쟁 → CompeteStartCommand 발행
                    # _compete_commands에 저장 (호출부에서 처리)
                    if not hasattr(self, '_compete_commands'):
                        self._compete_commands = []
                    self._compete_commands.append(CompeteStartCommand(
                        block_id=link.to_block,
                        teams=link.teams,
                        judge=link.judge or {},
                    ))
                    # next_ids에 추가하지 않음 — CompeteStartCommand가 별도 처리
                else:
                    # teams 미지정 → sequential과 동일 (하위호환)
                    next_ids.append(link.to_block)

            elif link.type == "cron":
                # cron은 즉시 큐잉하지 않음 → 스케줄러에 등록
                if hasattr(self, 'cron_scheduler') and self.cron_scheduler:
                    from brick.engine.cron_scheduler import CronJob
                    to_block = wf.blocks.get(link.to_block)
                    self.cron_scheduler.register(CronJob(
                        workflow_id=wf.id,
                        from_block_id=block_id,
                        to_block_id=link.to_block,
                        adapter=to_block.adapter if to_block else "",
                        schedule=link.schedule or "0 * * * *",  # 기본: 매시간
                        max_runs=link.max_retries or 999,
                    ))
                # next_ids에 추가하지 않음 — 스케줄러가 나중에 큐잉

        return next_ids

    def _all_blocks_completed(self, wf: WorkflowInstance) -> bool:
        return all(
            bi.status == BlockStatus.COMPLETED
            for bi in wf.blocks.values()
        )
