"""SkyOffice API — 에이전트 상태 동기화 엔드포인트 (Design 3-C).

Express 라우트 대신 FastAPI로 구현.
POST /api/skyoffice/sync   — 엔진 → SkyOffice 이벤트 push
GET  /api/skyoffice/rooms   — Room 상태 조회
GET  /api/skyoffice/rooms/{workspace_id} — 특정 Room 조회
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from brick.dashboard.middleware.auth import verify_brick_api_key

router = APIRouter(
    prefix="/skyoffice",
    tags=["skyoffice"],
    dependencies=[Depends(verify_brick_api_key)],
)

# Global bridge reference — set by init_skyoffice()
_bridge = None


def init_skyoffice(bridge) -> None:
    """SkyOfficeBridge 인스턴스 연결. server.py에서 호출."""
    global _bridge
    _bridge = bridge


class SyncEventRequest(BaseModel):
    """엔진 → SkyOffice 이벤트 push."""
    type: str
    agent_id: str = ""
    workspace_id: int = 1
    block_id: str = ""
    block_type: str = ""
    task: str = ""


@router.post("/sync")
async def sync_event(req: SyncEventRequest):
    """엔진 이벤트를 SkyOffice에 동기화."""
    if not _bridge:
        raise HTTPException(status_code=500, detail="SkyOffice bridge not initialized")

    from brick.models.events import Event
    event = Event(
        type=req.type,
        data={
            "agent_id": req.agent_id,
            "workspace_id": req.workspace_id,
            "block_id": req.block_id,
            "block_type": req.block_type,
            "task": req.task,
        },
    )
    _bridge._event_bus.publish(event)
    return {"status": "ok", "event_type": req.type}


@router.get("/rooms")
async def list_rooms():
    """전체 Room 목록 + 상태."""
    if not _bridge:
        raise HTTPException(status_code=500, detail="SkyOffice bridge not initialized")

    return {
        "rooms": [
            {
                "name": room.name,
                "workspace_id": room.workspace_id,
                "player_count": len(room.players),
                "players": room.snapshot(),
            }
            for room in _bridge._rooms.values()
        ]
    }


@router.get("/rooms/{workspace_id}")
async def get_room(workspace_id: int):
    """특정 workspace Room 상태."""
    if not _bridge:
        raise HTTPException(status_code=500, detail="SkyOffice bridge not initialized")

    room = _bridge._rooms.get(workspace_id)
    if not room:
        raise HTTPException(status_code=404, detail="room_not_found")

    return {
        "name": room.name,
        "workspace_id": room.workspace_id,
        "player_count": len(room.players),
        "players": room.snapshot(),
    }
