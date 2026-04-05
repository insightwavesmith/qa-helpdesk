"""StateMachine — pure functional state transitions. Zero side effects."""

from __future__ import annotations

import copy
import time
from dataclasses import dataclass, field
from typing import Callable

from brick.models.events import (
    Event, Command, StartBlockCommand, CheckGateCommand,
    EmitEventCommand, SaveCheckpointCommand,
    RetryAdapterCommand, NotifyCommand, CompeteStartCommand,
    WorkflowStatus, BlockStatus,
)
from brick.models.workflow import WorkflowInstance, BlockInstance

# Type alias for link handler functions
LinkHandlerFn = Callable[["LinkDefinition", WorkflowInstance, str, dict], "LinkResolveResult"]


@dataclass
class LinkResolveResult:
    """Result returned by each link handler."""
    next_ids: list[str]
    commands: list[Command]
    context_updates: dict = field(default_factory=dict)


class StateMachine:
    """Pure functional state machine. transition() returns a NEW WorkflowInstance."""

    def __init__(self):
        self._link_handlers: dict[str, LinkHandlerFn] = {}
        self._register_builtins()

    def _register_builtins(self) -> None:
        self.register_link("sequential", self._resolve_sequential)
        self.register_link("loop", self._resolve_loop)
        self.register_link("branch", self._resolve_branch)
        self.register_link("parallel", self._resolve_parallel)
        self.register_link("compete", self._resolve_compete)
        self.register_link("cron", self._resolve_cron)
        self.register_link("hook", self._resolve_hook)

    def register_link(self, type_name: str, handler: LinkHandlerFn) -> None:
        """Register external link handler. Overwrites existing type."""
        self._link_handlers[type_name] = handler

    def registered_link_types(self) -> set[str]:
        """Registered link type names. Used by PresetValidator."""
        return set(self._link_handlers.keys())

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
            if block_inst.status in (BlockStatus.RUNNING, BlockStatus.WAITING_APPROVAL):
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
                next_blocks, extra_commands = self._find_next_blocks(wf, block_id)

                # extra link commands 추가 (compete 등)
                commands.extend(extra_commands)

                if next_blocks:
                    for next_id in next_blocks:
                        next_block = wf.blocks[next_id]
                        next_block.status = BlockStatus.QUEUED
                        wf.current_block_id = next_id
                        commands.append(StartBlockCommand(
                            block_id=next_id,
                            adapter=next_block.adapter,
                        ))
                elif not extra_commands:
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
                next_blocks, extra_commands = self._find_next_blocks(wf, block_id)
                commands.extend(extra_commands)
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
            elif on_fail == "route":
                # 링크의 on_fail 타겟으로 라우팅 (루프백)
                routed = False
                for link in wf.definition.links:
                    if link.from_block == block_id and link.on_fail:
                        target = link.on_fail
                        if target in wf.blocks:
                            target_block = wf.blocks[target]
                            target_block.status = BlockStatus.QUEUED
                            target_block.retry_count = 0
                            wf.current_block_id = target
                            commands.append(StartBlockCommand(
                                block_id=target,
                                adapter=target_block.adapter,
                            ))
                            routed = True
                            break
                if not routed:
                    block_inst.status = BlockStatus.FAILED
                    block_inst.error = event.data.get("error", "Gate check failed")
                    wf.status = WorkflowStatus.FAILED
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
    ) -> tuple[list[str], list[Command]]:
        """link type과 condition을 평가하여 다음 블록 결정."""
        next_ids: list[str] = []
        extra_commands: list[Command] = []
        context = wf.context

        for link in wf.definition.links:
            if link.from_block != block_id:
                continue

            notify = link.notify or {}

            # link.started 이벤트 (notify.on_start 설정 시)
            if notify.get("on_start"):
                extra_commands.append(EmitEventCommand(
                    event=Event(
                        type="link.started",
                        data={
                            "from_block": link.from_block,
                            "to_block": link.to_block,
                            "link_type": link.type,
                            "channel": notify["on_start"],
                        },
                    ),
                ))

            handler = self._link_handlers.get(link.type)
            if handler is None:
                continue  # 미등록 링크 타입 → 무시 (안전)

            result = handler(link, wf, block_id, context)
            next_ids.extend(result.next_ids)
            extra_commands.extend(result.commands)
            context.update(result.context_updates)

            # link.completed 이벤트 (notify.on_complete 설정 시)
            if notify.get("on_complete") and result.next_ids:
                extra_commands.append(EmitEventCommand(
                    event=Event(
                        type="link.completed",
                        data={
                            "from_block": link.from_block,
                            "to_block": link.to_block,
                            "link_type": link.type,
                            "channel": notify["on_complete"],
                        },
                    ),
                ))

        return next_ids, extra_commands

    # ── 빌트인 링크 핸들러 (로직 변경 0) ────────────────────────────────

    def _resolve_sequential(self, link, wf, block_id, context) -> LinkResolveResult:
        return LinkResolveResult(next_ids=[link.to_block], commands=[], context_updates={})

    def _resolve_loop(self, link, wf, block_id, context) -> LinkResolveResult:
        from brick.engine.condition_evaluator import evaluate_condition
        if evaluate_condition(link.condition, context):
            loop_key = f"_loop_{block_id}_{link.to_block}"
            loop_count = context.get(loop_key, 0)
            max_iter = link.max_retries
            if loop_count < max_iter:
                return LinkResolveResult(
                    next_ids=[link.to_block],
                    commands=[],
                    context_updates={loop_key: loop_count + 1},
                )
        return LinkResolveResult(next_ids=[], commands=[], context_updates={})

    def _resolve_branch(self, link, wf, block_id, context) -> LinkResolveResult:
        from brick.engine.condition_evaluator import evaluate_condition
        if evaluate_condition(link.condition, context):
            return LinkResolveResult(next_ids=[link.to_block], commands=[], context_updates={})
        return LinkResolveResult(next_ids=[], commands=[], context_updates={})

    def _resolve_parallel(self, link, wf, block_id, context) -> LinkResolveResult:
        return LinkResolveResult(next_ids=[link.to_block], commands=[], context_updates={})

    def _resolve_compete(self, link, wf, block_id, context) -> LinkResolveResult:
        if link.teams:
            return LinkResolveResult(
                next_ids=[],
                commands=[CompeteStartCommand(
                    block_id=link.to_block,
                    teams=link.teams,
                    judge=link.judge or {},
                )],
                context_updates={},
            )
        # teams 미지정 → sequential과 동일 (하위호환)
        return LinkResolveResult(next_ids=[link.to_block], commands=[], context_updates={})

    def _resolve_cron(self, link, wf, block_id, context) -> LinkResolveResult:
        if hasattr(self, 'cron_scheduler') and self.cron_scheduler:
            from brick.engine.cron_scheduler import CronJob
            to_block = wf.blocks.get(link.to_block)
            self.cron_scheduler.register(CronJob(
                workflow_id=wf.id,
                from_block_id=block_id,
                to_block_id=link.to_block,
                adapter=to_block.adapter if to_block else "",
                schedule=link.schedule or "0 * * * *",
                max_runs=link.max_retries or 999,
            ))
        return LinkResolveResult(next_ids=[], commands=[], context_updates={})

    def _resolve_hook(self, link, wf, block_id, context) -> LinkResolveResult:
        """hook Link: from 블록 완료 후 대기. 외부 API 호출 시 발동."""
        # hook은 _find_next_blocks에서 다음 블록을 반환하지 않음.
        # 외부 트리거가 와야 다음 블록 시작.
        return LinkResolveResult(next_ids=[], commands=[], context_updates={})

    def _all_blocks_completed(self, wf: WorkflowInstance) -> bool:
        return all(
            bi.status == BlockStatus.COMPLETED
            for bi in wf.blocks.values()
        )
