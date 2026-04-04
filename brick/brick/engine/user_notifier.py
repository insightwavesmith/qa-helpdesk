"""UserNotifier — EventBus 이벤트를 직원별 알림으로 라우팅."""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

from brick.engine.event_bus import EventBus
from brick.models.events import Event

logger = logging.getLogger(__name__)

DEFAULT_DB_PATH = ".bkit/brick.db"


class UserNotifier:
    """EventBus 구독 → notifications 테이블 INSERT."""

    def __init__(self, event_bus: EventBus, db_path: str = DEFAULT_DB_PATH) -> None:
        self.db_path = db_path
        event_bus.subscribe("gate.approval_pending", self._on_approval_pending)
        event_bus.subscribe("block.adapter_failed", self._on_failure)

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _on_approval_pending(self, event: Event) -> None:
        approver_email = event.data.get("approver", "")
        if not approver_email:
            return
        try:
            conn = self._get_conn()
            user = conn.execute("SELECT id FROM users WHERE email = ?", (approver_email,)).fetchone()
            if user:
                conn.execute(
                    "INSERT INTO notifications (recipient_id, type, title, message, source_type, source_id) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (user["id"], "approval", "승인 대기",
                     f"블록 '{event.data.get('block_id')}' 검토 필요",
                     "block", event.data.get("block_id")),
                )
                conn.commit()
            conn.close()
        except Exception:
            logger.exception("UserNotifier: approval 알림 저장 실패")

    def _on_failure(self, event: Event) -> None:
        block_id = event.data.get("block_id", "")
        role = event.data.get("role", "")
        try:
            conn = self._get_conn()
            conn.execute(
                "INSERT INTO notifications (recipient_id, type, title, message, source_type, source_id) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (None, "gate_failed", "블록 실패",
                 f"블록 '{block_id}' ({role}) 실행 실패",
                 "block", block_id),
            )
            conn.commit()
            conn.close()
        except Exception:
            logger.exception("UserNotifier: 실패 알림 저장 실패")
