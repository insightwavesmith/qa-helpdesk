"""Engine Bootstrap — 모든 컴포넌트 조립 + 초기화. EngineContainer 반환."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from brick.adapters.claude_agent_teams import ClaudeAgentTeamsAdapter
from brick.adapters.claude_code import ClaudeCodeAdapter
from brick.adapters.claude_local import ClaudeLocalAdapter
from brick.adapters.human import HumanAdapter
from brick.adapters.webhook import WebhookAdapter
from brick.engine.checkpoint import CheckpointStore
from brick.engine.container import AdapterRegistry, EngineContainer
from brick.engine.event_bus import EventBus
from brick.engine.executor import PresetLoader, WorkflowExecutor
from brick.engine.preset_validator import PresetValidator
from brick.engine.slack_subscriber import SlackSubscriber
from brick.engine.state_machine import StateMachine
from brick.engine.validator import Validator
from brick.gates.concrete import ConcreteGateExecutor
from brick.models.events import BlockStatus, Event

logger = logging.getLogger(__name__)


async def _auto_recover_workflows(container: EngineContainer) -> None:
    """서버 재시작 후 RUNNING 상태 워크플로우 자동 모니터링 재개."""
    active_ids = container.checkpoint_store.list_active()
    logger.info("auto-recover: %d active workflow(s) found", len(active_ids))
    for wf_id in active_ids:
        instance = container.checkpoint_store.load(wf_id)
        if not instance:
            continue
        for block_id, bi in instance.blocks.items():
            if bi.status == BlockStatus.RUNNING and bi.execution_id:
                logger.info("auto-recover: resume monitoring %s/%s", wf_id, block_id)
                asyncio.create_task(
                    container.executor._monitor_block(instance, block_id)
                )


def init_engine(root: str = "brick/") -> EngineContainer:
    """모든 엔진 컴포넌트 생성 + 조립. EngineContainer 반환."""
    root_path = Path(root)
    sm = StateMachine()
    eb = EventBus()
    cs = CheckpointStore(base_dir=root_path / "runtime" / "workflows")
    ge = ConcreteGateExecutor()
    ge._event_bus = eb  # gate.pending 이벤트 발행용
    val = Validator()
    pl = PresetLoader(presets_dir=root_path / "presets")

    adapter_pool = AdapterRegistry()
    adapter_pool.register("claude_agent_teams", ClaudeAgentTeamsAdapter({}))
    adapter_pool.register("claude_code", ClaudeCodeAdapter({}))

    claude_local = ClaudeLocalAdapter({})
    claude_local._event_bus = eb  # EventBus 주입 — 순환 의존 제거
    adapter_pool.register("claude_local", claude_local)

    adapter_pool.register("webhook", WebhookAdapter({}))
    adapter_pool.register("human", HumanAdapter({}))

    PresetValidator(
        gate_types=ge.registered_gate_types(),
        link_types=sm.registered_link_types(),
        adapter_types=adapter_pool.registered_adapter_types(),
    )

    we = WorkflowExecutor(
        state_machine=sm,
        event_bus=eb,
        checkpoint=cs,
        gate_executor=ge,
        preset_loader=pl,
        validator=val,
        adapter_pool=adapter_pool,
    )

    # Slack Subscriber — EventBus 구독 (agent-ops 채널 알림)
    SlackSubscriber(event_bus=eb, level="basic")

    # SkyOffice Bridge — EventBus 구독 (Phase 3: 에이전트 상태 동기화)
    from brick.integrations.skyoffice_bridge import SkyOfficeBridge

    skyoffice = SkyOfficeBridge(event_bus=eb)

    container = EngineContainer(
        executor=we,
        preset_loader=pl,
        checkpoint_store=cs,
        state_machine=sm,
        event_bus=eb,
        skyoffice_bridge=skyoffice,
    )

    # EventBus 구독: claude_local "block.process_completed" → executor.complete_block
    def _on_process_completed(event: Event) -> None:
        wf_id = event.data.get("workflow_id")
        block_id = event.data.get("block_id")
        if wf_id and block_id and container.executor:
            asyncio.create_task(container.executor.complete_block(wf_id, block_id))

    eb.subscribe("block.process_completed", _on_process_completed)

    # 서버 재시작 후 활성 워크플로우 자동 복구
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_auto_recover_workflows(container))
        else:
            loop.call_soon(lambda: asyncio.ensure_future(_auto_recover_workflows(container)))
    except RuntimeError:
        pass  # no event loop — FastAPI startup에서 호출 시 자동 처리

    return container
