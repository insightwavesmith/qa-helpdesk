"""세션 생성/검증/삭제."""

from __future__ import annotations

import hashlib
import secrets
import time

from brick.auth.db import get_db
from brick.auth.models import BrickUser

SESSION_DURATION = 7 * 24 * 3600  # 7일


def create_session(user_id: int, workspace_id: int, ip: str | None = None) -> str:
    """세션 생성 — raw token 반환, DB에는 SHA-256 해시만 저장."""
    token = secrets.token_hex(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires_at = int(time.time()) + SESSION_DURATION
    conn = get_db()
    conn.execute(
        "INSERT INTO user_sessions (token_hash, user_id, workspace_id, expires_at, ip_address) "
        "VALUES (?, ?, ?, ?, ?)",
        (token_hash, user_id, workspace_id, expires_at, ip),
    )
    conn.commit()
    return token


def validate_session(token: str) -> BrickUser | None:
    """세션 검증 — token → SHA-256 → DB 조회 → JOIN users."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    conn = get_db()
    row = conn.execute(
        "SELECT u.id, u.username, u.display_name, u.role, u.workspace_id, "
        "u.created_at, u.updated_at, u.last_login_at "
        "FROM user_sessions s JOIN users u ON s.user_id = u.id "
        "WHERE s.token_hash = ? AND s.expires_at > ?",
        (token_hash, int(time.time())),
    ).fetchone()
    if row is None:
        return None
    return BrickUser(
        id=row["id"],
        username=row["username"],
        display_name=row["display_name"],
        role=row["role"],
        workspace_id=row["workspace_id"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        last_login_at=row["last_login_at"],
    )


def destroy_session(token: str) -> None:
    """세션 삭제."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    conn = get_db()
    conn.execute("DELETE FROM user_sessions WHERE token_hash = ?", (token_hash,))
    conn.commit()
