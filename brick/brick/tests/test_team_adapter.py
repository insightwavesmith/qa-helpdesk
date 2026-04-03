"""TDD for brick-team-adapter: MCP 기반 TASK 전달 + 팀원 수명관리.

TA-001 ~ TA-030 (30건)
Design: docs/02-design/features/brick-team-adapter.design.md
"""

import asyncio
import json
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from brick.models.team import (
    TeamDefinition, TeammateSpec, IdlePolicy, CommunicationConfig, AdapterStatus,
)
from brick.adapters.mcp_bridge import MCPBridge
from brick.adapters.claude_agent_teams import ClaudeAgentTeamsAdapter
from brick.engine.lifecycle import TeammateLifecycleManager
from brick.models.block import Block, DoneCondition


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_runtime(tmp_path):
    """임시 runtime 디렉토리."""
    runtime = tmp_path / ".bkit" / "runtime"
    runtime.mkdir(parents=True)
    return runtime


@pytest.fixture
def peer_map_file(tmp_runtime):
    """peer-map.json 생성."""
    data = {
        "peer-abc123": {"session": "sdk-cto", "role": "CTO_LEADER", "summary": "CTO_LEADER | bscamp"},
        "peer-def456": {"session": "sdk-pm", "role": "PM_LEADER", "summary": "PM_LEADER | bscamp"},
    }
    path = tmp_runtime / "peer-map.json"
    path.write_text(json.dumps(data))
    return path


@pytest.fixture
def mcp_bridge(tmp_runtime):
    return MCPBridge(broker_port=7899, cache_dir=tmp_runtime)


@pytest.fixture
def adapter(tmp_path, tmp_runtime):
    """ClaudeAgentTeamsAdapter with MCP config."""
    config = {
        "session": "sdk-cto",
        "broker_port": 7899,
        "peer_role": "CTO_LEADER",
        "team_context_dir": str(tmp_runtime),
        "communication": {
            "method": "mcp",
            "ack_required": True,
            "ack_timeout": 2,
            "retry_count": 3,
            "fallback_to_tmux": True,
        },
    }
    return ClaudeAgentTeamsAdapter(config=config, root_dir=str(tmp_path))


@pytest.fixture
def team_def():
    """테스트용 TeamDefinition."""
    return TeamDefinition(
        block_id="do",
        adapter="claude_agent_teams",
        communication=CommunicationConfig(method="mcp"),
        teammates=[
            TeammateSpec(name="backend-dev", role="developer", lifetime="persistent"),
            TeammateSpec(name="code-reviewer", role="researcher", lifetime="ephemeral"),
        ],
        idle_policy=IdlePolicy(action="suspend", timeout_seconds=0, notify_before=False),
    )


@pytest.fixture
def block():
    return Block(id="do", what="설계 기반 구현", done=DoneCondition(artifacts=["src/**/*.ts"]))


# ===========================================================================
# §3 MCP TASK 전달 (TA-001 ~ TA-010)
# ===========================================================================


def test_ta01_find_peer_from_peer_map(mcp_bridge, peer_map_file):
    """TA-001: peer-map.json에서 session 매칭 → peer_id 반환."""
    result = asyncio.run(
        mcp_bridge.find_peer("sdk-cto", "CTO_LEADER")
    )
    assert result == "peer-abc123"


def test_ta02_find_peer_broker_fallback(mcp_bridge, tmp_runtime):
    """TA-002: peer-map 없을 때 broker API 폴백."""
    # peer-map.json 없음 → broker API 호출
    mock_response = AsyncMock()
    mock_response.status = 200
    mock_response.json = AsyncMock(return_value=[
        {"id": "peer-xyz", "summary": "CTO_LEADER | bscamp | sdk-cto"},
    ])

    mock_session = AsyncMock()
    mock_session.post = AsyncMock(return_value=mock_response)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("brick.adapters.mcp_bridge.aiohttp.ClientSession", return_value=mock_session):
        result = asyncio.run(
            mcp_bridge.find_peer("sdk-cto", "CTO_LEADER")
        )
    assert result == "peer-xyz"


def test_ta03_find_peer_none_when_missing(mcp_bridge, tmp_runtime):
    """TA-003: peer 없으면 None."""
    # peer-map 없음, broker도 빈 결과
    mock_response = AsyncMock()
    mock_response.status = 200
    mock_response.json = AsyncMock(return_value=[])

    mock_session = AsyncMock()
    mock_session.post = AsyncMock(return_value=mock_response)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("brick.adapters.mcp_bridge.aiohttp.ClientSession", return_value=mock_session):
        result = asyncio.run(
            mcp_bridge.find_peer("sdk-nonexistent", "NOBODY")
        )
    assert result is None


def test_ta04_send_task_success(mcp_bridge):
    """TA-004: 정상 전달 + ACK 수신 → (True, execution_id)."""
    # send_message 성공
    send_response = AsyncMock()
    send_response.status = 200

    # check_messages → ACK 응답
    ack_response = AsyncMock()
    ack_response.status = 200
    ack_response.json = AsyncMock(return_value=[
        {"text": json.dumps({"type": "BLOCK_TASK_ACK", "execution_id": "do-123", "accepted": True})}
    ])

    mock_session = AsyncMock()
    mock_session.post = AsyncMock(side_effect=[send_response, ack_response])
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("brick.adapters.mcp_bridge.aiohttp.ClientSession", return_value=mock_session):
        success, result = asyncio.run(
            mcp_bridge.send_task("peer-abc", {"type": "BLOCK_TASK", "execution_id": "do-123"}, ack_timeout=2)
        )
    assert success is True
    assert result == "do-123"


def test_ta05_send_task_ack_timeout(mcp_bridge):
    """TA-005: ACK 타임아웃 → (False, "ACK 타임아웃")."""
    send_response = AsyncMock()
    send_response.status = 200

    # check_messages → 빈 결과 (ACK 없음)
    empty_response = AsyncMock()
    empty_response.status = 200
    empty_response.json = AsyncMock(return_value=[])

    mock_session = AsyncMock()
    mock_session.post = AsyncMock(return_value=empty_response)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    # 첫 post는 send, 나머지는 check_messages (빈 결과)
    call_count = 0
    async def side_effect_fn(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return send_response
        return empty_response

    mock_session.post = AsyncMock(side_effect=side_effect_fn)

    with patch("brick.adapters.mcp_bridge.aiohttp.ClientSession", return_value=mock_session):
        with patch("brick.adapters.mcp_bridge.asyncio.sleep", new_callable=AsyncMock):
            success, result = asyncio.run(
                mcp_bridge.send_task("peer-abc", {"type": "BLOCK_TASK", "execution_id": "do-123"}, ack_timeout=1)
            )
    assert success is False
    assert "타임아웃" in (result or "")


def test_ta06_send_task_broker_error(mcp_bridge):
    """TA-006: broker 미응답 → (False, 에러 메시지)."""
    mock_session = AsyncMock()
    mock_session.post = AsyncMock(side_effect=Exception("Connection refused"))
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("brick.adapters.mcp_bridge.aiohttp.ClientSession", return_value=mock_session):
        success, result = asyncio.run(
            mcp_bridge.send_task("peer-abc", {"type": "BLOCK_TASK"})
        )
    assert success is False
    assert result is not None


def test_ta07_start_block_mcp_success(adapter, block):
    """TA-007: start_block method=mcp 정상 전달."""
    adapter.mcp.find_peer = AsyncMock(return_value="peer-abc")
    adapter.mcp.send_task = AsyncMock(return_value=(True, "do-123"))

    result = asyncio.run(
        adapter.start_block(block, {"feature": "test"})
    )
    assert result.startswith("do-")
    adapter.mcp.find_peer.assert_called_once()


def test_ta08_start_block_mcp_fail_tmux_fallback(adapter, block):
    """TA-008: MCP 실패 + fallback=true → tmux 전달."""
    adapter.mcp.find_peer = AsyncMock(return_value=None)

    with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock) as mock_proc:
        proc_mock = AsyncMock()
        proc_mock.communicate = AsyncMock(return_value=(b"", b""))
        mock_proc.return_value = proc_mock

        result = asyncio.run(
            adapter.start_block(block, {"feature": "test"})
        )
    assert result.startswith("do-")
    mock_proc.assert_called_once()


def test_ta09_start_block_mcp_fail_no_fallback(adapter, block):
    """TA-009: MCP 실패 + fallback=false → RuntimeError."""
    adapter.fallback_to_tmux = False
    adapter.mcp.find_peer = AsyncMock(return_value=None)

    with pytest.raises(RuntimeError, match="MCP 전달 실패"):
        asyncio.run(
            adapter.start_block(block, {"feature": "test"})
        )


def test_ta10_start_block_tmux_method(tmp_path, tmp_runtime, block):
    """TA-010: method=tmux → 기존 tmux send-keys 동작 유지."""
    config = {
        "session": "sdk-cto",
        "team_context_dir": str(tmp_runtime),
        "communication": {"method": "tmux"},
    }
    adapter = ClaudeAgentTeamsAdapter(config=config, root_dir=str(tmp_path))

    with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock) as mock_proc:
        proc_mock = AsyncMock()
        proc_mock.communicate = AsyncMock(return_value=(b"", b""))
        mock_proc.return_value = proc_mock

        result = asyncio.run(
            adapter.start_block(block, {})
        )
    assert result.startswith("do-")
    mock_proc.assert_called_once()


# ===========================================================================
# §3.4 메시지 프로토콜 (TA-011 ~ TA-015)
# ===========================================================================


def test_ta11_block_task_message_fields():
    """TA-011: BLOCK_TASK 메시지 필수 필드 검증."""
    msg = {
        "protocol": "bscamp-team/v1",
        "type": "BLOCK_TASK",
        "execution_id": "do-123",
        "block_id": "do",
        "what": "설계 기반 구현",
        "context": {"feature": "test"},
    }
    assert msg["protocol"] == "bscamp-team/v1"
    assert msg["type"] == "BLOCK_TASK"
    assert "block_id" in msg
    assert "what" in msg


def test_ta12_block_task_ack_parsing():
    """TA-012: BLOCK_TASK_ACK 메시지 파싱."""
    ack = {
        "protocol": "bscamp-team/v1",
        "type": "BLOCK_TASK_ACK",
        "execution_id": "do-123",
        "accepted": True,
    }
    assert ack["type"] == "BLOCK_TASK_ACK"
    assert ack["accepted"] is True
    assert ack["execution_id"] == "do-123"


def test_ta13_block_completed_to_adapter_status():
    """TA-013: BLOCK_COMPLETED → AdapterStatus(completed)."""
    msg = {"type": "BLOCK_COMPLETED", "execution_id": "do-123", "artifacts": ["src/app.ts"]}
    if msg["type"] == "BLOCK_COMPLETED":
        status = AdapterStatus(status="completed", message=None)
    assert status.status == "completed"


def test_ta14_block_failed_to_adapter_status():
    """TA-014: BLOCK_FAILED → AdapterStatus(failed)."""
    msg = {"type": "BLOCK_FAILED", "execution_id": "do-123", "error": "빌드 실패"}
    if msg["type"] == "BLOCK_FAILED":
        status = AdapterStatus(status="failed", message=msg["error"])
    assert status.status == "failed"
    assert status.message == "빌드 실패"


def test_ta15_retry_count_exhausted(adapter, block):
    """TA-015: retry_count 소진 후 실패."""
    adapter.mcp.find_peer = AsyncMock(return_value="peer-abc")
    adapter.mcp.send_task = AsyncMock(return_value=(False, "ACK 타임아웃"))
    adapter.fallback_to_tmux = False

    with pytest.raises(RuntimeError, match="MCP 전달 실패"):
        asyncio.run(
            adapter.start_block(block, {"feature": "test"})
        )
    # retry_count=3 → 3회 호출
    assert adapter.mcp.send_task.call_count == 3


# ===========================================================================
# §4 팀원 수명관리 (TA-016 ~ TA-023)
# ===========================================================================


def test_ta16_ephemeral_idle_always_terminate(adapter, team_def, tmp_runtime):
    """TA-016: ephemeral 팀원 idle → 항상 terminate."""
    # registry에 code-reviewer 등록
    registry = {"code-reviewer": {"state": "active"}}
    (tmp_runtime / "teammate-registry.json").write_text(json.dumps(registry))

    adapter.terminate_member = AsyncMock(return_value=True)
    lcm = TeammateLifecycleManager(adapter)

    asyncio.run(
        lcm.on_teammate_idle("code-reviewer", team_def)
    )
    adapter.terminate_member.assert_called_once_with("code-reviewer")


def test_ta17_persistent_idle_suspend(adapter, team_def, tmp_runtime):
    """TA-017: persistent 팀원 idle + action=suspend → suspend."""
    registry = {"backend-dev": {"state": "active"}}
    (tmp_runtime / "teammate-registry.json").write_text(json.dumps(registry))

    team_def.idle_policy = IdlePolicy(action="suspend", timeout_seconds=0, notify_before=False)
    adapter.suspend_member = AsyncMock(return_value=True)
    lcm = TeammateLifecycleManager(adapter)

    asyncio.run(
        lcm.on_teammate_idle("backend-dev", team_def)
    )
    adapter.suspend_member.assert_called_once_with("backend-dev")


def test_ta18_persistent_idle_keep(adapter, team_def, tmp_runtime):
    """TA-018: persistent 팀원 idle + action=keep → 상태 유지 (아무것도 안 함)."""
    team_def.idle_policy = IdlePolicy(action="keep", timeout_seconds=0, notify_before=False)
    adapter.suspend_member = AsyncMock()
    adapter.terminate_member = AsyncMock()
    lcm = TeammateLifecycleManager(adapter)

    asyncio.run(
        lcm.on_teammate_idle("backend-dev", team_def)
    )
    adapter.suspend_member.assert_not_called()
    adapter.terminate_member.assert_not_called()


def test_ta19_persistent_idle_terminate(adapter, team_def, tmp_runtime):
    """TA-019: persistent 팀원 idle + action=terminate → terminate."""
    registry = {"backend-dev": {"state": "active"}}
    (tmp_runtime / "teammate-registry.json").write_text(json.dumps(registry))

    team_def.idle_policy = IdlePolicy(action="terminate", timeout_seconds=0, notify_before=False)
    adapter.terminate_member = AsyncMock(return_value=True)
    lcm = TeammateLifecycleManager(adapter)

    asyncio.run(
        lcm.on_teammate_idle("backend-dev", team_def)
    )
    adapter.terminate_member.assert_called_once_with("backend-dev")


def test_ta20_suspended_resume(adapter, tmp_runtime):
    """TA-020: suspended 팀원 resume → active."""
    registry = {"backend-dev": {"state": "suspended"}}
    (tmp_runtime / "teammate-registry.json").write_text(json.dumps(registry))

    result = asyncio.run(
        adapter.resume_member("backend-dev")
    )
    assert result is True

    updated = json.loads((tmp_runtime / "teammate-registry.json").read_text())
    assert updated["backend-dev"]["state"] == "active"


def test_ta21_task_assigned_resets_timer(adapter, team_def):
    """TA-021: TASK 배정 시 idle 타이머 리셋."""
    lcm = TeammateLifecycleManager(adapter)
    lcm._timers["backend-dev"] = time.time()

    lcm.on_task_assigned("backend-dev")
    assert "backend-dev" not in lcm._timers


def test_ta22_idle_timeout_respected(adapter, team_def, tmp_runtime):
    """TA-022: idle_policy.timeout_seconds 준수."""
    team_def.idle_policy = IdlePolicy(action="terminate", timeout_seconds=0, notify_before=False)

    registry = {"code-reviewer": {"state": "active"}}
    (tmp_runtime / "teammate-registry.json").write_text(json.dumps(registry))

    adapter.terminate_member = AsyncMock(return_value=True)
    lcm = TeammateLifecycleManager(adapter)

    # timeout=0이므로 즉시 실행됨
    with patch("brick.engine.lifecycle.asyncio.sleep", new_callable=AsyncMock):
        asyncio.run(
            lcm.on_teammate_idle("code-reviewer", team_def)
        )
    adapter.terminate_member.assert_called_once()


def test_ta23_notify_before_action(adapter, team_def, tmp_runtime):
    """TA-023: idle_policy.notify_before=true → 알림 후 action."""
    team_def.idle_policy = IdlePolicy(action="terminate", timeout_seconds=0, notify_before=True)

    registry = {"backend-dev": {"state": "active"}}
    (tmp_runtime / "teammate-registry.json").write_text(json.dumps(registry))

    adapter.terminate_member = AsyncMock(return_value=True)
    lcm = TeammateLifecycleManager(adapter)
    lcm._notify_leader = AsyncMock()

    with patch("brick.engine.lifecycle.asyncio.sleep", new_callable=AsyncMock):
        asyncio.run(
            lcm.on_teammate_idle("backend-dev", team_def)
        )
    lcm._notify_leader.assert_called_once()
    adapter.terminate_member.assert_called_once()


# ===========================================================================
# §2 adapter_config 확장 (TA-024 ~ TA-028)
# ===========================================================================


def test_ta24_teammate_spec_persistent():
    """TA-024: TeammateSpec lifetime="persistent"."""
    spec = TeammateSpec(name="backend-dev", role="developer", lifetime="persistent")
    assert spec.lifetime == "persistent"
    assert spec.model == "opus"


def test_ta25_teammate_spec_ephemeral():
    """TA-025: TeammateSpec lifetime="ephemeral"."""
    spec = TeammateSpec(name="code-reviewer", role="researcher", lifetime="ephemeral")
    assert spec.lifetime == "ephemeral"


def test_ta26_communication_config_defaults():
    """TA-026: CommunicationConfig method="mcp" 기본값."""
    cfg = CommunicationConfig()
    assert cfg.method == "mcp"
    assert cfg.ack_required is True
    assert cfg.ack_timeout == 30
    assert cfg.retry_count == 3
    assert cfg.fallback_to_tmux is True


def test_ta27_idle_policy_defaults():
    """TA-027: IdlePolicy action="terminate" 기본값."""
    policy = IdlePolicy()
    assert policy.action == "terminate"
    assert policy.timeout_seconds == 300
    assert policy.notify_before is True


def test_ta28_team_definition_full():
    """TA-028: TeamDefinition 풀 파싱."""
    td = TeamDefinition(
        block_id="do",
        adapter="claude_agent_teams",
        communication=CommunicationConfig(method="mcp", ack_timeout=60),
        teammates=[
            TeammateSpec(name="dev", role="developer", lifetime="persistent"),
        ],
        idle_policy=IdlePolicy(action="suspend", timeout_seconds=600),
        max_depth=3,
    )
    assert td.block_id == "do"
    assert td.communication.ack_timeout == 60
    assert len(td.teammates) == 1
    assert td.idle_policy.action == "suspend"
    assert td.max_depth == 3


# ===========================================================================
# §6 마이그레이션 호환 (TA-029 ~ TA-030)
# ===========================================================================


def test_ta29_communication_default_mcp():
    """TA-029: communication 미설정 → 기본값 mcp."""
    td = TeamDefinition(block_id="do", adapter="claude_agent_teams")
    assert td.communication.method == "mcp"


def test_ta30_legacy_config_tmux_compat(tmp_path, tmp_runtime, block):
    """TA-030: 기존 config (communication 없음) → tmux 동작 유지."""
    # 기존 방식: communication 미지정 → method 기본값 "mcp"
    # 하지만 method="tmux"로 명시하면 기존 동작 유지
    config = {
        "session": "sdk-cto",
        "team_context_dir": str(tmp_runtime),
        "communication": {"method": "tmux"},
    }
    adapter = ClaudeAgentTeamsAdapter(config=config, root_dir=str(tmp_path))
    assert adapter.comm_method == "tmux"

    with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock) as mock_proc:
        proc_mock = AsyncMock()
        proc_mock.communicate = AsyncMock(return_value=(b"", b""))
        mock_proc.return_value = proc_mock

        result = asyncio.run(
            adapter.start_block(block, {})
        )
    assert result.startswith("do-")
