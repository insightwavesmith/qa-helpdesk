"""Slack Subscriber — EventBus 이벤트를 agent-ops 채널에 알림.

block.started / block.completed / workflow.completed 이벤트 발생 시
Slack chat.postMessage로 agent-ops 채널(C0AN7ATS4DD)에 전송.
봇 토큰: os.environ["SLACK_BOT_TOKEN"]
"""

from __future__ import annotations

import logging
import os

import httpx

from brick.engine.event_bus import EventBus
from brick.models.events import Event

logger = logging.getLogger(__name__)

SLACK_CHANNEL = "C0AN7ATS4DD"  # agent-ops
SLACK_POST_URL = "https://slack.com/api/chat.postMessage"
TIMEOUT = 5  # seconds


def _format_message(event: Event) -> str:
    """이벤트를 Slack 메시지 텍스트로 변환."""
    block_id = event.data.get("block_id", "")
    workflow_id = event.data.get("workflow_id", "")

    if event.type == "block.started":
        return f":arrow_forward: 블록 시작: *{block_id}*"
    elif event.type == "block.completed":
        return f":white_check_mark: 블록 완료: *{block_id}*"
    elif event.type == "workflow.completed":
        return f":tada: 워크플로우 완료: *{workflow_id}*"
    elif event.type == "link.started":
        from_b = event.data.get("from_block", "")
        to_b = event.data.get("to_block", "")
        return f":link: 링크 시작: *{from_b}* → *{to_b}*"
    elif event.type == "link.completed":
        from_b = event.data.get("from_block", "")
        to_b = event.data.get("to_block", "")
        return f":white_check_mark: 링크 완료: *{from_b}* → *{to_b}*"
    elif event.type == "block.adapter_failed":
        error = event.data.get("error", "")
        stderr = event.data.get("stderr", "")
        exit_code = event.data.get("exit_code", "")
        stderr_lines = stderr.strip().splitlines()[-10:] if stderr else []
        stderr_text = "\n".join(stderr_lines)
        return (
            f":x: 블록 실패: *{block_id}*\n"
            f"exit code: {exit_code}\n"
            f"stderr:\n```{stderr_text}```"
        )
    elif event.type == "block.gate_failed":
        error = event.data.get("error", "Gate check failed")
        return f":warning: 게이트 실패: *{block_id}*\n사유: {error}"
    elif event.type == "gate.pending":
        artifacts = event.data.get("artifacts", [])
        artifacts_text = ", ".join(artifacts) if artifacts else "없음"
        return (
            f":mag: 검토 대기: *{block_id}*\n"
            f"산출물: {artifacts_text}\n"
            f"approve: POST /api/v1/engine/{workflow_id}/gate/{block_id}/approve"
        )
    return f"{event.type}: {event.data}"


class SlackSubscriber:
    """EventBus → Slack 알림 브릿지."""

    def __init__(self, event_bus: EventBus, token: str | None = None) -> None:
        self._token = token or os.environ.get("SLACK_BOT_TOKEN", "")
        self._channel = SLACK_CHANNEL

        event_bus.subscribe("block.started", self._on_event)
        event_bus.subscribe("block.completed", self._on_event)
        event_bus.subscribe("workflow.completed", self._on_event)
        event_bus.subscribe("link.started", self._on_event)
        event_bus.subscribe("link.completed", self._on_event)
        event_bus.subscribe("block.adapter_failed", self._on_event)
        event_bus.subscribe("block.gate_failed", self._on_event)
        event_bus.subscribe("gate.pending", self._on_event)

    def _on_event(self, event: Event) -> None:
        """이벤트 수신 → Slack 전송. 실패해도 엔진에 영향 없음."""
        if not self._token:
            logger.warning("SLACK_BOT_TOKEN 미설정 — Slack 알림 스킵")
            return

        text = _format_message(event)
        try:
            resp = httpx.post(
                SLACK_POST_URL,
                headers={"Authorization": f"Bearer {self._token}"},
                json={"channel": self._channel, "text": text},
                timeout=TIMEOUT,
            )
            if resp.status_code != 200 or not resp.json().get("ok"):
                logger.warning("Slack 전송 실패: %s", resp.text[:200])
        except Exception:
            logger.exception("Slack 전송 중 예외")
