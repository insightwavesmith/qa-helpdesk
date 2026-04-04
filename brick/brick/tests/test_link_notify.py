"""Link notify 기능 테스트 — TASK-link-notify.md 기준."""

from unittest.mock import patch, MagicMock

import pytest

from brick.engine.event_bus import EventBus
from brick.engine.state_machine import StateMachine
from brick.engine.slack_subscriber import SlackSubscriber, _format_message
from brick.models.block import Block, DoneCondition, GateConfig
from brick.models.events import Event, BlockStatus, WorkflowStatus
from brick.models.link import LinkDefinition
from brick.models.workflow import (
    WorkflowDefinition, WorkflowInstance, BlockInstance,
)


# ── 헬퍼 ────────────────────────────────────────────────────────────────


def _two_block_workflow(notify: dict | None = None) -> WorkflowInstance:
    """do → qa 2블록 워크플로우 생성. link에 notify 설정 가능."""
    blocks = [
        Block(id="do", what="구현", done=DoneCondition()),
        Block(id="qa", what="검증", done=DoneCondition()),
    ]
    link = LinkDefinition(
        from_block="do",
        to_block="qa",
        type="sequential",
        notify=notify or {},
    )
    defn = WorkflowDefinition(name="test", blocks=blocks, links=[link])
    wf = WorkflowInstance.from_definition(defn, feature="test", task="t1")
    return wf


# ── StateMachine notify 이벤트 발행 테스트 ───────────────────────────────


class TestLinkNotifyEvents:
    def test_notify_on_start_emits_link_started(self):
        """notify.on_start 설정 시 link.started EmitEventCommand 발행."""
        sm = StateMachine()
        wf = _two_block_workflow(notify={"on_start": "slack"})

        # do 블록을 RUNNING → gate_passed까지 진행
        wf.status = WorkflowStatus.RUNNING
        wf.blocks["do"].status = BlockStatus.RUNNING
        wf.current_block_id = "do"

        wf2, cmds1 = sm.transition(wf, Event(type="block.completed", data={"block_id": "do"}))
        wf3, cmds2 = sm.transition(wf2, Event(type="block.gate_passed", data={"block_id": "do"}))

        emit_cmds = [c for c in cmds2 if c.type == "emit_event" and c.event and c.event.type == "link.started"]
        assert len(emit_cmds) == 1
        assert emit_cmds[0].event.data["from_block"] == "do"
        assert emit_cmds[0].event.data["to_block"] == "qa"
        assert emit_cmds[0].event.data["channel"] == "slack"

    def test_notify_on_complete_emits_link_completed(self):
        """notify.on_complete 설정 시 link.completed EmitEventCommand 발행."""
        sm = StateMachine()
        wf = _two_block_workflow(notify={"on_complete": "slack"})

        wf.status = WorkflowStatus.RUNNING
        wf.blocks["do"].status = BlockStatus.RUNNING
        wf.current_block_id = "do"

        wf2, _ = sm.transition(wf, Event(type="block.completed", data={"block_id": "do"}))
        wf3, cmds = sm.transition(wf2, Event(type="block.gate_passed", data={"block_id": "do"}))

        emit_cmds = [c for c in cmds if c.type == "emit_event" and c.event and c.event.type == "link.completed"]
        assert len(emit_cmds) == 1
        assert emit_cmds[0].event.data["from_block"] == "do"
        assert emit_cmds[0].event.data["to_block"] == "qa"

    def test_notify_both_emits_two_events(self):
        """on_start + on_complete 둘 다 설정 시 2개 이벤트 발행."""
        sm = StateMachine()
        wf = _two_block_workflow(notify={"on_start": "slack", "on_complete": "slack"})

        wf.status = WorkflowStatus.RUNNING
        wf.blocks["do"].status = BlockStatus.RUNNING
        wf.current_block_id = "do"

        wf2, _ = sm.transition(wf, Event(type="block.completed", data={"block_id": "do"}))
        wf3, cmds = sm.transition(wf2, Event(type="block.gate_passed", data={"block_id": "do"}))

        link_events = [
            c for c in cmds
            if c.type == "emit_event" and c.event and c.event.type.startswith("link.")
        ]
        assert len(link_events) == 2
        types = {c.event.type for c in link_events}
        assert types == {"link.started", "link.completed"}

    def test_no_notify_no_link_events(self):
        """notify 미설정 Link는 link.* 이벤트 발행 안 함."""
        sm = StateMachine()
        wf = _two_block_workflow(notify={})

        wf.status = WorkflowStatus.RUNNING
        wf.blocks["do"].status = BlockStatus.RUNNING
        wf.current_block_id = "do"

        wf2, _ = sm.transition(wf, Event(type="block.completed", data={"block_id": "do"}))
        wf3, cmds = sm.transition(wf2, Event(type="block.gate_passed", data={"block_id": "do"}))

        link_events = [
            c for c in cmds
            if c.type == "emit_event" and c.event and c.event.type.startswith("link.")
        ]
        assert len(link_events) == 0


# ── SlackSubscriber link 이벤트 구독 테스트 ──────────────────────────────


class TestSlackSubscriberLink:
    def test_subscribes_to_link_events(self):
        """link.started, link.completed 구독 등록 확인."""
        bus = EventBus()
        SlackSubscriber(bus, token="xoxb-test")

        assert len(bus._handlers.get("link.started", [])) == 1
        assert len(bus._handlers.get("link.completed", [])) == 1

    @patch("brick.engine.slack_subscriber.httpx.post")
    def test_sends_link_started_to_slack(self, mock_post):
        """link.started 이벤트 수신 → Slack 전송."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"ok": True}
        mock_post.return_value = mock_resp

        bus = EventBus()
        SlackSubscriber(bus, token="xoxb-test")
        bus.publish(Event(
            type="link.started",
            data={"from_block": "do", "to_block": "qa", "channel": "slack"},
        ))

        mock_post.assert_called_once()
        text = mock_post.call_args.kwargs["json"]["text"]
        assert "do" in text
        assert "qa" in text

    @patch("brick.engine.slack_subscriber.httpx.post")
    def test_sends_link_completed_to_slack(self, mock_post):
        """link.completed 이벤트 수신 → Slack 전송."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"ok": True}
        mock_post.return_value = mock_resp

        bus = EventBus()
        SlackSubscriber(bus, token="xoxb-test")
        bus.publish(Event(
            type="link.completed",
            data={"from_block": "do", "to_block": "qa", "channel": "slack"},
        ))

        mock_post.assert_called_once()
        text = mock_post.call_args.kwargs["json"]["text"]
        assert "do" in text
        assert "qa" in text


# ── _format_message 테스트 ──────────────────────────────────────────────


class TestFormatLinkMessage:
    def test_format_link_started(self):
        event = Event(type="link.started", data={"from_block": "do", "to_block": "qa"})
        msg = _format_message(event)
        assert "do" in msg
        assert "qa" in msg
        assert "시작" in msg

    def test_format_link_completed(self):
        event = Event(type="link.completed", data={"from_block": "do", "to_block": "qa"})
        msg = _format_message(event)
        assert "do" in msg
        assert "qa" in msg
        assert "완료" in msg


# ── LinkDefinition notify 필드 테스트 ───────────────────────────────────


class TestLinkDefinitionNotify:
    def test_default_notify_empty(self):
        """기본값은 빈 dict."""
        link = LinkDefinition(from_block="a", to_block="b")
        assert link.notify == {}

    def test_notify_set(self):
        """notify 설정 확인."""
        link = LinkDefinition(
            from_block="a", to_block="b",
            notify={"on_start": "slack", "on_complete": "slack"},
        )
        assert link.notify["on_start"] == "slack"
        assert link.notify["on_complete"] == "slack"
