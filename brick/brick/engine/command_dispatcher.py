"""CommandDispatcher — 커맨드 디스패치 (StartBlock, Retry, Compete 등)."""

from __future__ import annotations

import asyncio
from dataclasses import asdict

from brick.engine.compete_manager import CompeteExecution, CompeteGroup
from brick.models.events import (
    BlockStatus,
    Event,
    StartBlockCommand,
    RetryAdapterCommand,
    NotifyCommand,
    CompeteStartCommand,
    EmitEventCommand,
    SaveCheckpointCommand,
)
from brick.models.workflow import WorkflowInstance


class UnknownCommandError(Exception):
    pass


class CommandDispatcher:
    """커맨드 패턴 디스패처. executor에서 분리."""

    def __init__(
        self,
        checkpoint,
        adapter_pool: dict,
        event_bus,
        state_machine,
        block_monitor,
        compete_manager,
        _checkpoint_lock,
    ):
        self.checkpoint = checkpoint
        self.adapter_pool = adapter_pool
        self.event_bus = event_bus
        self.state_machine = state_machine
        self.block_monitor = block_monitor
        self.compete_manager = compete_manager
        self._checkpoint_lock = _checkpoint_lock
        # complete_block_fn은 executor에서 주입 (순환 의존 방지)
        self._complete_block_fn = None
        self._get_previous_team_fn = None
        self._get_previous_block_id_fn = None

    def set_callbacks(self, complete_block_fn, get_previous_team_fn, get_previous_block_id_fn):
        """executor에서 콜백 주입. 순환 의존 방지."""
        self._complete_block_fn = complete_block_fn
        self._get_previous_team_fn = get_previous_team_fn
        self._get_previous_block_id_fn = get_previous_block_id_fn

    async def dispatch(self, instance: WorkflowInstance, cmd) -> WorkflowInstance:
        if isinstance(cmd, StartBlockCommand):
            return await self._handle_start_block(instance, cmd)
        elif isinstance(cmd, RetryAdapterCommand):
            return await self._handle_retry_adapter(instance, cmd)
        elif isinstance(cmd, CompeteStartCommand):
            return await self._handle_compete_start(instance, cmd)
        elif isinstance(cmd, NotifyCommand):
            self.event_bus.publish(Event(type=cmd.type, data=cmd.data))
            self.checkpoint.save(instance.id, instance)
            return instance
        elif isinstance(cmd, EmitEventCommand) and cmd.event:
            self.event_bus.publish(cmd.event)
            return instance
        elif isinstance(cmd, SaveCheckpointCommand):
            self.checkpoint.save(instance.id, instance)
            return instance
        else:
            raise UnknownCommandError(f"Unknown command: {type(cmd).__name__}")

    async def dispatch_all(self, instance: WorkflowInstance, commands: list) -> WorkflowInstance:
        for cmd in commands:
            instance = await self.dispatch(instance, cmd)
        return instance

    async def _handle_start_block(self, instance: WorkflowInstance, cmd: StartBlockCommand) -> WorkflowInstance:
        adapter = self.adapter_pool.get(cmd.adapter)
        if not adapter:
            event = Event(type="block.adapter_failed", data={
                "block_id": cmd.block_id,
                "workflow_id": instance.id,
                "error": f"Adapter '{cmd.adapter}' not found in pool",
            })
            instance, cmds = self.state_machine.transition(instance, event)
            self.checkpoint.save(instance.id, instance)
            await self.dispatch_all(instance, cmds)
            return instance

        block_inst = instance.blocks.get(cmd.block_id)
        if not block_inst:
            return instance

        try:
            team_def = instance.definition.teams.get(cmd.block_id)
            team_config = team_def.config if team_def else {}

            # 축4: team config의 role을 block metadata에 기록
            if team_def and team_def.config.get("role"):
                block_inst.block.metadata["role"] = team_def.config["role"]

            if team_config:
                adapter = adapter.__class__(team_config)

            execution_id = await adapter.start_block(block_inst.block, {
                "workflow_id": instance.id,
                "block_id": cmd.block_id,
                "block_what": block_inst.block.what,
                "block_type": block_inst.block.type,
                "project_context": instance.context,
                "team_config": team_config,
            })
            block_inst.execution_id = execution_id

            event = Event(type="block.started", data={"block_id": cmd.block_id})
            instance, cmds = self.state_machine.transition(instance, event)
            self.checkpoint.save(instance.id, instance)
            self.checkpoint.save_event(instance.id, event)
            self.event_bus.publish(event)
            await self.dispatch_all(instance, cmds)

            # 핸드오프 이벤트
            if self._get_previous_team_fn and self._get_previous_block_id_fn:
                prev_team = self._get_previous_team_fn(instance, cmd.block_id)
                current_team = block_inst.adapter
                if current_team != prev_team and prev_team is not None:
                    self.event_bus.publish(Event(type="block.handoff", data={
                        "workflow_id": instance.id,
                        "from_block": self._get_previous_block_id_fn(instance, cmd.block_id),
                        "to_block": cmd.block_id,
                        "from_team": prev_team,
                        "to_team": current_team,
                    }))

            # 모니터링 시작
            asyncio.create_task(self.block_monitor.monitor(
                instance, cmd.block_id, self.adapter_pool,
                self.state_machine, self.dispatch_all,
                self._complete_block_fn,
            ))

        except Exception as e:
            event = Event(type="block.adapter_failed", data={
                "block_id": cmd.block_id,
                "workflow_id": instance.id,
                "error": str(e),
            })
            instance, cmds = self.state_machine.transition(instance, event)
            self.checkpoint.save(instance.id, instance)
            await self.dispatch_all(instance, cmds)

        return instance

    async def _handle_retry_adapter(self, instance: WorkflowInstance, cmd: RetryAdapterCommand) -> WorkflowInstance:
        await asyncio.sleep(cmd.delay)

        adapter = self.adapter_pool.get(cmd.adapter)
        if not adapter:
            event = Event(type="block.failed", data={
                "block_id": cmd.block_id,
                "error": f"Adapter '{cmd.adapter}' not found in pool",
            })
            instance, cmds = self.state_machine.transition(instance, event)
            await self.dispatch_all(instance, cmds)
            return instance

        block_inst = instance.blocks.get(cmd.block_id)
        if not block_inst:
            return instance

        try:
            team_def = instance.definition.teams.get(cmd.block_id)
            team_config = team_def.config if team_def else {}
            if team_config:
                adapter = adapter.__class__(team_config)

            execution_id = await adapter.start_block(block_inst.block, {
                "workflow_id": instance.id,
                "block_id": cmd.block_id,
                "block_what": block_inst.block.what,
                "block_type": block_inst.block.type,
                "project_context": instance.context,
                "retry_count": cmd.retry_count,
            })
            block_inst.execution_id = execution_id

            event = Event(type="block.started", data={"block_id": cmd.block_id})
            instance, cmds = self.state_machine.transition(instance, event)
            self.checkpoint.save(instance.id, instance)
            await self.dispatch_all(instance, cmds)

            # 모니터링 재시작
            asyncio.create_task(self.block_monitor.monitor(
                instance, cmd.block_id, self.adapter_pool,
                self.state_machine, self.dispatch_all,
                self._complete_block_fn,
            ))

        except Exception as e:
            event = Event(type="block.adapter_failed", data={
                "block_id": cmd.block_id,
                "workflow_id": instance.id,
                "error": str(e),
            })
            instance, cmds = self.state_machine.transition(instance, event)
            self.checkpoint.save(instance.id, instance)
            await self.dispatch_all(instance, cmds)

        return instance

    async def _handle_compete_start(self, instance: WorkflowInstance, cmd: CompeteStartCommand) -> WorkflowInstance:
        block_inst = instance.blocks.get(cmd.block_id)
        if not block_inst:
            return instance

        compete_group = CompeteGroup(
            block_id=cmd.block_id,
            executions=[CompeteExecution(adapter=team) for team in cmd.teams],
        )

        for i, comp_exec in enumerate(compete_group.executions):
            adapter = self.adapter_pool.get(comp_exec.adapter)
            if not adapter:
                comp_exec.status = "failed"
                continue

            try:
                eid = await adapter.start_block(block_inst.block, {
                    "workflow_id": instance.id,
                    "block_id": cmd.block_id,
                    "block_what": block_inst.block.what,
                    "compete_index": i,
                    "compete_total": len(cmd.teams),
                    "project_context": instance.context,
                })
                comp_exec.execution_id = eid
                comp_exec.status = "running"
            except Exception:
                comp_exec.status = "failed"

        block_inst.status = BlockStatus.RUNNING
        block_inst.block.metadata["compete_group"] = asdict(compete_group)
        async with self._checkpoint_lock:
            self.checkpoint.save(instance.id, instance)

        asyncio.create_task(self.compete_manager.monitor_compete(
            instance, cmd.block_id, self.adapter_pool,
            self.state_machine, self.dispatch_all,
            self._complete_block_fn,
        ))

        return instance
