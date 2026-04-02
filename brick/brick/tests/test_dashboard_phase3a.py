"""BD-57~63, BD-101~131: EventBridge + ConcreteGateExecutor 5종 tests."""

from __future__ import annotations

import asyncio
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from brick.models.events import Event, WorkflowStatus, BlockStatus
from brick.models.gate import GateResult
from brick.models.block import GateHandler, GateConfig, ReviewConfig, Block, DoneCondition
from brick.models.workflow import WorkflowInstance, WorkflowDefinition, BlockInstance
from brick.engine.event_bus import EventBus
from brick.engine.checkpoint import CheckpointStore


# ══════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════


@pytest.fixture
def event_bus():
    return EventBus()


@pytest.fixture
def checkpoint_store(tmp_path):
    return CheckpointStore(base_dir=tmp_path / "checkpoints")


@pytest.fixture
def mock_ws_send():
    return AsyncMock()


@pytest.fixture
def sample_workflow(checkpoint_store):
    """Save a running workflow to checkpoint for snapshot tests."""
    defn = WorkflowDefinition(name="test-wf")
    defn.blocks = [
        Block(id="plan", what="plan", done=DoneCondition()),
        Block(id="do", what="do", done=DoneCondition()),
    ]
    instance = WorkflowInstance.from_definition(defn, feature="feat-1", task="task-1")
    instance.status = WorkflowStatus.RUNNING
    instance.current_block_id = "plan"
    checkpoint_store.save(instance.id, instance)
    return instance


# ══════════════════════════════════════════════════════════════
# BD-57~63: EventBridge
# ══════════════════════════════════════════════════════════════


async def test_bd57_ws_connect_receives_snapshot(event_bus, checkpoint_store, sample_workflow, mock_ws_send):
    """BD-57: WS connect → receives sync.snapshot with workflows[]."""
    from brick.dashboard.event_bridge import EventBridge, WebSocketClient

    bridge = EventBridge(event_bus=event_bus, checkpoint=checkpoint_store)
    client = WebSocketClient(send=mock_ws_send)
    await bridge.connect(client)

    mock_ws_send.assert_called_once()
    msg = json.loads(mock_ws_send.call_args[0][0])
    assert msg["type"] == "sync.snapshot"
    assert isinstance(msg["workflows"], list)
    assert len(msg["workflows"]) >= 1
    wf = msg["workflows"][0]
    assert "id" in wf
    assert "status" in wf


async def test_bd58_engine_event_broadcast(event_bus, checkpoint_store, mock_ws_send):
    """BD-58: Engine event published → WS client receives matching message."""
    from brick.dashboard.event_bridge import EventBridge, WebSocketClient

    bridge = EventBridge(event_bus=event_bus, checkpoint=checkpoint_store)
    client = WebSocketClient(send=mock_ws_send)
    bridge._clients.append(client)

    event = Event(type="block.completed", data={"block_id": "plan", "workflow_id": "wf-1"})
    bridge._on_engine_event(event)

    # broadcast the buffered message
    last_msg = bridge._buffer[-1]["message"]
    await bridge.broadcast(last_msg)

    mock_ws_send.assert_called_once()
    msg = json.loads(mock_ws_send.call_args[0][0])
    assert msg["type"] == "block.completed"
    assert msg["block_id"] == "plan"
    assert msg["workflow_id"] == "wf-1"
    assert "sequence" in msg


async def test_bd59_ws_filter_workflow(event_bus, checkpoint_store):
    """BD-59: WS filter ?workflow=xxx → only matching workflow events received."""
    from brick.dashboard.event_bridge import EventBridge, WebSocketClient

    bridge = EventBridge(event_bus=event_bus, checkpoint=checkpoint_store)

    send_a = AsyncMock()
    send_b = AsyncMock()
    client_a = WebSocketClient(send=send_a, workflow_filter="wf-1")
    client_b = WebSocketClient(send=send_b, workflow_filter="wf-2")
    bridge._clients.extend([client_a, client_b])

    msg_wf1 = {"type": "block.started", "workflow_id": "wf-1"}
    msg_wf2 = {"type": "block.started", "workflow_id": "wf-2"}

    await bridge.broadcast(msg_wf1)
    await bridge.broadcast(msg_wf2)

    # client_a only receives wf-1
    assert send_a.call_count == 1
    assert json.loads(send_a.call_args[0][0])["workflow_id"] == "wf-1"
    # client_b only receives wf-2
    assert send_b.call_count == 1
    assert json.loads(send_b.call_args[0][0])["workflow_id"] == "wf-2"


async def test_bd60_ws_filter_type_prefix(event_bus, checkpoint_store):
    """BD-60: WS filter ?type=block.* → only block.* events, not adapter.*."""
    from brick.dashboard.event_bridge import EventBridge, WebSocketClient

    bridge = EventBridge(event_bus=event_bus, checkpoint=checkpoint_store)

    send = AsyncMock()
    client = WebSocketClient(send=send, type_filter="block.*")
    bridge._clients.append(client)

    await bridge.broadcast({"type": "block.started", "workflow_id": "wf-1"})
    await bridge.broadcast({"type": "block.completed", "workflow_id": "wf-1"})
    await bridge.broadcast({"type": "adapter.ready", "workflow_id": "wf-1"})

    assert send.call_count == 2  # only block.* events


async def test_bd61_ws_reconnect_replay(event_bus, checkpoint_store):
    """BD-61: WS reconnect with last_seq → missed events replayed."""
    from brick.dashboard.event_bridge import EventBridge, WebSocketClient

    bridge = EventBridge(event_bus=event_bus, checkpoint=checkpoint_store)

    # Simulate 3 events in buffer
    for i in range(1, 4):
        bridge._sequence = i
        bridge._buffer.append({
            "message": {"type": f"event.{i}", "sequence": i},
            "time": time.time(),
        })

    send = AsyncMock()
    client = WebSocketClient(send=send, connected_at=time.time())
    await bridge.handle_reconnect(client, last_seq=1)

    # Should receive events with sequence > 1 (i.e., 2 and 3)
    assert send.call_count == 2
    msgs = [json.loads(c[0][0]) for c in send.call_args_list]
    seqs = [m["sequence"] for m in msgs]
    assert seqs == [2, 3]


async def test_bd62_ws_reconnect_gap_full_snapshot(event_bus, checkpoint_store, sample_workflow):
    """BD-62: WS reconnect after 5min gap → full snapshot instead of replay."""
    from brick.dashboard.event_bridge import EventBridge, WebSocketClient

    bridge = EventBridge(event_bus=event_bus, checkpoint=checkpoint_store)

    # Old buffer entries (expired)
    bridge._buffer.append({
        "message": {"type": "old.event", "sequence": 1},
        "time": time.time() - 600,  # 10 min ago
    })

    send = AsyncMock()
    client = WebSocketClient(send=send, connected_at=time.time() - 600)
    await bridge.handle_reconnect(client, last_seq=0)

    send.assert_called_once()
    msg = json.loads(send.call_args[0][0])
    assert msg["type"] == "sync.snapshot"


async def test_bd63_bridge_subscribes_to_eventbus(event_bus, checkpoint_store):
    """BD-63: EventBridge subscribes to Engine EventBus → converts to WS format."""
    from brick.dashboard.event_bridge import EventBridge, WebSocketClient

    bridge = EventBridge(event_bus=event_bus, checkpoint=checkpoint_store)

    # Publish event through Engine EventBus
    event = Event(type="workflow.started", data={"workflow_id": "wf-99"})
    event_bus.publish(event)

    # Should be in bridge buffer
    assert len(bridge._buffer) == 1
    msg = bridge._buffer[0]["message"]
    assert msg["type"] == "workflow.started"
    assert msg["workflow_id"] == "wf-99"
    assert msg["sequence"] == 1


# ══════════════════════════════════════════════════════════════
# BD-101~104: Command Gate
# ══════════════════════════════════════════════════════════════


async def test_bd101_command_gate_exit0_pass():
    """BD-101: command gate exit 0 → passed=True, type='command'."""
    from brick.gates.concrete import ConcreteGateExecutor

    executor = ConcreteGateExecutor()
    handler = GateHandler(type="command", command="echo hello")
    result = await executor.execute(handler, {})

    assert result.passed is True
    assert result.type == "command"
    assert "hello" in result.metadata.get("stdout", result.detail)


async def test_bd102_command_gate_exit1_fail():
    """BD-102: command gate exit 1 → passed=False, stdout/stderr in detail."""
    from brick.gates.concrete import ConcreteGateExecutor

    executor = ConcreteGateExecutor()
    handler = GateHandler(type="command", command="sh -c 'echo err >&2; exit 1'")
    result = await executor.execute(handler, {})

    assert result.passed is False
    assert result.type == "command"
    assert "err" in result.detail or "err" in result.metadata.get("stderr", "")


async def test_bd103_command_gate_timeout():
    """BD-103: command gate timeout → SIGTERM + fail."""
    from brick.gates.concrete import ConcreteGateExecutor

    executor = ConcreteGateExecutor()
    handler = GateHandler(type="command", command="sleep 30", timeout=1)
    result = await executor.execute(handler, {})

    assert result.passed is False
    assert "timeout" in result.detail.lower() or "timed out" in result.detail.lower()
    assert result.type == "command"


async def test_bd104_command_gate_context_substitution():
    """BD-104: command gate context variable substitution ({feature} etc)."""
    from brick.gates.concrete import ConcreteGateExecutor

    executor = ConcreteGateExecutor()
    handler = GateHandler(type="command", command="echo {feature}")
    result = await executor.execute(handler, {"feature": "my-feature"})

    assert result.passed is True
    assert "my-feature" in result.metadata.get("stdout", result.detail)


# ══════════════════════════════════════════════════════════════
# BD-105~109: HTTP Gate
# ══════════════════════════════════════════════════════════════


async def test_bd105_http_gate_200_pass():
    """BD-105: http gate 200 OK → passed=True, type='http'."""
    from brick.gates.concrete import ConcreteGateExecutor

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {}
    mock_response.text = "{}"

    with patch("brick.gates.concrete.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.request = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        executor = ConcreteGateExecutor()
        handler = GateHandler(type="http", url="http://example.com/check")
        result = await executor.execute(handler, {})

    assert result.passed is True
    assert result.type == "http"


async def test_bd106_http_gate_502_fail():
    """BD-106: http gate 502 → passed=False."""
    from brick.gates.concrete import ConcreteGateExecutor

    mock_response = MagicMock()
    mock_response.status_code = 502
    mock_response.json.return_value = {}
    mock_response.text = "Bad Gateway"

    with patch("brick.gates.concrete.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.request = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        executor = ConcreteGateExecutor()
        handler = GateHandler(type="http", url="http://example.com/check")
        result = await executor.execute(handler, {})

    assert result.passed is False
    assert result.type == "http"


async def test_bd107_http_gate_timeout_fail():
    """BD-107: http gate timeout → passed=False."""
    from brick.gates.concrete import ConcreteGateExecutor
    import httpx as _httpx

    with patch("brick.gates.concrete.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=_httpx.TimeoutException("timed out"))
        mock_client.request = AsyncMock(side_effect=_httpx.TimeoutException("timed out"))
        mock_client_cls.return_value = mock_client

        executor = ConcreteGateExecutor()
        handler = GateHandler(type="http", url="http://example.com/check", timeout=1)
        result = await executor.execute(handler, {})

    assert result.passed is False
    assert result.type == "http"


async def test_bd108_http_gate_match_rate_parse():
    """BD-108: http gate response body match_rate auto-parsing."""
    from brick.gates.concrete import ConcreteGateExecutor

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"match_rate": 95.0, "passed": True, "score": 0.95}
    mock_response.text = '{"match_rate": 95.0, "passed": true, "score": 0.95}'

    with patch("brick.gates.concrete.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.request = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        executor = ConcreteGateExecutor()
        handler = GateHandler(type="http", url="http://example.com/check")
        result = await executor.execute(handler, {})

    assert result.passed is True
    assert result.metadata.get("match_rate") == 95.0
    assert result.metadata.get("score") == 0.95


async def test_bd109_http_gate_url_context_substitution():
    """BD-109: http gate URL context variable substitution."""
    from brick.gates.concrete import ConcreteGateExecutor

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {}
    mock_response.text = "{}"

    with patch("brick.gates.concrete.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.request = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        executor = ConcreteGateExecutor()
        handler = GateHandler(type="http", url="http://example.com/{workflow_id}/check")
        result = await executor.execute(handler, {"workflow_id": "wf-42"})

    assert result.passed is True
    # verify URL was substituted (GET uses client.get)
    call_args = mock_client.get.call_args
    called_url = call_args[0][0] if call_args[0] else call_args[1].get("url", "")
    assert "wf-42" in called_url


# ══════════════════════════════════════════════════════════════
# BD-110~115: Prompt Gate
# ══════════════════════════════════════════════════════════════


async def test_bd110_prompt_gate_pass_high_confidence():
    """BD-110: prompt gate pass with confidence 0.9."""
    from brick.gates.concrete import ConcreteGateExecutor

    mock_llm = AsyncMock()
    mock_llm.evaluate = AsyncMock(return_value={"decision": "yes", "confidence": 0.9})

    executor = ConcreteGateExecutor(llm_client=mock_llm)
    handler = GateHandler(type="prompt", prompt="Is this good?", confidence_threshold=0.8)
    result = await executor.execute(handler, {})

    assert result.passed is True
    assert result.type == "prompt"
    assert result.confidence >= 0.8


async def test_bd111_prompt_gate_low_confidence_escalated():
    """BD-111: prompt gate confidence 0.6 (below 0.8 threshold) → escalated."""
    from brick.gates.concrete import ConcreteGateExecutor

    mock_llm = AsyncMock()
    mock_llm.evaluate = AsyncMock(return_value={"decision": "yes", "confidence": 0.6})

    executor = ConcreteGateExecutor(llm_client=mock_llm)
    handler = GateHandler(type="prompt", prompt="Is this good?", confidence_threshold=0.8)
    result = await executor.execute(handler, {})

    assert result.passed is False
    assert result.confidence < 0.8
    assert "escalat" in result.detail.lower() or result.metadata.get("status") == "escalated"


async def test_bd112_prompt_gate_majority_pass():
    """BD-112: prompt gate majority 3 votes: 2 pass → overall pass."""
    from brick.gates.concrete import ConcreteGateExecutor

    call_count = 0

    async def mock_evaluate(prompt, model):
        nonlocal call_count
        call_count += 1
        if call_count <= 2:
            return {"decision": "yes", "confidence": 0.85}
        return {"decision": "no", "confidence": 0.85}

    mock_llm = AsyncMock()
    mock_llm.evaluate = mock_evaluate

    executor = ConcreteGateExecutor(llm_client=mock_llm)
    handler = GateHandler(type="prompt", prompt="Check", confidence_threshold=0.8, retries=3)
    result = await executor.execute(handler, {})

    assert result.passed is True


async def test_bd113_prompt_gate_majority_fail():
    """BD-113: prompt gate majority 3 votes: 2 fail → overall fail."""
    from brick.gates.concrete import ConcreteGateExecutor

    call_count = 0

    async def mock_evaluate(prompt, model):
        nonlocal call_count
        call_count += 1
        if call_count <= 1:
            return {"decision": "yes", "confidence": 0.85}
        return {"decision": "no", "confidence": 0.85}

    mock_llm = AsyncMock()
    mock_llm.evaluate = mock_evaluate

    executor = ConcreteGateExecutor(llm_client=mock_llm)
    handler = GateHandler(type="prompt", prompt="Check", confidence_threshold=0.8, retries=3)
    result = await executor.execute(handler, {})

    assert result.passed is False


async def test_bd114_prompt_gate_json_parse_retry():
    """BD-114: prompt gate JSON parse failure → retry 2x then fail."""
    from brick.gates.concrete import ConcreteGateExecutor

    mock_llm = AsyncMock()
    mock_llm.evaluate = AsyncMock(side_effect=json.JSONDecodeError("err", "", 0))

    executor = ConcreteGateExecutor(llm_client=mock_llm)
    handler = GateHandler(type="prompt", prompt="Check", retries=1)
    result = await executor.execute(handler, {})

    assert result.passed is False
    assert "parse" in result.detail.lower() or "json" in result.detail.lower()
    # Should have retried up to 2 additional times (3 total attempts)
    assert mock_llm.evaluate.call_count >= 2


async def test_bd115_prompt_gate_context_substitution():
    """BD-115: prompt gate context variable substitution."""
    from brick.gates.concrete import ConcreteGateExecutor

    captured_prompt = None

    async def mock_evaluate(prompt, model):
        nonlocal captured_prompt
        captured_prompt = prompt
        return {"decision": "yes", "confidence": 0.9}

    mock_llm = AsyncMock()
    mock_llm.evaluate = mock_evaluate

    executor = ConcreteGateExecutor(llm_client=mock_llm)
    handler = GateHandler(type="prompt", prompt="Check {feature} quality", confidence_threshold=0.8)
    result = await executor.execute(handler, {"feature": "login-page"})

    assert result.passed is True
    assert "login-page" in captured_prompt


# ══════════════════════════════════════════════════════════════
# BD-116~119: Agent Gate
# ══════════════════════════════════════════════════════════════


async def test_bd116_agent_gate_tool_usage_pass():
    """BD-116: agent gate tool usage → pass with turns and tools_used."""
    from brick.gates.concrete import ConcreteGateExecutor

    mock_runner = AsyncMock()
    mock_runner.run = AsyncMock(return_value={
        "verdict": "pass",
        "analysis": "All checks passed",
        "confidence": 0.95,
        "turns": 3,
        "tools_used": ["Read", "Grep"],
        "execution_log": [
            {"turn": 1, "tool": "Read", "result": "ok"},
            {"turn": 2, "tool": "Grep", "result": "found"},
            {"turn": 3, "tool": "Read", "result": "ok"},
        ],
    })

    executor = ConcreteGateExecutor(agent_runner=mock_runner)
    handler = GateHandler(type="agent", agent_prompt="Check code quality")
    result = await executor.execute(handler, {})

    assert result.passed is True
    assert result.type == "agent"
    assert result.metadata.get("turns") == 3
    assert "Read" in result.metadata.get("tools_used", [])


async def test_bd117_agent_gate_max_turns_exceeded():
    """BD-117: agent gate max turns exceeded → warning."""
    from brick.gates.concrete import ConcreteGateExecutor

    mock_runner = AsyncMock()
    mock_runner.run = AsyncMock(return_value={
        "verdict": "pass",
        "analysis": "Partial result — max turns reached",
        "confidence": 0.7,
        "turns": 10,
        "max_turns_exceeded": True,
        "tools_used": ["Read"],
        "execution_log": [],
    })

    executor = ConcreteGateExecutor(agent_runner=mock_runner)
    handler = GateHandler(type="agent", agent_prompt="Deep analysis")
    result = await executor.execute(handler, {})

    assert result.metadata.get("max_turns_exceeded") is True or "warning" in result.detail.lower() or result.metadata.get("warning")


async def test_bd118_agent_gate_bash_disabled():
    """BD-118: agent gate Bash tool disabled by default."""
    from brick.gates.concrete import ConcreteGateExecutor

    captured_tools = None

    async def mock_run(prompt, tools=None, timeout=30):
        nonlocal captured_tools
        captured_tools = tools
        return {"verdict": "pass", "analysis": "ok", "confidence": 0.9, "turns": 1, "tools_used": [], "execution_log": []}

    mock_runner = AsyncMock()
    mock_runner.run = mock_run

    executor = ConcreteGateExecutor(agent_runner=mock_runner)
    handler = GateHandler(type="agent", agent_prompt="Check")
    result = await executor.execute(handler, {})

    # Bash should not be in the tools list (either explicitly excluded or not present)
    assert captured_tools is not None
    assert "Bash" not in (captured_tools or [])


async def test_bd119_agent_gate_per_turn_log():
    """BD-119: agent gate per-turn execution log."""
    from brick.gates.concrete import ConcreteGateExecutor

    mock_runner = AsyncMock()
    exec_log = [
        {"turn": 1, "tool": "Read", "result": "file read"},
        {"turn": 2, "tool": "Grep", "result": "pattern found"},
    ]
    mock_runner.run = AsyncMock(return_value={
        "verdict": "pass",
        "analysis": "ok",
        "confidence": 0.9,
        "turns": 2,
        "tools_used": ["Read", "Grep"],
        "execution_log": exec_log,
    })

    executor = ConcreteGateExecutor(agent_runner=mock_runner)
    handler = GateHandler(type="agent", agent_prompt="Check")
    result = await executor.execute(handler, {})

    assert result.metadata.get("execution_log") == exec_log


# ══════════════════════════════════════════════════════════════
# BD-120~125: Review Gate
# ══════════════════════════════════════════════════════════════


async def test_bd120_review_gate_approval_pass():
    """BD-120: review gate reviewer approval → pass + reviewed_by."""
    from brick.gates.concrete import ConcreteGateExecutor

    executor = ConcreteGateExecutor()
    handler = GateHandler(type="review", timeout=10)
    # Simulate approval via context
    context = {
        "review_action": "approve",
        "reviewer": "smith",
    }
    result = await executor.execute(handler, context)

    assert result.passed is True
    assert result.type == "review"
    assert result.metadata.get("reviewed_by") == "smith"


async def test_bd121_review_gate_rejection_fail():
    """BD-121: review gate reviewer rejection → fail + reject_reason."""
    from brick.gates.concrete import ConcreteGateExecutor

    executor = ConcreteGateExecutor()
    handler = GateHandler(type="review", timeout=10)
    context = {
        "review_action": "reject",
        "reviewer": "smith",
        "reject_reason": "Missing test coverage",
    }
    result = await executor.execute(handler, context)

    assert result.passed is False
    assert result.type == "review"
    assert result.metadata.get("reject_reason") == "Missing test coverage"


async def test_bd122_review_gate_timeout_escalate():
    """BD-122: review gate timeout → escalate."""
    from brick.gates.concrete import ConcreteGateExecutor

    executor = ConcreteGateExecutor()
    handler = GateHandler(type="review", timeout=10, on_fail="escalate")
    context = {"review_action": "timeout"}
    result = await executor.execute(handler, context)

    assert result.passed is False
    assert result.metadata.get("status") == "escalated"


async def test_bd123_review_gate_timeout_auto_approve():
    """BD-123: review gate timeout → auto_approve."""
    from brick.gates.concrete import ConcreteGateExecutor

    executor = ConcreteGateExecutor()
    handler = GateHandler(type="review", timeout=10, on_fail="auto_approve")
    context = {"review_action": "timeout"}
    result = await executor.execute(handler, context)

    assert result.passed is True
    assert result.metadata.get("status") == "auto_approved"


async def test_bd124_review_gate_multiple_reviewers_majority():
    """BD-124: review gate multiple reviewers majority approval."""
    from brick.gates.concrete import ConcreteGateExecutor

    executor = ConcreteGateExecutor()
    handler = GateHandler(type="review", timeout=10)
    context = {
        "review_action": "vote",
        "reviews": [
            {"reviewer": "alice", "action": "approve"},
            {"reviewer": "bob", "action": "approve"},
            {"reviewer": "charlie", "action": "reject", "reason": "not ready"},
        ],
    }
    result = await executor.execute(handler, context)

    assert result.passed is True  # 2/3 approved
    assert result.type == "review"


async def test_bd125_review_gate_reject_reason_context():
    """BD-125: review gate reject reason → context injection."""
    from brick.gates.concrete import ConcreteGateExecutor

    executor = ConcreteGateExecutor()
    handler = GateHandler(type="review", timeout=10)
    context = {
        "review_action": "reject",
        "reviewer": "smith",
        "reject_reason": "Needs error handling for edge case X",
    }
    result = await executor.execute(handler, context)

    assert result.passed is False
    assert result.metadata.get("reject_reason") == "Needs error handling for edge case X"
    assert result.metadata.get("reviewed_by") == "smith"


# ══════════════════════════════════════════════════════════════
# BD-126~131: Gate Combo
# ══════════════════════════════════════════════════════════════


async def test_bd126_combo_sequential_fail_fast():
    """BD-126: Gate combo sequential: first fail → second not executed."""
    from brick.gates.concrete import ConcreteGateExecutor

    execution_order = []

    class TrackingExecutor(ConcreteGateExecutor):
        async def execute(self, handler, context):
            execution_order.append(handler.type)
            if handler.command == "fail":
                return GateResult(passed=False, detail="failed", type=handler.type)
            return GateResult(passed=True, detail="ok", type=handler.type)

    executor = TrackingExecutor()
    block = Block(id="test", what="test", done=DoneCondition(), gate=GateConfig(
        handlers=[
            GateHandler(type="command", command="fail"),
            GateHandler(type="command", command="pass"),
        ],
        evaluation="sequential",
    ))
    bi = BlockInstance(block=block)
    result = await executor.run_gates(bi, {})

    assert result.passed is False
    assert len(execution_order) == 1  # second handler NOT executed


async def test_bd127_combo_parallel_all_pass():
    """BD-127: Gate combo parallel: all pass → overall pass."""
    from brick.gates.concrete import ConcreteGateExecutor

    class AllPassExecutor(ConcreteGateExecutor):
        async def execute(self, handler, context):
            return GateResult(passed=True, detail="ok", type=handler.type)

    executor = AllPassExecutor()
    block = Block(id="test", what="test", done=DoneCondition(), gate=GateConfig(
        handlers=[
            GateHandler(type="command", command="a"),
            GateHandler(type="http", url="http://a"),
        ],
        evaluation="parallel",
    ))
    bi = BlockInstance(block=block)
    result = await executor.run_gates(bi, {})

    assert result.passed is True


async def test_bd128_combo_parallel_one_fail():
    """BD-128: Gate combo parallel: one fail → overall fail."""
    from brick.gates.concrete import ConcreteGateExecutor

    class MixedExecutor(ConcreteGateExecutor):
        async def execute(self, handler, context):
            if handler.type == "http":
                return GateResult(passed=False, detail="http fail", type="http")
            return GateResult(passed=True, detail="ok", type=handler.type)

    executor = MixedExecutor()
    block = Block(id="test", what="test", done=DoneCondition(), gate=GateConfig(
        handlers=[
            GateHandler(type="command", command="a"),
            GateHandler(type="http", url="http://a"),
        ],
        evaluation="parallel",
    ))
    bi = BlockInstance(block=block)
    result = await executor.run_gates(bi, {})

    assert result.passed is False


async def test_bd129_combo_auto_pass_triggers_review_waiting():
    """BD-129: Gate combo: auto pass → review gate activation (status='waiting')."""
    from brick.gates.concrete import ConcreteGateExecutor

    executor = ConcreteGateExecutor()
    block = Block(id="test", what="test", done=DoneCondition(), gate=GateConfig(
        handlers=[
            GateHandler(type="command", command="echo ok"),
            GateHandler(type="review", timeout=10),
        ],
        evaluation="sequential",
    ))
    bi = BlockInstance(block=block)
    result = await executor.run_gates(bi, {})

    # Review gate returns waiting status (not passed yet)
    assert result.passed is False or result.metadata.get("status") == "waiting"


async def test_bd130_combo_auto_fail_review_not_reached():
    """BD-130: Gate combo: auto fail → review not reached (status='not_reached')."""
    from brick.gates.concrete import ConcreteGateExecutor

    executor = ConcreteGateExecutor()
    block = Block(id="test", what="test", done=DoneCondition(), gate=GateConfig(
        handlers=[
            GateHandler(type="command", command="sh -c 'exit 1'"),
            GateHandler(type="review", timeout=10),
        ],
        evaluation="sequential",
    ))
    bi = BlockInstance(block=block)
    result = await executor.run_gates(bi, {})

    # First gate fails → sequential short-circuits → review never reached
    assert result.passed is False
    assert result.type == "command"


async def test_bd131_gate_indicator_per_type_status():
    """BD-131: GateIndicator: per-type status tracking."""
    from brick.gates.concrete import ConcreteGateExecutor

    results_tracker = []

    class TrackingExecutor(ConcreteGateExecutor):
        async def execute(self, handler, context):
            r = GateResult(passed=True, detail="ok", type=handler.type, metadata={"handler_type": handler.type})
            results_tracker.append(r)
            return r

    executor = TrackingExecutor()
    block = Block(id="test", what="test", done=DoneCondition(), gate=GateConfig(
        handlers=[
            GateHandler(type="command", command="a"),
            GateHandler(type="http", url="http://a"),
            GateHandler(type="prompt", prompt="check"),
        ],
        evaluation="sequential",
    ))
    bi = BlockInstance(block=block)
    result = await executor.run_gates(bi, {})

    assert result.passed is True
    # Verify all types were tracked
    types_executed = [r.type for r in results_tracker]
    assert "command" in types_executed
    assert "http" in types_executed
    assert "prompt" in types_executed
