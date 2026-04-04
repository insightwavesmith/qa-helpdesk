"""에이전트 자동등록 API — Phase 2-D."""

from __future__ import annotations

import json
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from brick.auth.db import get_db
from brick.auth.middleware import require_role_dep
from brick.auth.models import BrickUser

router = APIRouter(prefix="/agents", tags=["agents"])


# ── Request models ──

class RegisterAgentRequest(BaseModel):
    name: str
    adapter_type: str
    config: dict | None = None


class HeartbeatRequest(BaseModel):
    status: str = "idle"


# ── 엔드포인트 ──

@router.post("/register")
async def register_agent(
    body: RegisterAgentRequest,
    user: BrickUser = Depends(require_role_dep("operator")),
):
    """에이전트 자동등록 — operator 이상."""
    conn = get_db()
    now = int(time.time())
    config_json = json.dumps(body.config) if body.config else None
    try:
        cur = conn.execute(
            "INSERT INTO agents (name, adapter_type, workspace_id, status, last_heartbeat, config, "
            "created_at, updated_at) VALUES (?, ?, ?, 'idle', ?, ?, ?, ?)",
            (body.name, body.adapter_type, user.workspace_id, now, config_json, now, now),
        )
        conn.commit()
    except Exception:
        # UNIQUE 제약 위반 → upsert
        conn.execute(
            "UPDATE agents SET status='idle', last_heartbeat=?, config=?, updated_at=? "
            "WHERE name=? AND workspace_id=?",
            (now, config_json, now, body.name, user.workspace_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id FROM agents WHERE name=? AND workspace_id=?",
            (body.name, user.workspace_id),
        ).fetchone()
        return {"ok": True, "agent_id": row["id"], "heartbeat_interval": 60}

    return {"ok": True, "agent_id": cur.lastrowid, "heartbeat_interval": 60}


@router.get("")
async def list_agents(user: BrickUser = Depends(require_role_dep("viewer"))):
    """등록된 에이전트 목록 — viewer 이상."""
    conn = get_db()
    rows = conn.execute(
        "SELECT id, name, adapter_type, status, last_heartbeat, config, created_at "
        "FROM agents WHERE workspace_id = ?",
        (user.workspace_id,),
    ).fetchall()
    return {
        "agents": [
            {
                "id": r["id"],
                "name": r["name"],
                "adapter_type": r["adapter_type"],
                "status": r["status"],
                "last_heartbeat": r["last_heartbeat"],
            }
            for r in rows
        ]
    }


@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: int,
    user: BrickUser = Depends(require_role_dep("admin")),
):
    """에이전트 등록 해제 — admin 전용."""
    conn = get_db()
    cur = conn.execute(
        "DELETE FROM agents WHERE id = ? AND workspace_id = ?",
        (agent_id, user.workspace_id),
    )
    conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="에이전트를 찾을 수 없습니다")
    return {"ok": True}


@router.post("/{agent_id}/heartbeat")
async def agent_heartbeat(
    agent_id: int,
    body: HeartbeatRequest | None = None,
    user: BrickUser = Depends(require_role_dep("operator")),
):
    """에이전트 하트비트 갱신."""
    conn = get_db()
    now = int(time.time())
    status = body.status if body else "idle"
    cur = conn.execute(
        "UPDATE agents SET last_heartbeat = ?, status = ?, updated_at = ? "
        "WHERE id = ? AND workspace_id = ?",
        (now, status, now, agent_id, user.workspace_id),
    )
    conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="에이전트를 찾을 수 없습니다")
    return {"ok": True, "last_heartbeat": now}


def mark_offline_agents(timeout_seconds: int = 180) -> int:
    """하트비트 미수신 에이전트 → offline 전환. 스케줄러에서 호출."""
    conn = get_db()
    cutoff = int(time.time()) - timeout_seconds
    cur = conn.execute(
        "UPDATE agents SET status = 'offline', updated_at = ? "
        "WHERE status != 'offline' AND last_heartbeat < ?",
        (int(time.time()), cutoff),
    )
    conn.commit()
    return cur.rowcount
