"""SlackSubscriber 단위 테스트."""

from unittest.mock import patch, MagicMock

from brick.engine.event_bus import EventBus
from brick.engine.slack_subscriber import SlackSubscriber, _format_message
from brick.models.events import Event


def test_subscribes_to_three_events():
    """구독 이벤트 3종 등록 확인."""
    bus = EventBus()
    SlackSubscriber(bus, token="xoxb-test")

    assert len(bus._handlers.get("block.started", [])) == 1
    assert len(bus._handlers.get("block.completed", [])) == 1
    assert len(bus._handlers.get("workflow.completed", [])) == 1


def test_format_message_block_started():
    event = Event(type="block.started", data={"block_id": "plan"})
    msg = _format_message(event)
    assert "plan" in msg
    assert "시작" in msg


def test_format_message_block_completed():
    event = Event(type="block.completed", data={"block_id": "do"})
    msg = _format_message(event)
    assert "do" in msg
    assert "완료" in msg


def test_format_message_workflow_completed():
    event = Event(type="workflow.completed", data={"workflow_id": "wf-123"})
    msg = _format_message(event)
    assert "wf-123" in msg


@patch("brick.engine.slack_subscriber.httpx.post")
def test_sends_slack_message(mock_post):
    """토큰 있을 때 Slack API 호출."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"ok": True}
    mock_post.return_value = mock_resp

    bus = EventBus()
    SlackSubscriber(bus, token="xoxb-test")

    bus.publish(Event(type="block.started", data={"block_id": "plan"}))

    mock_post.assert_called_once()
    call_kwargs = mock_post.call_args
    assert call_kwargs.kwargs["json"]["channel"] == "C0AN7ATS4DD"
    assert "plan" in call_kwargs.kwargs["json"]["text"]


@patch.dict("os.environ", {}, clear=True)
def test_skips_when_no_token(caplog):
    """토큰 미설정 시 경고 로그만 남기고 스킵."""
    import logging
    with caplog.at_level(logging.WARNING, logger="brick.engine.slack_subscriber"):
        bus = EventBus()
        SlackSubscriber(bus, token="")
        bus.publish(Event(type="block.started", data={"block_id": "plan"}))
    assert "SLACK_BOT_TOKEN 미설정" in caplog.text


@patch("brick.engine.slack_subscriber.httpx.post", side_effect=Exception("network error"))
def test_exception_does_not_crash(mock_post):
    """Slack 전송 실패해도 예외 전파 안 함."""
    bus = EventBus()
    SlackSubscriber(bus, token="xoxb-test")

    # 예외 발생해도 정상 리턴
    bus.publish(Event(type="block.completed", data={"block_id": "do"}))
