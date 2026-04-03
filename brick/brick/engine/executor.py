"""WorkflowExecutor + PresetLoader — orchestrates workflow lifecycle."""

from __future__ import annotations

import asyncio
import time
from pathlib import Path

import yaml

from brick.engine.checkpoint import CheckpointStore
from brick.engine.event_bus import EventBus
from brick.engine.state_machine import StateMachine
from brick.engine.validator import Validator
from brick.gates.base import GateExecutor
from brick.models.block import Block, DoneCondition, GateHandler, GateConfig
from brick.models.events import (
    BlockStatus,
    Event,
    StartBlockCommand,
    CheckGateCommand,
    EmitEventCommand,
    SaveCheckpointCommand,
    RetryAdapterCommand,
    NotifyCommand,
)
from brick.models.link import LinkDefinition
from brick.models.team import TeamDefinition
from brick.models.workflow import WorkflowDefinition, WorkflowInstance


class PresetLoader:
    """Load and parse YAML preset files into WorkflowDefinition."""

    def __init__(self, presets_dir: Path):
        self.presets_dir = presets_dir

    def load(self, name: str) -> WorkflowDefinition:
        path = self.presets_dir / f"{name}.yaml"
        if not path.exists():
            raise FileNotFoundError(f"Preset {name} not found at {path}")
        data = yaml.safe_load(path.read_text())
        defn = self._parse_preset(data)
        # Handle extends
        if data.get("extends"):
            base = self.load(data["extends"])
            defn = self._merge(base, defn, data.get("overrides", {}))
        return defn

    def _parse_preset(self, data: dict) -> WorkflowDefinition:
        # Spec wrapper detection: kind+spec -> read content from spec
        if "kind" in data and "spec" in data:
            inner = data["spec"]
        else:
            inner = data

        blocks = []
        for b in inner.get("blocks", []):
            done_data = b.get("done", {})
            gate_config = None
            gate_data = b.get("gate")
            if gate_data:
                handlers = []
                for h in gate_data.get("handlers", []):
                    approval_data = h.get("approval")
                    approval_config = None
                    if approval_data:
                        from brick.models.block import ApprovalConfig
                        approval_config = ApprovalConfig(
                            approver=approval_data.get("approver", ""),
                            channel=approval_data.get("channel", "slack"),
                            slack_channel=approval_data.get("slack_channel", "C0AN7ATS4DD"),
                            dashboard_url=approval_data.get("dashboard_url", ""),
                            timeout_seconds=approval_data.get("timeout_seconds", 86400),
                            on_timeout=approval_data.get("on_timeout", "escalate"),
                            reminder_interval=approval_data.get("reminder_interval", 3600),
                            max_reminders=approval_data.get("max_reminders", 3),
                            context_artifacts=approval_data.get("context_artifacts", []),
                        )
                    handlers.append(GateHandler(
                        type=h["type"],
                        command=h.get("command"),
                        url=h.get("url"),
                        headers=h.get("headers"),
                        prompt=h.get("prompt"),
                        model=h.get("model"),
                        agent_prompt=h.get("agent_prompt"),
                        timeout=h.get("timeout", 30),
                        on_fail=h.get("on_fail", "fail"),
                        confidence_threshold=h.get("confidence_threshold", 0.8),
                        retries=h.get("retries", 1),
                        metric=h.get("metric"),
                        threshold=h.get("threshold"),
                        approval=approval_config,
                    ))
                gate_config = GateConfig(
                    handlers=handlers,
                    evaluation=gate_data.get("evaluation", "sequential"),
                    on_fail=gate_data.get("on_fail", "retry"),
                    max_retries=gate_data.get("max_retries", 3),
                )

            blocks.append(
                Block(
                    id=b["id"],
                    what=b.get("what", ""),
                    done=DoneCondition(
                        artifacts=done_data.get("artifacts", []),
                        metrics=done_data.get("metrics", {}),
                        custom=done_data.get("custom", []),
                    ),
                    type=b.get("type", "Custom"),
                    description=b.get("description", ""),
                    gate=gate_config,
                )
            )
        links = []
        for link in inner.get("links", []):
            links.append(
                LinkDefinition(
                    from_block=link["from"],
                    to_block=link["to"],
                    type=link.get("type", "sequential"),
                    condition=link.get("condition", {}),
                    max_retries=link.get("max_retries", 3),
                    merge_strategy=link.get("merge_strategy", "all"),
                    schedule=link.get("schedule", ""),
                    branches=link.get("branches", []),
                    on_fail=link.get("on_fail"),
                )
            )
        teams: dict[str, TeamDefinition] = {}
        for block_id, team_data in inner.get("teams", {}).items():
            if team_data is None:
                continue
            if isinstance(team_data, str):
                teams[block_id] = TeamDefinition(
                    block_id=block_id,
                    adapter=team_data,
                    config={},
                )
            else:
                teams[block_id] = TeamDefinition(
                    block_id=block_id,
                    adapter=team_data.get("team", team_data.get("adapter", "human")),
                    config=team_data.get("config", team_data.get("override", {})),
                )

        # Level: root > labels.level (e.g. "l2" -> 2) > inner > default(2)
        level = data.get("level")
        if level is None:
            labels = data.get("labels", {})
            level_label = labels.get("level", "")
            if isinstance(level_label, str) and level_label.startswith("l"):
                try:
                    level = int(level_label[1:])
                except ValueError:
                    level = inner.get("level", 2)
            else:
                level = inner.get("level", 2)

        return WorkflowDefinition(
            name=data.get("name", ""),
            description=data.get("description", ""),
            blocks=blocks,
            links=links,
            teams=teams,
            schema=data.get("$schema", "brick/preset-v2"),
            extends=data.get("extends"),
            overrides=data.get("overrides", {}),
            level=level,
        )

    def _merge(
        self,
        base: WorkflowDefinition,
        child: WorkflowDefinition,
        overrides: dict,
    ) -> WorkflowDefinition:
        """Merge child onto base, applying overrides."""
        # Child blocks override base blocks by id
        block_map = {b.id: b for b in base.blocks}
        for b in child.blocks:
            block_map[b.id] = b
        merged_blocks = list(block_map.values())

        # Child links replace base links
        merged_links = child.links if child.links else base.links

        # Teams merge
        merged_teams = {**base.teams, **child.teams}

        # Apply overrides to specific blocks
        for block_id, block_overrides in overrides.items():
            if block_id in block_map:
                block = block_map[block_id]
                if "what" in block_overrides:
                    block.what = block_overrides["what"]

        return WorkflowDefinition(
            name=child.name or base.name,
            description=child.description or base.description,
            blocks=merged_blocks,
            links=merged_links,
            teams=merged_teams,
            schema=child.schema,
            level=child.level if child.level != 2 else base.level,
        )


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
    ):
        self.state_machine = state_machine
        self.event_bus = event_bus
        self.checkpoint = checkpoint
        self.gate_executor = gate_executor
        self.adapter_pool = adapter_pool or {}
        self.preset_loader = preset_loader
        self.validator = validator
        self._checkpoint_lock = asyncio.Lock()  # parallel 블록 checkpoint 경합 방지

    async def start(self, preset_name: str, feature: str, task: str, initial_context: dict | None = None) -> str:
        if not self.preset_loader:
            raise ValueError("No preset loader configured")

        workflow_def = self.preset_loader.load(preset_name)

        if self.validator:
            errors = self.validator.validate_workflow(workflow_def)
            if errors:
                raise ValueError(f"Validation errors: {errors}")

        instance = WorkflowInstance.from_definition(workflow_def, feature, task)

        # 프로젝트 컨텍스트 주입 (신규) — project 키 아래 네임스페이스로 병합
        if initial_context:
            instance.context["project"] = initial_context

        event = Event(type="workflow.start")
        instance, commands = self.state_machine.transition(instance, event)

        self.checkpoint.save(instance.id, instance)

        for cmd in commands:
            instance = await self._execute_command(instance, cmd)

        return instance.id

    async def complete_block(self, workflow_id: str, block_id: str):
        instance = self.checkpoint.load(workflow_id)
        if not instance:
            raise ValueError(f"Workflow {workflow_id} not found")

        block_inst = instance.blocks.get(block_id)
        if not block_inst:
            raise ValueError(f"Block {block_id} not found")

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

        # Gate 결과를 context에 반영 (condition 평가용)
        if gate_result.metrics:
            instance.context.update(gate_result.metrics)

        event_type = "block.gate_passed" if gate_result.passed else "block.gate_failed"
        gate_event = Event(type=event_type, data={"block_id": block_id})

        instance, commands = self.state_machine.transition(instance, gate_event)
        self.checkpoint.save(workflow_id, instance)
        self.checkpoint.save_event(workflow_id, gate_event)

        for cmd in commands:
            instance = await self._execute_command(instance, cmd)

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

    async def _execute_command(
        self, instance: WorkflowInstance, cmd
    ) -> WorkflowInstance:
        if isinstance(cmd, StartBlockCommand):
            adapter = self.adapter_pool.get(cmd.adapter)
            if not adapter:
                # adapter 없음 → 즉시 adapter_failed
                event = Event(type="block.adapter_failed", data={
                    "block_id": cmd.block_id,
                    "error": f"Adapter '{cmd.adapter}' not found in pool",
                })
                instance, cmds = self.state_machine.transition(instance, event)
                self.checkpoint.save(instance.id, instance)
                await self._execute_commands(instance, cmds)
                return instance

            block_inst = instance.blocks.get(cmd.block_id)
            if not block_inst:
                return instance

            try:
                execution_id = await adapter.start_block(block_inst.block, {
                    "workflow_id": instance.id,
                    "block_id": cmd.block_id,
                    "block_what": block_inst.block.what,
                    "block_type": block_inst.block.type,
                    "project_context": instance.context,
                })
                block_inst.execution_id = execution_id

                event = Event(type="block.started", data={"block_id": cmd.block_id})
                instance, cmds = self.state_machine.transition(instance, event)
                self.checkpoint.save(instance.id, instance)
                self.checkpoint.save_event(instance.id, event)
                self.event_bus.publish(event)
                await self._execute_commands(instance, cmds)

                # 핸드오프 이벤트: 팀(adapter) 전환 감지
                prev_team = self._get_previous_team(instance, cmd.block_id)
                current_team = block_inst.adapter
                if current_team != prev_team and prev_team is not None:
                    self.event_bus.publish(Event(type="block.handoff", data={
                        "workflow_id": instance.id,
                        "from_block": self._get_previous_block_id(instance, cmd.block_id),
                        "to_block": cmd.block_id,
                        "from_team": prev_team,
                        "to_team": current_team,
                    }))

                # 모니터링 시작
                asyncio.create_task(self._monitor_block(instance, cmd.block_id))

            except Exception as e:
                event = Event(type="block.adapter_failed", data={
                    "block_id": cmd.block_id,
                    "error": str(e),
                })
                instance, cmds = self.state_machine.transition(instance, event)
                self.checkpoint.save(instance.id, instance)
                await self._execute_commands(instance, cmds)

        elif isinstance(cmd, RetryAdapterCommand):
            # 지수 백오프 대기
            await asyncio.sleep(cmd.delay)

            adapter = self.adapter_pool.get(cmd.adapter)
            if not adapter:
                # adapter 자체가 없으면 재시도 무의미
                event = Event(type="block.failed", data={
                    "block_id": cmd.block_id,
                    "error": f"Adapter '{cmd.adapter}' not found in pool",
                })
                instance, cmds = self.state_machine.transition(instance, event)
                await self._execute_commands(instance, cmds)
                return instance

            block_inst = instance.blocks.get(cmd.block_id)
            if not block_inst:
                return instance

            try:
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
                await self._execute_commands(instance, cmds)

                # 모니터링 재시작
                asyncio.create_task(self._monitor_block(instance, cmd.block_id))

            except Exception as e:
                event = Event(type="block.adapter_failed", data={
                    "block_id": cmd.block_id,
                    "error": str(e),
                })
                instance, cmds = self.state_machine.transition(instance, event)
                self.checkpoint.save(instance.id, instance)
                await self._execute_commands(instance, cmds)

        elif isinstance(cmd, NotifyCommand):
            self.event_bus.publish(Event(type=cmd.type, data=cmd.data))
            self.checkpoint.save(instance.id, instance)

        elif isinstance(cmd, EmitEventCommand) and cmd.event:
            self.event_bus.publish(cmd.event)
        elif isinstance(cmd, SaveCheckpointCommand):
            self.checkpoint.save(instance.id, instance)
        return instance

    async def _execute_commands(
        self, instance: WorkflowInstance, commands: list
    ) -> WorkflowInstance:
        for cmd in commands:
            instance = await self._execute_command(instance, cmd)
        return instance

    async def _monitor_block(self, instance: WorkflowInstance, block_id: str):
        """어댑터 완료 폴링. 10초 간격. staleness 감지 + 실패 처리."""
        POLL_INTERVAL = 10
        STALE_THRESHOLD = 300       # 5분 — 경고 이벤트
        STALE_HARD_TIMEOUT = 600    # 10분 — adapter_failed 발행 → 재시도 진입

        last_change_time = time.time()
        last_status = None

        while True:
            await asyncio.sleep(POLL_INTERVAL)

            # 최신 인스턴스 로드
            instance = self.checkpoint.load(instance.id)
            if not instance:
                break
            block_inst = instance.blocks.get(block_id)
            if not block_inst or block_inst.status != BlockStatus.RUNNING:
                break
            if not block_inst.execution_id:
                break

            adapter = self.adapter_pool.get(block_inst.adapter)
            if not adapter:
                break

            try:
                status = await adapter.check_status(block_inst.execution_id)

                # staleness 감지
                if status.status != last_status:
                    last_status = status.status
                    last_change_time = time.time()
                elif time.time() - last_change_time > STALE_THRESHOLD:
                    # 5분 경고
                    self.event_bus.publish(Event(type="block.stale", data={
                        "workflow_id": instance.id,
                        "block_id": block_id,
                        "last_status": last_status,
                        "stale_seconds": int(time.time() - last_change_time),
                    }))

                # 10분 초과 → adapter_failed로 재시도 태움 (경고만 하고 끝내기 금지)
                if time.time() - last_change_time > STALE_HARD_TIMEOUT:
                    event = Event(type="block.adapter_failed", data={
                        "block_id": block_id,
                        "error": f"Stale 타임아웃: {int(time.time() - last_change_time)}초 간 상태 변화 없음",
                    })
                    async with self._checkpoint_lock:
                        instance, cmds = self.state_machine.transition(instance, event)
                        self.checkpoint.save(instance.id, instance)
                    await self._execute_commands(instance, cmds)
                    break

                if status.status == "completed":
                    try:
                        # checkpoint 경합 방지 — Lock 내에서 complete_block
                        async with self._checkpoint_lock:
                            await self.complete_block(
                                instance.id,
                                block_id,
                            )
                    except Exception as e:
                        # complete_block 실패 (gate 실패 등) → 로그만
                        self.event_bus.publish(Event(type="block.monitor_error", data={
                            "workflow_id": instance.id,
                            "block_id": block_id,
                            "error": str(e),
                        }))
                    break

                elif status.status == "failed":
                    event = Event(type="block.adapter_failed", data={
                        "block_id": block_id,
                        "error": status.error or "Adapter reported failure",
                    })
                    async with self._checkpoint_lock:
                        instance, cmds = self.state_machine.transition(instance, event)
                        self.checkpoint.save(instance.id, instance)
                    await self._execute_commands(instance, cmds)
                    break

            except Exception:
                pass  # 네트워크 에러 등 — 다음 폴링에서 재시도

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
