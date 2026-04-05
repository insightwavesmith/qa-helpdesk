"""WorkflowExecutor — orchestrates workflow lifecycle."""

from __future__ import annotations

import asyncio
from pathlib import Path

import yaml

from brick.engine.block_monitor import BlockMonitor
from brick.engine.checkpoint import CheckpointStore
from brick.engine.command_dispatcher import CommandDispatcher
from brick.engine.compete_manager import CompeteManager
from brick.engine.cron_scheduler import CronScheduler
from brick.engine.event_bus import EventBus
from brick.engine.preset_validator import PresetValidator
from brick.engine.state_machine import StateMachine
from brick.engine.validator import Validator
from brick.gates.base import GateExecutor
from brick.models.events import (
    BlockStatus,
    Event,
    StartBlockCommand,
    WorkflowStatus,
)
from brick.models.workflow import WorkflowDefinition, WorkflowInstance

# 하위 호환: 기존 from brick.engine.executor import PresetLoader/CompeteExecution/CompeteGroup 유지
from brick.engine.preset_loader import PresetLoader  # noqa: F401
from brick.engine.compete_manager import CompeteExecution, CompeteGroup  # noqa: F401


class WorkflowExecutor:
    """Orchestrates workflow lifecycle: start, complete, resume."""

    def __init__(
        self,
        state_machine: StateMachine,
        event_bus: EventBus,
        checkpoint: CheckpointStore,
        gate_executor: GateExecutor,
        adapter_pool: dict | None = None,
        preset_loader: PresetLoader | None = None,
        validator: Validator | None = None,
        cron_scheduler: CronScheduler | None = None,
    ):
        self.state_machine = state_machine
        self.event_bus = event_bus
        self.checkpoint = checkpoint
        self.gate_executor = gate_executor
        self.adapter_pool = adapter_pool or {}
        self.preset_loader = preset_loader
        self.validator = validator
        self.cron_scheduler = cron_scheduler or CronScheduler()
        self.state_machine.cron_scheduler = self.cron_scheduler
        self._checkpoint_lock = asyncio.Lock()

        # 분리된 모듈 초기화
        self._block_monitor = BlockMonitor(
            checkpoint=self.checkpoint,
            event_bus=self.event_bus,
            _checkpoint_lock=self._checkpoint_lock,
        )
        self._compete_manager = CompeteManager(
            checkpoint=self.checkpoint,
            event_bus=self.event_bus,
            _checkpoint_lock=self._checkpoint_lock,
        )
        self._command_dispatcher = CommandDispatcher(
            checkpoint=self.checkpoint,
            adapter_pool=self.adapter_pool,
            event_bus=self.event_bus,
            state_machine=self.state_machine,
            block_monitor=self._block_monitor,
            compete_manager=self._compete_manager,
            _checkpoint_lock=self._checkpoint_lock,
        )
        self._command_dispatcher.set_callbacks(
            complete_block_fn=self.complete_block,
            get_previous_team_fn=self._get_previous_team,
            get_previous_block_id_fn=self._get_previous_block_id,
        )

    async def start(self, preset_name: str, feature: str, task: str, initial_context: dict | None = None) -> str:
        if not self.preset_loader:
            raise ValueError("No preset loader configured")

        workflow_def = self.preset_loader.load(preset_name)

        # 프리셋 스키마 검증
        preset_validator = PresetValidator()
        validation_errors = preset_validator.validate(workflow_def)
        real_errors = [e for e in validation_errors if e.severity == "error"]
        if real_errors:
            error_msg = "; ".join(f"{e.field}: {e.message}" for e in real_errors)
            raise ValueError(f"프리셋 검증 실패: {error_msg}")

        warnings = [e for e in validation_errors if e.severity == "warning"]
        for w in warnings:
            self.event_bus.publish(Event(type="preset.validation_warning", data={
                "field": w.field, "message": w.message,
            }))

        if self.validator:
            errors = self.validator.validate_workflow(workflow_def)
            if errors:
                raise ValueError(f"Validation errors: {errors}")

        instance = WorkflowInstance.from_definition(workflow_def, feature, task)

        # P1-B2: 프로젝트 컨텍스트 주입
        project_context: dict = {}
        project_name = initial_context.get("name", "") if initial_context else ""
        if not project_name:
            project_name = workflow_def.project
        if project_name:
            project_yaml = self._load_project_yaml(project_name)
            if project_yaml:
                project_context = project_yaml
        if initial_context:
            project_context = {**project_context, **initial_context}
        instance.context["project"] = project_context

        event = Event(type="workflow.start")
        instance, commands = self.state_machine.transition(instance, event)

        self.checkpoint.save(instance.id, instance)

        for cmd in commands:
            instance = await self._command_dispatcher.dispatch(instance, cmd)

        # cron 스케줄러 시작
        self.cron_scheduler.start(emit_callback=self._cron_emit)

        return instance.id

    async def _cron_emit(self, job) -> None:
        """cron 트리거 시 블록 큐잉."""
        instance = self.checkpoint.load(job.workflow_id)
        if not instance or instance.status != WorkflowStatus.RUNNING:
            self.cron_scheduler.unregister_workflow(job.workflow_id)
            return

        block_inst = instance.blocks.get(job.to_block_id)
        if not block_inst:
            return

        async with self._checkpoint_lock:
            block_inst.status = BlockStatus.QUEUED
            block_inst.retry_count = 0
            instance.current_block_id = job.to_block_id
            self.checkpoint.save(instance.id, instance)

        await self._command_dispatcher.dispatch(instance, StartBlockCommand(
            block_id=job.to_block_id,
            adapter=job.adapter,
        ))

    async def complete_block(self, workflow_id: str, block_id: str):
        instance = self.checkpoint.load(workflow_id)
        if not instance:
            raise ValueError(f"Workflow {workflow_id} not found")

        block_inst = instance.blocks.get(block_id)
        if not block_inst:
            raise ValueError(f"Block {block_id} not found")

        # 축5-f: done.artifacts → context["done_artifacts"]
        if block_inst and block_inst.block.done.artifacts:
            instance.context["done_artifacts"] = block_inst.block.done.artifacts

        # QUEUED/PENDING 상태에서 complete 호출 시 먼저 block.started 전이
        if block_inst.status in (BlockStatus.QUEUED, BlockStatus.PENDING):
            started_event = Event(
                type="block.started",
                data={"block_id": block_id},
            )
            instance, _ = self.state_machine.transition(instance, started_event)
            self.checkpoint.save(workflow_id, instance)
            self.checkpoint.save_event(workflow_id, started_event)
            self.event_bus.publish(started_event)
            block_inst = instance.blocks.get(block_id)

        # block.completed 이벤트 발행 → RUNNING→GATE_CHECKING 전이
        completed_event = Event(
            type="block.completed",
            data={"block_id": block_id},
        )
        instance, _cmds = self.state_machine.transition(instance, completed_event)
        self.checkpoint.save(workflow_id, instance)
        self.checkpoint.save_event(workflow_id, completed_event)
        self.event_bus.publish(completed_event)

        # GATE_CHECKING 상태에서 Gate 실행
        gate_result = await self.gate_executor.run_gates(block_inst, instance.context)

        # Gate 결과를 context에 반영
        if gate_result.metrics:
            instance.context.update(gate_result.metrics)

        # P1-A1: reject_reason을 context에 주입
        if not gate_result.passed and gate_result.metadata:
            reject_reason = gate_result.metadata.get("reject_reason", "")
            if reject_reason:
                instance.context["reject_reason"] = reject_reason
                instance.context["reject_block_id"] = block_id
                instance.context["reject_count"] = instance.context.get("reject_count", 0) + 1
        if gate_result.passed and "reject_reason" in instance.context:
            instance.context.pop("reject_reason", None)
            instance.context.pop("reject_block_id", None)
            instance.context.pop("reject_count", None)

        # BRK-QA-003: approval waiting → WAITING_APPROVAL 상태 전환
        if (not gate_result.passed
                and gate_result.metadata
                and gate_result.metadata.get("status") == "waiting"):
            current_block = instance.blocks.get(block_id)
            if current_block:
                current_block.status = BlockStatus.WAITING_APPROVAL

            gate_event_data = self._enrich_event_data(instance, {
                "block_id": block_id,
                "workflow_id": workflow_id,
                "gate_detail": gate_result.detail,
                "gate_metadata": gate_result.metadata or {},
            })
            gate_event = Event(type="block.gate_failed", data=gate_event_data)
            self.checkpoint.save(workflow_id, instance)
            self.checkpoint.save_event(workflow_id, gate_event)
            self.event_bus.publish(gate_event)

            self.event_bus.publish(Event(type="gate.approval_pending", data={
                "block_id": block_id,
                "workflow_id": workflow_id,
                "approver": gate_result.metadata.get("approver", ""),
                "channel": gate_result.metadata.get("channel", ""),
                "artifacts": instance.context.get("done_artifacts", []),
            }))

            return gate_result

        # 축5-d: gate 이벤트에 detail/metadata 추가
        event_type = "block.gate_passed" if gate_result.passed else "block.gate_failed"
        gate_event_data = {
            "block_id": block_id,
            "workflow_id": workflow_id,
            "gate_detail": gate_result.detail,
            "gate_metadata": gate_result.metadata or {},
        }
        if not gate_result.passed:
            gate_event_data["reject_reason"] = (
                gate_result.metadata.get("reject_reason", "") if gate_result.metadata else ""
            )
            gate_event_data["retry_count"] = block_inst.retry_count if block_inst else 0
            gate_event_data["max_retries"] = (
                block_inst.block.gate.max_retries if block_inst and block_inst.block.gate else 3
            )
        gate_event_data = self._enrich_event_data(instance, gate_event_data)
        gate_event = Event(type=event_type, data=gate_event_data)

        instance, commands = self.state_machine.transition(instance, gate_event)
        self.checkpoint.save(workflow_id, instance)
        self.checkpoint.save_event(workflow_id, gate_event)
        self.event_bus.publish(gate_event)

        for cmd in commands:
            instance = await self._command_dispatcher.dispatch(instance, cmd)

        return gate_result

    async def resume(self, workflow_id: str) -> WorkflowInstance | None:
        instance = self.checkpoint.load(workflow_id)
        if not instance:
            raise ValueError(f"Workflow {workflow_id} not found")

        current = instance.get_current_block()
        if current and current.status == BlockStatus.RUNNING:
            adapter = self.adapter_pool.get(current.adapter)
            if adapter:
                status = await adapter.check_status(current.execution_id or "")
                if status.status == "completed":
                    await self.complete_block(workflow_id, current.block.id)
                    instance = self.checkpoint.load(workflow_id)

        return instance

    # --- Public API (#16) ---

    async def resume_monitoring(self, workflow_id: str, block_id: str):
        """블록 모니터링 재개."""
        instance = self.checkpoint.load(workflow_id)
        if not instance:
            raise ValueError(f"Workflow {workflow_id} not found")
        await self._block_monitor.monitor(
            instance, block_id, self.adapter_pool,
            self.state_machine, self._command_dispatcher.dispatch_all,
            self.complete_block,
        )

    async def retry_block(self, workflow_id: str, block_id: str):
        """블록 수동 재시도."""
        instance = self.checkpoint.load(workflow_id)
        if not instance:
            raise ValueError(f"Workflow {workflow_id} not found")
        block_inst = instance.blocks.get(block_id)
        if not block_inst:
            raise ValueError(f"Block {block_id} not found")
        # block.adapter_failed 이벤트로 재시도 트리거
        event = Event(type="block.adapter_failed", data={
            "block_id": block_id,
            "workflow_id": workflow_id,
            "error": "Manual retry requested",
        })
        instance, cmds = self.state_machine.transition(instance, event)
        self.checkpoint.save(workflow_id, instance)
        for cmd in cmds:
            instance = await self._command_dispatcher.dispatch(instance, cmd)

    async def trigger_hook(self, workflow_id: str, hook_name: str):
        """외부 훅 트리거."""
        instance = self.checkpoint.load(workflow_id)
        if not instance:
            raise ValueError(f"Workflow {workflow_id} not found")
        self.event_bus.publish(Event(type=f"hook.{hook_name}", data={
            "workflow_id": workflow_id,
        }))

    # --- 하위 호환 래퍼 (기존 테스트에서 직접 호출) ---

    async def _execute_command(self, instance: WorkflowInstance, cmd) -> WorkflowInstance:
        """CommandDispatcher로 위임. 하위 호환."""
        return await self._command_dispatcher.dispatch(instance, cmd)

    async def _execute_commands(self, instance: WorkflowInstance, commands: list) -> WorkflowInstance:
        """CommandDispatcher로 위임. 하위 호환."""
        return await self._command_dispatcher.dispatch_all(instance, commands)

    async def _monitor_block(self, instance: WorkflowInstance, block_id: str):
        """BlockMonitor로 위임. 하위 호환."""
        await self._block_monitor.monitor(
            instance, block_id, self.adapter_pool,
            self.state_machine, self._command_dispatcher.dispatch_all,
            self.complete_block,
        )

    async def _monitor_compete(self, instance: WorkflowInstance, block_id: str):
        """CompeteManager로 위임. 하위 호환."""
        await self._compete_manager.monitor_compete(
            instance, block_id, self.adapter_pool,
            self.state_machine, self._command_dispatcher.dispatch_all,
            self.complete_block,
        )

    # --- Private helpers ---

    def _enrich_event_data(self, instance: WorkflowInstance, data: dict) -> dict:
        """P1-A5: 이벤트 data에 project/feature/workflow_id 자동 추가."""
        project_ctx = instance.context.get("project", {})
        data.setdefault("project", project_ctx.get("name", "") if isinstance(project_ctx, dict) else "")
        data.setdefault("feature", instance.feature)
        data.setdefault("workflow_id", instance.id)
        return data

    def _load_project_yaml(self, project_name: str) -> dict | None:
        """P1-B2: brick/projects/{name}/project.yaml 로딩."""
        candidates = [
            Path("brick/projects"),
            Path("projects"),
        ]
        for base in candidates:
            safe_base = base.resolve()
            candidate = (base / project_name / "project.yaml").resolve()
            if not str(candidate).startswith(str(safe_base)):
                return None
            if candidate.exists():
                try:
                    return yaml.safe_load(candidate.read_text()) or {}
                except Exception:
                    return None
        return None

    def _get_previous_block_id(self, instance: WorkflowInstance, current_block_id: str) -> str | None:
        """링크를 역추적하여 이전 블록 ID 반환."""
        for link in instance.definition.links:
            if link.to_block == current_block_id:
                return link.from_block
        return None

    def _get_previous_team(self, instance: WorkflowInstance, current_block_id: str) -> str | None:
        prev_id = self._get_previous_block_id(instance, current_block_id)
        if prev_id and prev_id in instance.blocks:
            return instance.blocks[prev_id].adapter
        return None
