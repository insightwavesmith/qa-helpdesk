"""SID-001 ~ SID-010: session-id 자동 전파 테스트.

claude_local.py stdout에서 session_id 파싱 → context 저장 → 다음 블록 자동 주입.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from brick.adapters.claude_local import ClaudeLocalAdapter
from brick.models.block import Block, DoneCondition


# ── Helpers ──────────────────────────────────────────────────

def _make_adapter(tmp_path: Path, **overrides) -> ClaudeLocalAdapter:
    config = {
        "runtimeDir": str(tmp_path),
        "role": "cto-lead",
        **overrides,
    }
    return ClaudeLocalAdapter(config)


def _make_block(block_id: str = "b1") -> Block:
    return Block(id=block_id, what="테스트 블록", done=DoneCondition())


def _stream_json_with_session_id(session_id: str) -> bytes:
    """session_id가 포함된 stream-json stdout 생성."""
    lines = [
        json.dumps({"type": "system", "session_id": session_id}),
        json.dumps({"type": "assistant", "content": "hello"}),
        json.dumps({"type": "result", "result": "done"}),
    ]
    return "\n".join(lines).encode()


def _stream_json_without_session_id() -> bytes:
    """session_id가 없는 stream-json stdout."""
    lines = [
        json.dumps({"type": "assistant", "content": "hello"}),
        json.dumps({"type": "result", "result": "done"}),
    ]
    return "\n".join(lines).encode()


# ── SID-001: 유효한 stream-json → session_id 추출 ──────────

def test_sid001_parse_valid_session_id(tmp_path: Path):
    adapter = _make_adapter(tmp_path)
    stdout = _stream_json_with_session_id("abc-123-def")
    result = adapter._parse_session_id(stdout)
    assert result == "abc-123-def"


# ── SID-002: session_id 없는 stdout → 빈 문자열 ────────────

def test_sid002_parse_no_session_id(tmp_path: Path):
    adapter = _make_adapter(tmp_path)
    stdout = _stream_json_without_session_id()
    result = adapter._parse_session_id(stdout)
    assert result == ""


# ── SID-003: 잘못된 JSON 라인 → 스킵 ───────────────────────

def test_sid003_parse_invalid_json_skipped(tmp_path: Path):
    adapter = _make_adapter(tmp_path)
    stdout = b"not-json\n{broken\n" + json.dumps(
        {"type": "system", "session_id": "valid-id"}
    ).encode()
    result = adapter._parse_session_id(stdout)
    assert result == "valid-id"


# ── SID-004: _save_session_id → JSON 파일 생성 ─────────────

def test_sid004_save_session_id(tmp_path: Path):
    adapter = _make_adapter(tmp_path)
    adapter._save_session_id("b1", "session-aaa")

    path = tmp_path / "session-ids.json"
    assert path.exists()
    data = json.loads(path.read_text())
    assert data["cto-lead"] == "session-aaa"


# ── SID-005: _load_session_id → 저장된 값 반환 ─────────────

def test_sid005_load_session_id(tmp_path: Path):
    adapter = _make_adapter(tmp_path)
    # 먼저 저장
    adapter._save_session_id("b1", "session-bbb")
    # 로드
    result = adapter._load_session_id("cto-lead")
    assert result == "session-bbb"


# ── SID-006: _load_session_id → 파일 없으면 빈 문자열 ──────

def test_sid006_load_no_file(tmp_path: Path):
    adapter = _make_adapter(tmp_path)
    result = adapter._load_session_id("cto-lead")
    assert result == ""


# ── SID-007: start_block context에 session_ids → 자동 주입 ─

@pytest.mark.asyncio
async def test_sid007_start_block_injects_session_id(tmp_path: Path):
    adapter = _make_adapter(tmp_path)
    block = _make_block()
    context = {
        "session_ids": {"cto-lead": "prev-session-xyz"},
    }

    with patch.object(adapter, "_build_env", return_value={}), \
         patch("asyncio.create_subprocess_exec", new_callable=AsyncMock) as mock_exec:
        mock_proc = MagicMock()
        mock_proc.stdin = MagicMock()
        mock_proc.stdin.write = MagicMock()
        mock_proc.stdin.close = MagicMock()
        mock_proc.stdout = AsyncMock()
        mock_proc.stderr = AsyncMock()
        mock_proc.returncode = None
        mock_exec.return_value = mock_proc

        await adapter.start_block(block, context)

    # session_id와 continue_session이 설정되었는지 확인
    assert adapter.session_id == "prev-session-xyz"
    assert adapter.continue_session is True
    # _build_args에 반영 확인
    args = adapter._build_args()
    assert "--continue" in args
    assert "--session-id" in args
    idx = args.index("--session-id")
    assert args[idx + 1] == "prev-session-xyz"


# ── SID-008: 다른 팀 session_id는 무시 ─────────────────────

@pytest.mark.asyncio
async def test_sid008_start_block_ignores_other_team(tmp_path: Path):
    adapter = _make_adapter(tmp_path)
    block = _make_block()
    context = {
        "session_ids": {"pm-lead": "other-session-999"},
    }

    with patch.object(adapter, "_build_env", return_value={}), \
         patch("asyncio.create_subprocess_exec", new_callable=AsyncMock) as mock_exec:
        mock_proc = MagicMock()
        mock_proc.stdin = MagicMock()
        mock_proc.stdin.write = MagicMock()
        mock_proc.stdin.close = MagicMock()
        mock_proc.stdout = AsyncMock()
        mock_proc.stderr = AsyncMock()
        mock_proc.returncode = None
        mock_exec.return_value = mock_proc

        await adapter.start_block(block, context)

    # cto-lead 어댑터는 pm-lead 세션을 사용하지 않아야 함
    assert adapter.session_id == ""
    assert adapter.continue_session is False


# ── SID-009: _build_args에 continue + session_id 둘 다 포함 ─

def test_sid009_build_args_both_flags(tmp_path: Path):
    adapter = _make_adapter(tmp_path)
    adapter.continue_session = True
    adapter.session_id = "test-session-id"

    args = adapter._build_args()
    assert "--continue" in args
    assert "--session-id" in args
    idx = args.index("--session-id")
    assert args[idx + 1] == "test-session-id"


# ── SID-010: 전체 플로우 — stdout 파싱 → 저장 → 다음 블록 로드 ─

def test_sid010_full_flow(tmp_path: Path):
    """stdout 파싱 → save → load → 다음 블록에서 _get_team_key로 조회."""
    adapter = _make_adapter(tmp_path)

    # 1. stdout 파싱
    stdout = _stream_json_with_session_id("flow-session-001")
    parsed = adapter._parse_session_id(stdout)
    assert parsed == "flow-session-001"

    # 2. 저장
    adapter._save_session_id("b1", parsed)

    # 3. 같은 팀 키로 로드
    team_key = adapter._get_team_key()
    loaded = adapter._load_session_id(team_key)
    assert loaded == "flow-session-001"

    # 4. 새 어댑터(같은 팀)에서 로드 — 파일 공유 시나리오
    adapter2 = _make_adapter(tmp_path)
    loaded2 = adapter2._load_session_id(adapter2._get_team_key())
    assert loaded2 == "flow-session-001"


# ── _get_team_key 보조 테스트 ────────────────────────────────

def test_get_team_key_from_session_name(tmp_path: Path):
    adapter = _make_adapter(tmp_path, env={"SESSION_NAME": "my-session"})
    assert adapter._get_team_key() == "my-session"


def test_get_team_key_fallback_to_role(tmp_path: Path):
    adapter = _make_adapter(tmp_path)
    assert adapter._get_team_key() == "cto-lead"


def test_get_team_key_empty(tmp_path: Path):
    adapter = _make_adapter(tmp_path, role="", env={})
    assert adapter._get_team_key() == ""


# ── _save_session_id 다수 팀 저장 ────────────────────────────

def test_save_multiple_teams(tmp_path: Path):
    adapter1 = _make_adapter(tmp_path, role="cto-lead")
    adapter2 = _make_adapter(tmp_path, role="pm-lead")

    adapter1._save_session_id("b1", "sid-cto")
    adapter2._save_session_id("b2", "sid-pm")

    path = tmp_path / "session-ids.json"
    data = json.loads(path.read_text())
    assert data["cto-lead"] == "sid-cto"
    assert data["pm-lead"] == "sid-pm"
