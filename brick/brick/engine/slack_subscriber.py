"""Slack Subscriber — EventBus 이벤트를 agent-ops 채널에 알림.

block.started / block.completed / workflow.completed 이벤트 발생 시
Slack chat.postMessage로 agent-ops 채널(C0AN7ATS4DD)에 전송.
봇 토큰: os.environ["SLACK_BOT_TOKEN"]
"""

from __future__ import annotations

import logging
import os
import re

import httpx

from brick.engine.event_bus import EventBus
from brick.models.events import Event

logger = logging.getLogger(__name__)

SLACK_CHANNEL = "C0AN7ATS4DD"  # agent-ops
SLACK_POST_URL = "https://slack.com/api/chat.postMessage"
TIMEOUT = 5  # seconds

# 축3: 민감 정보 마스킹 패턴
_SENSITIVE_PATTERNS = [
    (re.compile(r'(SLACK_BOT_TOKEN|API_KEY|SECRET|PASSWORD|TOKEN)=[^\s]+', re.I), r'\1=***'),
    (re.compile(r'(Bearer\s+)[^\s]+', re.I), r'\1***'),
]


def _mask_sensitive(text: str) -> str:
    """민감 정보 마스킹."""
    for pattern, replacement in _SENSITIVE_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def _format_message(event: Event) -> str:
    """이벤트를 Slack 메시지 텍스트로 변환. P1-A5: prefix/suffix 추가."""
    block_id = event.data.get("block_id", "")
    workflow_id = event.data.get("workflow_id", "")

    # P1-A5: project/feature prefix/suffix
    project = event.data.get("project", "")
    feature = event.data.get("feature", "")
    prefix = f"[{project}] " if project else ""
    suffix = f" — {feature}" if feature else ""

    if event.type == "block.started":
        return f":arrow_forward: {prefix}블록 시작: *{block_id}*{suffix}"
    elif event.type == "block.completed":
        return f":white_check_mark: {prefix}블록 완료: *{block_id}*{suffix}"
    elif event.type == "workflow.completed":
        return f":tada: {prefix}워크플로우 완료: *{workflow_id}*{suffix}"
    elif event.type == "link.started":
        from_b = event.data.get("from_block", "")
        to_b = event.data.get("to_block", "")
        return f":link: {prefix}링크 시작: *{from_b}* → *{to_b}*{suffix}"
    elif event.type == "link.completed":
        from_b = event.data.get("from_block", "")
        to_b = event.data.get("to_block", "")
        return f":white_check_mark: {prefix}링크 완료: *{from_b}* → *{to_b}*{suffix}"
    elif event.type == "block.adapter_failed":
        error = event.data.get("error", "")
        stderr = event.data.get("stderr", "")
        exit_code = event.data.get("exit_code", "")
        role = event.data.get("role", "")
        role_label = f" ({role})" if role else ""
        stderr_lines = stderr.strip().splitlines()[-10:] if stderr else []
        stderr_text = "\n".join(stderr_lines)
        safe_stderr = _mask_sensitive(stderr_text)
        return (
            f":x: {prefix}블록 실패: *{block_id}*{role_label}{suffix}\n"
            f"exit code: {exit_code}\n"
            f"stderr:\n```{safe_stderr}```"
        )
    elif event.type == "block.gate_failed":
        # P1-A2: reject_reason + retry_count 포함
        detail = event.data.get("gate_detail", "")
        error = event.data.get("error", "Gate check failed")
        reject_reason = event.data.get("reject_reason", "")
        retry_count = event.data.get("retry_count", 0)
        max_retries = event.data.get("max_retries", 3)
        missing = event.data.get("gate_metadata", {}).get("missing", [])

        if reject_reason:
            msg = f":x: {prefix}반려: *{block_id}*{suffix}\n사유: {reject_reason}"
        else:
            msg = f":warning: {prefix}게이트 실패: *{block_id}*{suffix}\n사유: {detail or error}"
        if missing:
            msg += "\n누락 파일:\n" + "\n".join(f"  • `{m}`" for m in missing)
        if retry_count > 0:
            msg += f"\n재시도: {retry_count}/{max_retries}"
        return msg
    elif event.type == "gate.pending":
        artifacts = event.data.get("artifacts", [])
        artifacts_text = ", ".join(artifacts) if artifacts else "없음"
        return (
            f":mag: {prefix}검토 대기: *{block_id}*{suffix}\n"
            f"산출물: {artifacts_text}\n"
            f"approve: POST /api/v1/engine/{workflow_id}/gate/{block_id}/approve"
        )
    elif event.type == "gate.approval_pending":
        approver = event.data.get("approver", "")
        artifacts = event.data.get("artifacts", [])
        artifact_list = "\n".join(f"  • `{a}`" for a in artifacts) if artifacts else "(없음)"
        return (
            f":raising_hand: {prefix}승인 대기: *{block_id}*{suffix}\n"
            f"검토 대상:\n{artifact_list}\n"
            f"승인자: {approver}\n"
            f"승인: `POST /engine/complete-block` + `approval_action: approve`"
        )
    return f"{event.type}: {event.data}"


class SlackSubscriber:
    """EventBus → Slack 알림 브릿지. P1-A3: verbose/basic 레벨 분리."""

    # P1-A3: 레벨별 이벤트 분리
    BASIC_EVENTS = {
        "workflow.completed", "block.adapter_failed",
        "block.gate_failed", "gate.pending",
    }
    VERBOSE_EVENTS = BASIC_EVENTS | {
        "block.started", "block.completed",
        "link.started", "link.completed",
    }

    def __init__(self, event_bus: EventBus, token: str | None = None,
                 level: str = "basic", channel: str | None = None) -> None:
        self._token = token or os.environ.get("SLACK_BOT_TOKEN", "")
        self._channel = channel or SLACK_CHANNEL
        self._level = level

        # P1-A4: BRICK_ENV=test → 토큰 비워서 전송 차단
        if os.environ.get("BRICK_ENV") == "test":
            self._token = ""

        # P1-A3: 레벨에 따라 구독 이벤트 필터링
        allowed = self.VERBOSE_EVENTS if level == "verbose" else self.BASIC_EVENTS
        for event_type in allowed:
            event_bus.subscribe(event_type, self._on_event)
        # gate.approval_pending은 항상 구독
        event_bus.subscribe("gate.approval_pending", self._on_event)

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
