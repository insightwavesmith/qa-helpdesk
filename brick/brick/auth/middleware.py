"""인증 미들웨어 — 세션쿠키 / API키 / 개발모드 3중 인증."""

from __future__ import annotations

import hashlib
import json
import os
import time

from fastapi import Depends, HTTPException, Request
from fastapi.security import APIKeyHeader

from brick.auth.db import get_db
from brick.auth.models import BrickUser, require_role

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def authenticate_request(
    request: Request,
    api_key: str | None = Depends(api_key_header),
) -> BrickUser:
    """
    인증 우선순위 (Mission Control 패턴):
    1. 세션 쿠키 (brick_session)
    2. API 키 (X-API-Key 헤더)
    3. 개발 모드 (BRICK_DEV_MODE=1 → admin 자동)
    """
    # 1. 세션 쿠키
    session_token = request.cookies.get("brick_session")
    if session_token:
        from brick.auth.session import validate_session
        user = validate_session(session_token)
        if user:
            return user

    # 2. API 키
    if api_key:
        user = _validate_api_key(api_key)
        if user:
            return user

    # 3. 개발 모드
    if os.getenv("BRICK_DEV_MODE") == "1":
        return BrickUser(
            id=0, username="dev", display_name="Developer",
            role="admin", workspace_id=1,
            created_at=0, updated_at=0,
        )

    raise HTTPException(status_code=401, detail="인증 필요")


def _validate_api_key(api_key: str) -> BrickUser | None:
    """API 키 → SHA-256 → DB 조회 → scopes에서 role 추출."""
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    conn = get_db()
    row = conn.execute(
        "SELECT ak.id, ak.owner_type, ak.owner_id, ak.workspace_id, ak.scopes, "
        "ak.expires_at, ak.revoked_at "
        "FROM api_keys ak WHERE ak.key_hash = ?",
        (key_hash,),
    ).fetchone()
    if row is None:
        return None
    # 만료/폐기 체크
    now = int(time.time())
    if row["revoked_at"] is not None:
        return None
    if row["expires_at"] is not None and row["expires_at"] < now:
        return None
    # last_used_at 갱신
    conn.execute(
        "UPDATE api_keys SET last_used_at = ? WHERE id = ?",
        (now, row["id"]),
    )
    conn.commit()
    # scopes → role 변환 (최고 scope 사용)
    scopes = json.loads(row["scopes"]) if row["scopes"] else ["viewer"]
    role = _max_role(scopes)

    if row["owner_type"] == "user":
        user_row = conn.execute(
            "SELECT id, username, display_name, workspace_id, created_at, updated_at "
            "FROM users WHERE id = ?",
            (row["owner_id"],),
        ).fetchone()
        if user_row:
            return BrickUser(
                id=user_row["id"],
                username=user_row["username"],
                display_name=user_row["display_name"],
                role=role,
                workspace_id=user_row["workspace_id"],
                created_at=user_row["created_at"],
                updated_at=user_row["updated_at"],
            )
    # agent-owned API key
    return BrickUser(
        id=row["owner_id"],
        username=f"agent-{row['owner_id']}",
        display_name=f"Agent {row['owner_id']}",
        role=role,
        workspace_id=row["workspace_id"],
        created_at=0, updated_at=0,
    )


def _max_role(scopes: list[str]) -> str:
    """scopes 리스트에서 최고 role 반환."""
    from brick.auth.models import ROLE_LEVELS
    best = "viewer"
    for s in scopes:
        if s in ROLE_LEVELS and ROLE_LEVELS[s] > ROLE_LEVELS.get(best, 0):
            best = s
    return best


def require_role_dep(min_role: str):
    """FastAPI Depends — 최소 역할 검증 의존성 팩토리."""
    async def _check(user: BrickUser = Depends(authenticate_request)):
        if not require_role(user, min_role):
            raise HTTPException(
                status_code=403,
                detail=f"권한 부족: {min_role} 이상 필요 (현재: {user.role})",
            )
        return user
    return _check
