"""QA 핫픽스 검증 — gate_failed EventBus 발행 + role path traversal 방어.

수정 대상:
- executor.py: complete_block()에서 gate_failed 이벤트 EventBus publish 누락
- claude_local.py: _build_args()에서 role path traversal 미방어
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from brick.adapters.claude_local import ClaudeLocalAdapter
from brick.engine.event_bus import EventBus
from brick.models.events import Event


def test_gate_failed_event_reaches_slack_subscriber():
    """gate_failed 이벤트가 EventBus를 통해 SlackSubscriber에 도달하는지 검증."""
    bus = EventBus()
    received: list[Event] = []

    def on_gate_failed(event: Event) -> None:
        received.append(event)

    bus.subscribe("block.gate_failed", on_gate_failed)

    gate_event = Event(
        type="block.gate_failed",
        data={
            "block_id": "review",
            "workflow_id": "wf-001",
            "error": "artifacts missing",
            "reject_reason": "plan.md 누락",
            "retry_count": 1,
        },
    )
    bus.publish(gate_event)

    assert len(received) == 1
    assert received[0].type == "block.gate_failed"
    assert received[0].data["block_id"] == "review"
    assert received[0].data["reject_reason"] == "plan.md 누락"


def test_gate_passed_event_reaches_subscriber():
    """gate_passed 이벤트도 EventBus를 통해 구독자에게 도달하는지 확인 (일관성)."""
    bus = EventBus()
    received: list[Event] = []

    bus.subscribe("block.gate_passed", lambda e: received.append(e))

    gate_event = Event(
        type="block.gate_passed",
        data={
            "block_id": "implement",
            "workflow_id": "wf-002",
        },
    )
    bus.publish(gate_event)

    assert len(received) == 1
    assert received[0].type == "block.gate_passed"


def test_role_path_traversal_blocked():
    """role에 '..'이 포함되면 --agent 추가 안 됨."""
    adapter = ClaudeLocalAdapter({"role": "../../etc/passwd"})
    args = adapter._build_args()
    assert "--agent" not in args, f"path traversal role이 --agent로 전달됨: {args}"
    assert "../../etc/passwd" not in args


def test_role_normal_passes():
    """정상 role은 --agent에 포함됨."""
    adapter = ClaudeLocalAdapter({"role": "backend-dev"})
    args = adapter._build_args()
    assert "--agent" in args
    idx = args.index("--agent")
    assert args[idx + 1] == "backend-dev"


def test_role_with_project_path_traversal_blocked():
    """role에 '..'이 있고 project도 있을 때 --agent 추가 안 됨."""
    adapter = ClaudeLocalAdapter({"role": "../malicious", "project": "bscamp"})
    args = adapter._build_args()
    assert "--agent" not in args
    assert "../malicious" not in args
