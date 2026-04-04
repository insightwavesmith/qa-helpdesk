"""사용자 CRUD."""

from __future__ import annotations

import time

from brick.auth.db import get_db
from brick.auth.models import BrickUser
from brick.auth.password import hash_password, verify_password, DUMMY_HASH


def create_user(
    username: str,
    password: str,
    display_name: str,
    role: str = "viewer",
    workspace_id: int = 1,
) -> BrickUser:
    """사용자 생성."""
    pw_hash = hash_password(password)
    now = int(time.time())
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO users (username, display_name, password_hash, role, workspace_id, "
        "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (username, display_name, pw_hash, role, workspace_id, now, now),
    )
    conn.commit()
    return BrickUser(
        id=cur.lastrowid,
        username=username,
        display_name=display_name,
        role=role,
        workspace_id=workspace_id,
        created_at=now,
        updated_at=now,
    )


def authenticate_user(username: str, password: str) -> BrickUser | None:
    """
    사용자 인증. Mission Control auth.ts:218-265 패턴.
    사용자 미존재 시에도 dummy hash 실행 (타이밍 공격 방어).
    """
    conn = get_db()
    row = conn.execute(
        "SELECT id, username, display_name, password_hash, role, workspace_id, "
        "created_at, updated_at, last_login_at FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if row is None:
        verify_password(password, DUMMY_HASH)
        return None
    if not verify_password(password, row["password_hash"]):
        return None
    # last_login_at 갱신
    now = int(time.time())
    conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now, row["id"]))
    conn.commit()
    return BrickUser(
        id=row["id"],
        username=row["username"],
        display_name=row["display_name"],
        role=row["role"],
        workspace_id=row["workspace_id"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        last_login_at=now,
    )
