"""EngineContainer — DI 컨테이너 + AdapterRegistry.

전역 변수 6개를 단일 객체로 교체. engine_bridge.py 순환 의존 방지.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from brick.adapters.base import TeamAdapter

if TYPE_CHECKING:
    from brick.engine.checkpoint import CheckpointStore
    from brick.engine.event_bus import EventBus
    from brick.engine.executor import PresetLoader, WorkflowExecutor
    from brick.engine.state_machine import StateMachine


class AdapterRegistry:
    """dict 호환 어댑터 레지스트리. WorkflowExecutor adapter_pool 대체."""

    def __init__(self) -> None:
        self._adapters: dict[str, TeamAdapter] = {}

    def register(self, name: str, adapter: TeamAdapter) -> None:
        self._adapters[name] = adapter

    def get(self, name: str) -> TeamAdapter:
        if name not in self._adapters:
            raise KeyError(f"Unknown adapter: {name}")
        return self._adapters[name]

    def registered_adapter_types(self) -> set[str]:
        return set(self._adapters.keys())

    # dict 호환 (WorkflowExecutor 무변경)
    def __getitem__(self, name: str) -> TeamAdapter:
        return self.get(name)

    def __contains__(self, name: str) -> bool:
        return name in self._adapters

    def items(self):
        return self._adapters.items()


@dataclass
class EngineContainer:
    """엔진 컴포넌트 DI 컨테이너. 전역 변수 대체."""

    executor: WorkflowExecutor
    preset_loader: PresetLoader
    checkpoint_store: CheckpointStore
    state_machine: StateMachine
    event_bus: EventBus
    skyoffice_bridge: object = field(default=None)
