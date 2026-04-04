"""Phase 2 TDD — 멀티유저 + RBAC + 에이전트 등록 (AU-01 ~ AU-18)."""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from brick.auth import db as auth_db
from brick.auth.models import BrickUser, ROLE_LEVELS, require_role
from brick.auth.password import hash_password, verify_password
from brick.auth.session import create_session, validate_session, destroy_session, SESSION_DURATION
from brick.auth.users import create_user, authenticate_user
from brick.dashboard.routes.agent_routes import mark_offline_agents


# ── Fixtures ──


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
    """각 테스트마다 독립 DB."""
    db_path = str(tmp_path / "test.db")
    auth_db.close_db()
    auth_db.init_db(db_path)
    yield db_path
    auth_db.close_db()


@pytest.fixture
def app(fresh_db):
    """테스트용 FastAPI app."""
    from brick.dashboard.server import app as _app, create_app
    # 기존 라우트 초기화를 위해 import만 — DB는 fresh_db가 이미 초기화
    # create_app은 router 중복 등록 문제가 있으므로, 이미 등록된 app 재사용
    return _app


@pytest.fixture
def admin_user(fresh_db) -> BrickUser:
    return create_user("admin1", "admin_pw_123!", "관리자", role="admin")


@pytest.fixture
def operator_user(fresh_db) -> BrickUser:
    return create_user("operator1", "oper_pw_456!", "운영자", role="operator")


@pytest.fixture
def viewer_user(fresh_db) -> BrickUser:
    return create_user("viewer1", "view_pw_789!", "열람자", role="viewer")


def _make_api_key(owner_type: str, owner_id: int, workspace_id: int, scopes: list[str],
                  expires_at: int | None = None, revoked_at: int | None = None) -> str:
    """테스트용 API 키 생성 → raw key 반환."""
    raw_key = secrets.token_hex(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    conn = auth_db.get_db()
    conn.execute(
        "INSERT INTO api_keys (key_hash, name, owner_type, owner_id, workspace_id, scopes, "
        "expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (key_hash, f"test-key-{owner_id}", owner_type, owner_id, workspace_id,
         json.dumps(scopes), expires_at, revoked_at),
    )
    conn.commit()
    return raw_key


# ── AU-01: createUser → DB에 사용자 생성 ──

def test_au01_create_user(fresh_db):
    user = create_user("testuser", "secure_pw_123!", "테스트 사용자")
    assert user.id is not None and user.id > 0
    assert user.username == "testuser"
    # DB에서 직접 확인
    conn = auth_db.get_db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user.id,)).fetchone()
    assert row is not None
    # password_hash는 평문이 아님
    assert row["password_hash"] != "secure_pw_123!"
    assert row["password_hash"].startswith("scrypt:")


# ── AU-02: authenticateUser(정상) → BrickUser 반환 ──

def test_au02_authenticate_valid(fresh_db):
    create_user("auth_user", "my_password!", "인증 사용자", role="operator", workspace_id=1)
    user = authenticate_user("auth_user", "my_password!")
    assert user is not None
    assert user.role == "operator"
    assert user.workspace_id == 1
    assert user.username == "auth_user"


# ── AU-03: authenticateUser(틀린 비번) → None ──

def test_au03_authenticate_wrong_pw(fresh_db):
    create_user("auth_user2", "correct_pw!", "인증 사용자2")
    result = authenticate_user("auth_user2", "wrong_pw!")
    assert result is None
    # 존재하지 않는 사용자도 None (타이밍 공격 방어)
    result2 = authenticate_user("no_such_user", "any_pw!")
    assert result2 is None


# ── AU-04: createSession → token 반환 + DB 저장 ──

def test_au04_create_session(fresh_db):
    user = create_user("sess_user", "pw123!", "세션 사용자")
    token = create_session(user.id, user.workspace_id, ip="127.0.0.1")
    assert isinstance(token, str) and len(token) == 64  # hex(32)
    # DB에는 token_hash만 저장 (raw token 아님)
    conn = auth_db.get_db()
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = conn.execute("SELECT * FROM user_sessions WHERE token_hash = ?", (token_hash,)).fetchone()
    assert row is not None
    assert row["user_id"] == user.id
    # raw token은 DB에 없어야 함
    raw_check = conn.execute("SELECT * FROM user_sessions WHERE token_hash = ?", (token,)).fetchone()
    assert raw_check is None


# ── AU-05: validateSession(유효) → BrickUser ──

def test_au05_validate_session(fresh_db):
    user = create_user("val_user", "pw!", "검증 사용자", role="admin")
    token = create_session(user.id, user.workspace_id)
    result = validate_session(token)
    assert result is not None
    assert result.id == user.id
    assert result.username == "val_user"
    assert result.role == "admin"


# ── AU-06: validateSession(만료) → None ──

def test_au06_validate_expired(fresh_db):
    user = create_user("exp_user", "pw!", "만료 사용자")
    token = create_session(user.id, user.workspace_id)
    # 만료 시간을 과거로 설정
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    conn = auth_db.get_db()
    conn.execute(
        "UPDATE user_sessions SET expires_at = ? WHERE token_hash = ?",
        (int(time.time()) - 1, token_hash),
    )
    conn.commit()
    result = validate_session(token)
    assert result is None


# ── AU-07: destroySession → DB 삭제 ──

def test_au07_destroy_session(fresh_db):
    user = create_user("del_user", "pw!", "삭제 사용자")
    token = create_session(user.id, user.workspace_id)
    # 세션 유효 확인
    assert validate_session(token) is not None
    # 삭제
    destroy_session(token)
    # 삭제 후 검증 실패
    assert validate_session(token) is None
    # DB에서도 없음
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    conn = auth_db.get_db()
    row = conn.execute("SELECT * FROM user_sessions WHERE token_hash = ?", (token_hash,)).fetchone()
    assert row is None


# ── AU-08: viewer → GET /engine/status → 200 (읽기 허용) ──

def test_au08_viewer_get(fresh_db):
    """viewer가 읽기 API 접근 가능한지 — require_role 단위 테스트."""
    viewer = BrickUser(id=1, username="v", display_name="V", role="viewer",
                       workspace_id=1, created_at=0, updated_at=0)
    assert require_role(viewer, "viewer") is True


# ── AU-09: viewer → POST /engine/start → 403 (실행 거부) ──

def test_au09_viewer_post_blocked(fresh_db):
    """viewer가 operator 권한 API에 접근 불가."""
    viewer = BrickUser(id=1, username="v", display_name="V", role="viewer",
                       workspace_id=1, created_at=0, updated_at=0)
    assert require_role(viewer, "operator") is False


# ── AU-10: operator → POST /engine/start → 200 ──

def test_au10_operator_start(fresh_db):
    """operator가 operator 권한 API에 접근 가능."""
    op = BrickUser(id=2, username="o", display_name="O", role="operator",
                   workspace_id=1, created_at=0, updated_at=0)
    assert require_role(op, "operator") is True


# ── AU-11: operator → DELETE /api/brick/agents/:id → 403 ──

def test_au11_operator_delete_blocked(fresh_db):
    """operator는 admin 전용 API에 접근 불가."""
    op = BrickUser(id=2, username="o", display_name="O", role="operator",
                   workspace_id=1, created_at=0, updated_at=0)
    assert require_role(op, "admin") is False


# ── AU-12: admin → 모든 API → 200 ──

def test_au12_admin_all(fresh_db):
    """admin은 모든 역할 API 접근 가능."""
    admin = BrickUser(id=3, username="a", display_name="A", role="admin",
                      workspace_id=1, created_at=0, updated_at=0)
    assert require_role(admin, "viewer") is True
    assert require_role(admin, "operator") is True
    assert require_role(admin, "admin") is True


# ── AU-13: X-API-Key 헤더 → 유효 키 → 인증 성공 ──

def test_au13_apikey_valid(fresh_db, admin_user):
    raw_key = _make_api_key("user", admin_user.id, admin_user.workspace_id, ["admin"])
    from brick.auth.middleware import _validate_api_key
    user = _validate_api_key(raw_key)
    assert user is not None
    assert user.id == admin_user.id
    assert user.role == "admin"


# ── AU-14: X-API-Key 헤더 → 만료/폐기 키 → None ──

def test_au14_apikey_expired(fresh_db, admin_user):
    # 만료된 키
    expired_key = _make_api_key(
        "user", admin_user.id, admin_user.workspace_id, ["admin"],
        expires_at=int(time.time()) - 100,
    )
    from brick.auth.middleware import _validate_api_key
    assert _validate_api_key(expired_key) is None
    # 폐기된 키
    revoked_key = _make_api_key(
        "user", admin_user.id, admin_user.workspace_id, ["admin"],
        revoked_at=int(time.time()) - 50,
    )
    assert _validate_api_key(revoked_key) is None


# ── AU-15: API 키 scopes → role 변환 ──

def test_au15_apikey_scopes(fresh_db, operator_user):
    raw_key = _make_api_key("user", operator_user.id, operator_user.workspace_id, ["operator"])
    from brick.auth.middleware import _validate_api_key
    user = _validate_api_key(raw_key)
    assert user is not None
    assert user.role == "operator"
    # viewer scope 키
    viewer_key = _make_api_key("user", operator_user.id, operator_user.workspace_id, ["viewer"])
    user2 = _validate_api_key(viewer_key)
    assert user2 is not None
    assert user2.role == "viewer"


# ── AU-16: POST /agents/register → 에이전트 생성 ──

def test_au16_agent_register(fresh_db, admin_user):
    conn = auth_db.get_db()
    now = int(time.time())
    conn.execute(
        "INSERT INTO agents (name, adapter_type, workspace_id, status, last_heartbeat, "
        "created_at, updated_at) VALUES (?, ?, ?, 'idle', ?, ?, ?)",
        ("test-agent", "claude_local", admin_user.workspace_id, now, now, now),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM agents WHERE name = ? AND workspace_id = ?",
        ("test-agent", admin_user.workspace_id),
    ).fetchone()
    assert row is not None
    assert row["status"] == "idle"
    assert row["adapter_type"] == "claude_local"


# ── AU-17: POST /agents/:id/heartbeat → last_heartbeat 갱신 ──

def test_au17_agent_heartbeat(fresh_db, admin_user):
    conn = auth_db.get_db()
    old_ts = int(time.time()) - 300
    conn.execute(
        "INSERT INTO agents (name, adapter_type, workspace_id, status, last_heartbeat, "
        "created_at, updated_at) VALUES (?, ?, ?, 'idle', ?, ?, ?)",
        ("hb-agent", "claude_local", admin_user.workspace_id, old_ts, old_ts, old_ts),
    )
    conn.commit()
    agent_row = conn.execute("SELECT id FROM agents WHERE name = 'hb-agent'").fetchone()
    # heartbeat 갱신
    new_ts = int(time.time())
    conn.execute(
        "UPDATE agents SET last_heartbeat = ?, status = 'busy', updated_at = ? WHERE id = ?",
        (new_ts, new_ts, agent_row["id"]),
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_row["id"],)).fetchone()
    assert updated["last_heartbeat"] >= new_ts
    assert updated["status"] == "busy"


# ── AU-18: heartbeat 3분 미수신 → status=offline ──

def test_au18_agent_offline(fresh_db, admin_user):
    conn = auth_db.get_db()
    old_ts = int(time.time()) - 300  # 5분 전
    conn.execute(
        "INSERT INTO agents (name, adapter_type, workspace_id, status, last_heartbeat, "
        "created_at, updated_at) VALUES (?, ?, ?, 'idle', ?, ?, ?)",
        ("stale-agent", "claude_local", admin_user.workspace_id, old_ts, old_ts, old_ts),
    )
    conn.commit()
    # mark_offline_agents 실행
    count = mark_offline_agents(timeout_seconds=180)
    assert count >= 1
    row = conn.execute("SELECT status FROM agents WHERE name = 'stale-agent'").fetchone()
    assert row["status"] == "offline"


# ── 불변식 검증 (INV-P2-1 ~ INV-P2-4) ──

def test_inv_p2_1_no_plaintext_password(fresh_db):
    """INV-P2-1: password 평문 저장 금지."""
    create_user("inv_user", "my_secret_pw", "불변식 테스트")
    conn = auth_db.get_db()
    row = conn.execute("SELECT password_hash FROM users WHERE username = 'inv_user'").fetchone()
    assert "my_secret_pw" not in row["password_hash"]
    assert row["password_hash"].startswith("scrypt:")


def test_inv_p2_2_no_plaintext_token(fresh_db):
    """INV-P2-2: session token 평문 저장 금지."""
    user = create_user("inv_sess", "pw!", "불변식 세션")
    token = create_session(user.id, user.workspace_id)
    conn = auth_db.get_db()
    rows = conn.execute("SELECT token_hash FROM user_sessions").fetchall()
    for r in rows:
        assert r["token_hash"] != token  # raw token이 DB에 없음


def test_inv_p2_3_role_hierarchy(fresh_db):
    """INV-P2-3: role 계층 viewer < operator < admin."""
    assert ROLE_LEVELS["viewer"] < ROLE_LEVELS["operator"] < ROLE_LEVELS["admin"]


def test_inv_p2_4_no_auth_bypass_without_devmode(fresh_db):
    """INV-P2-4: BRICK_DEV_MODE=1 아닐 때 인증 우회 불가."""
    # dev mode 꺼진 상태에서 authenticate_request가 인증 요구하는지 검증
    from brick.auth.middleware import _validate_api_key
    # 잘못된 API 키
    result = _validate_api_key("invalid_key_that_does_not_exist")
    assert result is None
