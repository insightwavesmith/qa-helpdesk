"""WorkflowExecutor + PresetLoader — orchestrates workflow lifecycle."""

from __future__ import annotations

import asyncio
import time
from pathlib import Path

import yaml

from brick.engine.checkpoint import CheckpointStore
from brick.engine.cron_scheduler import CronScheduler
from brick.engine.event_bus import EventBus
from brick.engine.preset_validator import PresetValidator
from brick.engine.state_machine import StateMachine
from brick.engine.validator import Validator
from brick.gates.base import GateExecutor
from brick.models.block import Block, DoneCondition, GateHandler, GateConfig
from dataclasses import dataclass, asdict

from brick.models.events import (
    BlockStatus,
    Event,
    StartBlockCommand,
    CheckGateCommand,
    EmitEventCommand,
    SaveCheckpointCommand,
    RetryAdapterCommand,
    NotifyCommand,
    CompeteStartCommand,
    WorkflowStatus,
)


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

        # 축1: {project}/{feature} 변수 치환
        project = data.get("project", "")
        feature = data.get("feature", "")
        if project or feature:
            yaml_str = yaml.dump(inner)
            yaml_str = yaml_str.replace("{project}", project).replace("{feature}", feature)
            inner = yaml.safe_load(yaml_str)

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
                    notify=link.get("notify", {}),
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
            project=project,
            feature=feature,
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
        self.state_machine.cron_scheduler = self.cron_scheduler  # state_machine에 전달
        self._checkpoint_lock = asyncio.Lock()  # parallel 블록 checkpoint 경합 방지

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

        # P1-B2: 프로젝트 컨텍스트 주입 — project.yaml 로딩 + initial_context 병합
        project_context: dict = {}
        project_name = initial_context.get("name", "") if initial_context else ""
        if not project_name:
            project_name = workflow_def.project
        if project_name:
            project_yaml = self._load_project_yaml(project_name)
            if project_yaml:
                project_context = project_yaml
        if initial_context:
            project_context = {**project_context, **initial_context}  # initial_context 우선
        instance.context["project"] = project_context

        event = Event(type="workflow.start")
        instance, commands = self.state_machine.transition(instance, event)

        self.checkpoint.save(instance.id, instance)

        for cmd in commands:
            instance = await self._execute_command(instance, cmd)

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

        # 블록 재큐잉
        async with self._checkpoint_lock:
            block_inst.status = BlockStatus.QUEUED
            block_inst.retry_count = 0
            instance.current_block_id = job.to_block_id
            self.checkpoint.save(instance.id, instance)

        # StartBlockCommand 실행
        await self._execute_command(instance, StartBlockCommand(
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

        # Gate 결과를 context에 반영 (condition 평가용)
        if gate_result.metrics:
            instance.context.update(gate_result.metrics)

        # P1-A1: reject_reason을 context에 주입
        if not gate_result.passed and gate_result.metadata:
            reject_reason = gate_result.metadata.get("reject_reason", "")
            if reject_reason:
                instance.context["reject_reason"] = reject_reason
                instance.context["reject_block_id"] = block_id
                instance.context["reject_count"] = instance.context.get("reject_count", 0) + 1
        # P1-A1: approve 시 reject_reason 제거
        if gate_result.passed and "reject_reason" in instance.context:
            instance.context.pop("reject_reason", None)
            instance.context.pop("reject_block_id", None)
            instance.context.pop("reject_count", None)

        # 축5-d: gate 이벤트에 detail/metadata 추가 + P1-A2: reject_reason/retry 포함
        event_type = "block.gate_passed" if gate_result.passed else "block.gate_failed"
        gate_event_data = {
            "block_id": block_id,
            "workflow_id": workflow_id,
            "gate_detail": gate_result.detail,
            "gate_metadata": gate_result.metadata or {},
        }
        # P1-A2: gate_failed에 reject_reason, retry_count, max_retries 추가
        if not gate_result.passed:
            gate_event_data["reject_reason"] = (
                gate_result.metadata.get("reject_reason", "") if gate_result.metadata else ""
            )
            gate_event_data["retry_count"] = block_inst.retry_count if block_inst else 0
            gate_event_data["max_retries"] = (
                block_inst.block.gate.max_retries if block_inst and block_inst.block.gate else 3
            )
        # P1-A5: project/feature 자동 주입
        gate_event_data = self._enrich_event_data(instance, gate_event_data)
        gate_event = Event(type=event_type, data=gate_event_data)

        instance, commands = self.state_machine.transition(instance, gate_event)
        self.checkpoint.save(workflow_id, instance)
        self.checkpoint.save_event(workflow_id, gate_event)

        # 축5-e: approval pending 이벤트 발행
        if (not gate_result.passed
                and gate_result.metadata
                and gate_result.metadata.get("status") == "waiting"):
            self.event_bus.publish(Event(type="gate.approval_pending", data={
                "block_id": block_id,
                "workflow_id": workflow_id,
                "approver": gate_result.metadata.get("approver", ""),
                "channel": gate_result.metadata.get("channel", ""),
                "artifacts": instance.context.get("done_artifacts", []),
            }))

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
                    "workflow_id": instance.id,
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
                team_def = instance.definition.teams.get(cmd.block_id)
                team_config = team_def.config if team_def else {}

                # 축4: team config의 role을 block metadata에 기록
                if team_def and team_def.config.get("role"):
                    block_inst.block.metadata["role"] = team_def.config["role"]

                # 프리셋 team_config가 있으면 해당 config로 새 어댑터 인스턴스 생성
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
                    "workflow_id": instance.id,
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
                # 프리셋 team_config 반영 (재시도에서도 동일 config 적용)
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
                await self._execute_commands(instance, cmds)

                # 모니터링 재시작
                asyncio.create_task(self._monitor_block(instance, cmd.block_id))

            except Exception as e:
                event = Event(type="block.adapter_failed", data={
                    "block_id": cmd.block_id,
                    "workflow_id": instance.id,
                    "error": str(e),
                })
                instance, cmds = self.state_machine.transition(instance, event)
                self.checkpoint.save(instance.id, instance)
                await self._execute_commands(instance, cmds)

        elif isinstance(cmd, CompeteStartCommand):
            block_inst = instance.blocks.get(cmd.block_id)
            if not block_inst:
                return instance

            # CompeteGroup 생성
            compete_group = CompeteGroup(
                block_id=cmd.block_id,
                executions=[CompeteExecution(adapter=team) for team in cmd.teams],
            )

            # 각 팀으로 블록 시작
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

            # 블록 상태 → RUNNING, compete_group을 metadata에 저장
            block_inst.status = BlockStatus.RUNNING
            block_inst.block.metadata["compete_group"] = asdict(compete_group)
            async with self._checkpoint_lock:
                self.checkpoint.save(instance.id, instance)

            # compete 전용 모니터링 시작
            asyncio.create_task(self._monitor_compete(instance, cmd.block_id))

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
                        "workflow_id": instance.id,
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
                        "workflow_id": instance.id,
                        "error": status.error or "Adapter reported failure",
                        "stderr": getattr(status, "stderr", "") or "",
                        "exit_code": getattr(status, "exit_code", None),
                        "adapter": block_inst.adapter if block_inst else "",
                        "role": block_inst.block.metadata.get("role", "") if block_inst else "",
                    })
                    async with self._checkpoint_lock:
                        instance, cmds = self.state_machine.transition(instance, event)
                        self.checkpoint.save(instance.id, instance)
                    await self._execute_commands(instance, cmds)
                    break

            except Exception:
                pass  # 네트워크 에러 등 — 다음 폴링에서 재시도

    async def _monitor_compete(self, instance: WorkflowInstance, block_id: str):
        """compete 블록 모니터링. 1등 완료 시 나머지 취소."""
        POLL_INTERVAL = 5  # compete는 더 빈번하게

        while True:
            await asyncio.sleep(POLL_INTERVAL)

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

                adapter = self.adapter_pool.get(comp_exec.adapter)
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
                        adapter = self.adapter_pool.get(comp_exec.adapter)
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
                        await self.complete_block(instance.id, block_id)
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
                    instance, cmds = self.state_machine.transition(instance, event)
                    self.checkpoint.save(instance.id, instance)
                await self._execute_commands(instance, cmds)
                break

            # group 상태 저장
            block_inst.block.metadata["compete_group"] = asdict(group)
            async with self._checkpoint_lock:
                self.checkpoint.save(instance.id, instance)

    def _enrich_event_data(self, instance: WorkflowInstance, data: dict) -> dict:
        """P1-A5: 이벤트 data에 project/feature/workflow_id 자동 추가."""
        project_ctx = instance.context.get("project", {})
        data.setdefault("project", project_ctx.get("name", "") if isinstance(project_ctx, dict) else "")
        data.setdefault("feature", instance.feature)
        data.setdefault("workflow_id", instance.id)
        return data

    def _load_project_yaml(self, project_name: str) -> dict | None:
        """P1-B2: brick/projects/{name}/project.yaml 로딩. 없으면 None.

        path traversal 방어: Path.resolve() 기반 화이트리스트.
        """
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
