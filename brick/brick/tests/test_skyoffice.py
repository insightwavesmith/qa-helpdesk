"""SK-01~SK-08 + INV-P3-1~2: SkyOffice 멀티플레이어 TDD.

Design: brick-opensource-platform.design.md Phase 3
"""

from __future__ import annotations

import pytest

from brick.integrations.skyoffice_bridge import (
    Player,
    SkyOfficeBridge,
    ROOM_POSITIONS,
)
from brick.engine.event_bus import EventBus
from brick.models.events import Event


# ── Fixtures ────────────────────────────────────────────────────────────


@pytest.fixture
def event_bus() -> EventBus:
    return EventBus()


@pytest.fixture
def bridge(event_bus: EventBus) -> SkyOfficeBridge:
    return SkyOfficeBridge(event_bus=event_bus)


# ── SK-01: Player 스키마 ────────────────────────────────────────────────


class TestSK01PlayerSchema:
    """SK-01: Player 스키마에 agentId/role/status/currentTask/currentBlockId 존재."""

    def test_sk01_player_schema(self):
        player = Player(
            name="cto-agent",
            agent_id="agent-1",
            role="CTO",
            status="idle",
            current_task="",
            current_block_id="",
            workspace_id=1,
            x=705,
            y=500,
        )
        assert player.agent_id == "agent-1"
        assert player.role == "CTO"
        assert player.status == "idle"
        assert player.current_task == ""
        assert player.current_block_id == ""

    def test_sk01_player_has_position(self):
        """Player는 x, y 좌표를 갖는다."""
        player = Player(
            name="pm-agent",
            agent_id="agent-2",
            role="PM",
            status="idle",
            workspace_id=1,
        )
        assert hasattr(player, "x")
        assert hasattr(player, "y")


# ── SK-02: 에이전트 등록 → Player 생성 ──────────────────────────────────


class TestSK02AgentPlayerCreate:
    """SK-02: 에이전트 등록 → Room에 Player 자동 생성."""

    def test_sk02_agent_player_create(self, bridge: SkyOfficeBridge):
        bridge.register_agent(
            agent_id="agent-1",
            name="cto-agent",
            role="CTO",
            workspace_id=1,
        )

        room = bridge.get_room(workspace_id=1)
        assert "agent-1" in room.players
        player = room.players["agent-1"]
        assert player.name == "cto-agent"
        assert player.role == "CTO"
        assert player.status == "idle"

    def test_sk02_duplicate_register_updates(self, bridge: SkyOfficeBridge):
        """같은 agent_id 재등록 → 기존 Player 업데이트."""
        bridge.register_agent(agent_id="a1", name="old", role="PM", workspace_id=1)
        bridge.register_agent(agent_id="a1", name="new", role="CTO", workspace_id=1)

        room = bridge.get_room(workspace_id=1)
        assert room.players["a1"].name == "new"
        assert room.players["a1"].role == "CTO"


# ── SK-03: block.started → status="working" ─────────────────────────────


class TestSK03BlockStarted:
    """SK-03: block.started → Player.status='working'."""

    def test_sk03_block_started(self, bridge: SkyOfficeBridge, event_bus: EventBus):
        bridge.register_agent(
            agent_id="agent-1", name="cto", role="CTO", workspace_id=1
        )

        event_bus.publish(Event(
            type="block.started",
            data={
                "block_id": "do",
                "block_type": "do",
                "agent_id": "agent-1",
                "workspace_id": 1,
                "task": "Phase 3 구현",
            },
        ))

        room = bridge.get_room(workspace_id=1)
        player = room.players["agent-1"]
        assert player.status == "working"
        assert player.current_block_id == "do"
        assert player.current_task == "Phase 3 구현"


# ── SK-04: block.completed → status="idle" ───────────────────────────────


class TestSK04BlockCompleted:
    """SK-04: block.completed → Player.status='idle'."""

    def test_sk04_block_completed(self, bridge: SkyOfficeBridge, event_bus: EventBus):
        bridge.register_agent(
            agent_id="agent-1", name="cto", role="CTO", workspace_id=1
        )

        # Start block first
        event_bus.publish(Event(
            type="block.started",
            data={
                "block_id": "do",
                "block_type": "do",
                "agent_id": "agent-1",
                "workspace_id": 1,
                "task": "구현 중",
            },
        ))
        assert bridge.get_room(1).players["agent-1"].status == "working"

        # Complete block
        event_bus.publish(Event(
            type="block.completed",
            data={
                "block_id": "do",
                "agent_id": "agent-1",
                "workspace_id": 1,
            },
        ))

        player = bridge.get_room(1).players["agent-1"]
        assert player.status == "idle"
        assert player.current_block_id == ""
        assert player.current_task == ""

    def test_sk04_block_failed_sets_error(self, bridge: SkyOfficeBridge, event_bus: EventBus):
        """block.failed → Player.status='error'."""
        bridge.register_agent(
            agent_id="agent-1", name="cto", role="CTO", workspace_id=1
        )
        event_bus.publish(Event(
            type="block.failed",
            data={"block_id": "do", "agent_id": "agent-1", "workspace_id": 1},
        ))

        assert bridge.get_room(1).players["agent-1"].status == "error"


# ── SK-05: 블록 타입별 방 매핑 (위치 이동) ──────────────────────────────


class TestSK05RoomMapping:
    """SK-05: block 타입별 방 이동 → Player.x, y 변경."""

    def test_sk05_room_mapping(self, bridge: SkyOfficeBridge, event_bus: EventBus):
        bridge.register_agent(
            agent_id="agent-1", name="cto", role="CTO", workspace_id=1
        )

        for block_type, (expected_x, expected_y) in ROOM_POSITIONS.items():
            event_bus.publish(Event(
                type="block.started",
                data={
                    "block_id": f"{block_type}-1",
                    "block_type": block_type,
                    "agent_id": "agent-1",
                    "workspace_id": 1,
                },
            ))
            player = bridge.get_room(1).players["agent-1"]
            assert player.x == expected_x, f"{block_type}: x={player.x} != {expected_x}"
            assert player.y == expected_y, f"{block_type}: y={player.y} != {expected_y}"

    def test_sk05_positions_defined(self):
        """Design 3-D: plan, design, do, check, act 모두 정의."""
        for block_type in ("plan", "design", "do", "check", "act"):
            assert block_type in ROOM_POSITIONS


# ── SK-06: 에이전트 offline → Player 제거 ────────────────────────────────


class TestSK06AgentOfflineRemove:
    """SK-06: 에이전트 offline → Room에서 Player 제거."""

    def test_sk06_agent_offline_remove(self, bridge: SkyOfficeBridge):
        bridge.register_agent(
            agent_id="agent-1", name="cto", role="CTO", workspace_id=1
        )
        assert "agent-1" in bridge.get_room(1).players

        bridge.remove_agent(agent_id="agent-1", workspace_id=1)
        assert "agent-1" not in bridge.get_room(1).players

    def test_sk06_remove_nonexistent_noop(self, bridge: SkyOfficeBridge):
        """존재하지 않는 에이전트 제거 → 에러 없음."""
        bridge.remove_agent(agent_id="ghost", workspace_id=99)


# ── SK-07: workspace 격리 ────────────────────────────────────────────────


class TestSK07WorkspaceIsolation:
    """SK-07: workspace_id 다른 에이전트 → 별도 Room."""

    def test_sk07_workspace_isolation(self, bridge: SkyOfficeBridge):
        bridge.register_agent(
            agent_id="a1", name="ws1-agent", role="CTO", workspace_id=1
        )
        bridge.register_agent(
            agent_id="a2", name="ws2-agent", role="PM", workspace_id=2
        )

        room1 = bridge.get_room(workspace_id=1)
        room2 = bridge.get_room(workspace_id=2)

        assert "a1" in room1.players
        assert "a2" not in room1.players
        assert "a2" in room2.players
        assert "a1" not in room2.players

    def test_sk07_room_name_format(self, bridge: SkyOfficeBridge):
        """Room 이름: brick-ws-{workspace_id}."""
        bridge.register_agent(
            agent_id="a1", name="agent", role="CTO", workspace_id=42
        )
        room = bridge.get_room(workspace_id=42)
        assert room.name == "brick-ws-42"


# ── SK-08: broadcast ────────────────────────────────────────────────────


class TestSK08Broadcast:
    """SK-08: 다수 클라이언트 → 전부 상태 수신 (broadcast 검증)."""

    def test_sk08_broadcast(self, bridge: SkyOfficeBridge, event_bus: EventBus):
        # 3 agents in same workspace
        for i in range(3):
            bridge.register_agent(
                agent_id=f"a{i}",
                name=f"agent-{i}",
                role="CTO",
                workspace_id=1,
            )

        broadcasts: list[dict] = []
        bridge.on_broadcast(lambda data: broadcasts.append(data))

        event_bus.publish(Event(
            type="block.started",
            data={
                "block_id": "do",
                "block_type": "do",
                "agent_id": "a0",
                "workspace_id": 1,
                "task": "작업 시작",
            },
        ))

        assert len(broadcasts) >= 1
        last = broadcasts[-1]
        assert last["type"] == "block.started"
        assert last["workspace_id"] == 1

    def test_sk08_broadcast_includes_room_snapshot(self, bridge: SkyOfficeBridge, event_bus: EventBus):
        """Broadcast에 현재 Room 스냅샷 포함."""
        bridge.register_agent(
            agent_id="a1", name="cto", role="CTO", workspace_id=1
        )

        broadcasts: list[dict] = []
        bridge.on_broadcast(lambda data: broadcasts.append(data))

        event_bus.publish(Event(
            type="block.started",
            data={
                "block_id": "plan",
                "block_type": "plan",
                "agent_id": "a1",
                "workspace_id": 1,
            },
        ))

        assert len(broadcasts) >= 1
        snapshot = broadcasts[-1].get("players")
        assert snapshot is not None
        assert "a1" in snapshot


# ── INV-P3-1: 기존 Player 필드 변경 없음 ───────────────────────────────


class TestINVP31ExistingFields:
    """INV-P3-1: SkyOffice 기존 Player 필드(name, x, y, anim) 변경 없음."""

    def test_inv_p3_1_existing_fields(self):
        player = Player(
            name="test",
            agent_id="",
            role="",
            status="idle",
            workspace_id=1,
        )
        # 기존 필드 기본값 보존
        assert player.name == "test"
        assert player.x == 705
        assert player.y == 500
        assert player.anim == "adam_idle_down"


# ── INV-P3-2: workspace 격리 불변식 ─────────────────────────────────────


class TestINVP32WorkspaceIsolation:
    """INV-P3-2: workspace_id 다른 에이전트 Room 격리."""

    def test_inv_p3_2_cross_workspace_blocked(self, bridge: SkyOfficeBridge, event_bus: EventBus):
        """workspace 1의 이벤트가 workspace 2의 Player에 영향 못 줌."""
        bridge.register_agent(
            agent_id="a1", name="ws1", role="CTO", workspace_id=1
        )
        bridge.register_agent(
            agent_id="a2", name="ws2", role="PM", workspace_id=2
        )

        # workspace 1 이벤트
        event_bus.publish(Event(
            type="block.started",
            data={
                "block_id": "do",
                "block_type": "do",
                "agent_id": "a1",
                "workspace_id": 1,
            },
        ))

        # workspace 2 player는 영향 없음
        assert bridge.get_room(2).players["a2"].status == "idle"
        # workspace 1 player만 변경
        assert bridge.get_room(1).players["a1"].status == "working"
