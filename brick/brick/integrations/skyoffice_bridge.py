"""SkyOffice Bridge — 에이전트 ↔ SkyOffice Player 매핑 + 실시간 상태 동기화.

Design: brick-opensource-platform.design.md Phase 3 (3-A ~ 3-E)

엔진 EventBus 이벤트를 구독하여 SkyOffice Room의 Player 상태를 관리한다.
- block.started  → Player.status = "working", 해당 방으로 이동
- block.completed → Player.status = "idle"
- block.failed   → Player.status = "error"

Room 매핑: workspace_id → "brick-ws-{id}"
방 위치: Design 3-D 테이블 기준
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from brick.engine.event_bus import EventBus
from brick.models.events import Event


# ── Design 3-D: 블록 타입 → 방 좌표 ────────────────────────────────────

ROOM_POSITIONS: dict[str, tuple[int, int]] = {
    "plan": (200, 300),
    "design": (400, 300),
    "do": (600, 300),
    "check": (800, 300),
    "act": (1000, 300),
}

_DEFAULT_X = 705
_DEFAULT_Y = 500


# ── Player (Design 3-A) ────────────────────────────────────────────────


@dataclass
class Player:
    """SkyOffice Player — 에이전트 1:1 매핑.

    기존 필드(name, x, y, anim)는 INV-P3-1에 의해 변경 금지.
    """

    # 기존 SkyOffice 필드 (INV-P3-1: 변경 금지)
    name: str = ""
    x: int = _DEFAULT_X
    y: int = _DEFAULT_Y
    anim: str = "adam_idle_down"

    # 신규: 에이전트 연결 (Design 3-A)
    agent_id: str = ""
    role: str = ""
    status: str = "idle"
    current_task: str = ""
    current_block_id: str = ""
    workspace_id: int = 1


# ── Room ────────────────────────────────────────────────────────────────


@dataclass
class Room:
    """SkyOffice Room — workspace 단위 격리 (Design 3-E)."""

    name: str
    workspace_id: int
    players: dict[str, Player] = field(default_factory=dict)

    def snapshot(self) -> dict[str, dict]:
        """현재 Room 상태를 직렬화."""
        return {
            agent_id: {
                "name": p.name,
                "agent_id": p.agent_id,
                "role": p.role,
                "status": p.status,
                "current_task": p.current_task,
                "current_block_id": p.current_block_id,
                "x": p.x,
                "y": p.y,
            }
            for agent_id, p in self.players.items()
        }


# ── SkyOfficeBridge ─────────────────────────────────────────────────────


class SkyOfficeBridge:
    """EventBus → SkyOffice 단방향 이벤트 브릿지 (Design 3-C).

    - register_agent(): 에이전트 등록 → Room에 Player 생성 (Design 3-B)
    - remove_agent(): 에이전트 offline → Player 제거 (SK-06)
    - EventBus 구독으로 block 이벤트 → Player 상태 업데이트
    """

    def __init__(self, event_bus: EventBus) -> None:
        self._event_bus = event_bus
        self._rooms: dict[int, Room] = {}  # workspace_id → Room
        self._broadcast_listeners: list[Callable[[dict], None]] = []

        # EventBus 구독
        event_bus.subscribe("block.started", self._on_block_started)
        event_bus.subscribe("block.completed", self._on_block_completed)
        event_bus.subscribe("block.failed", self._on_block_failed)
        event_bus.subscribe("workflow.completed", self._on_workflow_completed)

    # ── Room 관리 ───────────────────────────────────────────────────────

    def get_room(self, workspace_id: int) -> Room:
        """workspace별 Room 반환. 없으면 생성."""
        if workspace_id not in self._rooms:
            self._rooms[workspace_id] = Room(
                name=f"brick-ws-{workspace_id}",
                workspace_id=workspace_id,
            )
        return self._rooms[workspace_id]

    # ── 에이전트 등록/제거 (Design 3-B, SK-06) ──────────────────────────

    def register_agent(
        self,
        agent_id: str,
        name: str,
        role: str,
        workspace_id: int,
    ) -> Player:
        """에이전트 등록 → Room에 Player 생성/업데이트."""
        room = self.get_room(workspace_id)

        if agent_id in room.players:
            # 재등록: 업데이트
            player = room.players[agent_id]
            player.name = name
            player.role = role
        else:
            player = Player(
                name=name,
                agent_id=agent_id,
                role=role,
                status="idle",
                workspace_id=workspace_id,
            )
            room.players[agent_id] = player

        return player

    def remove_agent(self, agent_id: str, workspace_id: int) -> None:
        """에이전트 offline → Room에서 Player 제거."""
        room = self._rooms.get(workspace_id)
        if room and agent_id in room.players:
            del room.players[agent_id]

    # ── Broadcast ───────────────────────────────────────────────────────

    def on_broadcast(self, listener: Callable[[dict], None]) -> None:
        """Broadcast 리스너 등록 (SK-08)."""
        self._broadcast_listeners.append(listener)

    def _broadcast(self, event_type: str, workspace_id: int, data: dict) -> None:
        """모든 리스너에 이벤트 전달."""
        room = self.get_room(workspace_id)
        payload = {
            "type": event_type,
            "workspace_id": workspace_id,
            "players": room.snapshot(),
            **data,
        }
        for listener in self._broadcast_listeners:
            listener(payload)

    # ── EventBus 핸들러 (Design 3-C) ────────────────────────────────────

    def _on_block_started(self, event: Event) -> None:
        """block.started → Player.status='working', 방 이동."""
        data = event.data
        agent_id = data.get("agent_id", "")
        workspace_id = data.get("workspace_id")
        if not agent_id or workspace_id is None:
            return

        room = self._rooms.get(workspace_id)
        if not room or agent_id not in room.players:
            return

        player = room.players[agent_id]
        player.status = "working"
        player.current_block_id = data.get("block_id", "")
        player.current_task = data.get("task", "")

        # 방 이동 (Design 3-D)
        block_type = data.get("block_type", "")
        if block_type in ROOM_POSITIONS:
            player.x, player.y = ROOM_POSITIONS[block_type]

        self._broadcast("block.started", workspace_id, {
            "agent_id": agent_id,
            "block_id": data.get("block_id", ""),
        })

    def _on_block_completed(self, event: Event) -> None:
        """block.completed → Player.status='idle'."""
        data = event.data
        agent_id = data.get("agent_id", "")
        workspace_id = data.get("workspace_id")
        if not agent_id or workspace_id is None:
            return

        room = self._rooms.get(workspace_id)
        if not room or agent_id not in room.players:
            return

        player = room.players[agent_id]
        player.status = "idle"
        player.current_block_id = ""
        player.current_task = ""

        self._broadcast("block.completed", workspace_id, {
            "agent_id": agent_id,
            "block_id": data.get("block_id", ""),
        })

    def _on_block_failed(self, event: Event) -> None:
        """block.failed → Player.status='error'."""
        data = event.data
        agent_id = data.get("agent_id", "")
        workspace_id = data.get("workspace_id")
        if not agent_id or workspace_id is None:
            return

        room = self._rooms.get(workspace_id)
        if not room or agent_id not in room.players:
            return

        player = room.players[agent_id]
        player.status = "error"

        self._broadcast("block.failed", workspace_id, {
            "agent_id": agent_id,
            "block_id": data.get("block_id", ""),
        })

    def _on_workflow_completed(self, event: Event) -> None:
        """workflow.completed → 전원 idle."""
        workspace_id = event.data.get("workspace_id")
        if workspace_id is None:
            return

        room = self._rooms.get(workspace_id)
        if not room:
            return

        for player in room.players.values():
            player.status = "idle"
            player.current_block_id = ""
            player.current_task = ""

        self._broadcast("workflow.completed", workspace_id, {})
