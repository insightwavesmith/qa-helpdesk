"""WebhookAdapter — HTTP webhook-based execution with callback, auth, retry."""

from __future__ import annotations

import json
import time
from pathlib import Path

import httpx

from brick.adapters.base import TeamAdapter
from brick.models.block import Block
from brick.models.team import AdapterStatus


class WebhookAdapter(TeamAdapter):
    """Execute blocks via HTTP webhook calls with callback + auth + state file."""

    def __init__(self, config: dict | None = None):
        config = config or {}
        self.url = config.get("url", "")
        self.status_url = config.get("status_url", "")
        self.callback_url = config.get("callback_url", "")  # 외부→엔진 콜백
        self.headers = config.get("headers", {})
        self.timeout = config.get("timeout", 30)
        self.auth_type = config.get("auth_type", "")  # bearer | api_key | ""
        self.auth_value = config.get("auth_value", "")
        self.retry_on_status = config.get("retry_on_status", [502, 503, 504])
        self.runtime_dir = Path(config.get("runtime_dir", ".bkit/runtime"))

    async def start_block(self, block: Block, context: dict) -> str:
        execution_id = f"wh-{block.id}-{int(time.time())}"

        headers = {**self.headers}
        if self.auth_type == "bearer":
            headers["Authorization"] = f"Bearer {self.auth_value}"
        elif self.auth_type == "api_key":
            headers["X-API-Key"] = self.auth_value

        payload = {
            "execution_id": execution_id,
            "block_id": block.id,
            "what": block.what,
            "context": context,
        }
        # callback_url이 있으면 포함 — 외부 서비스가 완료 시 이 URL로 POST
        if self.callback_url:
            payload["callback_url"] = self.callback_url

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(self.url, json=payload, headers=headers)

            if resp.status_code in self.retry_on_status:
                raise RuntimeError(f"Webhook 재시도 가능: HTTP {resp.status_code}")
            if resp.status_code >= 400:
                raise RuntimeError(f"Webhook 실패: HTTP {resp.status_code} — {resp.text[:200]}")

        # 상태 파일 초기화 (EnginePoller 호환)
        self._write_state(execution_id, {"status": "running", "started_at": time.time()})
        return execution_id

    async def check_status(self, execution_id: str) -> AdapterStatus:
        # 1순위: 상태 파일 (콜백이 업데이트했을 수 있음)
        state = self._read_state(execution_id)
        if state and state.get("status") != "running":
            return AdapterStatus(
                status=state["status"],
                metrics=state.get("metrics"),
                artifacts=state.get("artifacts"),
                error=state.get("error"),
            )

        # 2순위: status_url 폴링
        if self.status_url:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                try:
                    resp = await client.get(f"{self.status_url}/{execution_id}")
                    if resp.status_code == 200:
                        data = resp.json()
                        status = data.get("status", "running")
                        if status != "running":
                            self._write_state(execution_id, data)
                        return AdapterStatus(
                            status=status,
                            metrics=data.get("metrics"),
                            artifacts=data.get("artifacts"),
                            error=data.get("error"),
                        )
                except httpx.HTTPError:
                    pass

        # 3순위: staleness 감지 (engine-100pct 패턴)
        try:
            start_ts = float(execution_id.rsplit("-", 1)[-1])
            if time.time() - start_ts > 600:
                return AdapterStatus(status="failed", error="Webhook 응답 타임아웃 (10분)")
        except (ValueError, IndexError):
            pass

        return AdapterStatus(status="running")

    async def cancel(self, execution_id: str) -> bool:
        self._write_state(execution_id, {"status": "failed", "error": "Cancelled"})
        return True

    async def get_artifacts(self, execution_id: str) -> list[str]:
        state = self._read_state(execution_id)
        return state.get("artifacts", []) if state else []

    # --- 콜백 수신 (Express에서 호출) ---
    def receive_callback(self, execution_id: str, data: dict) -> None:
        """외부 서비스가 콜백으로 완료 알림 시 상태 파일 업데이트."""
        self._write_state(execution_id, {
            "status": data.get("status", "completed"),
            "metrics": data.get("metrics"),
            "artifacts": data.get("artifacts"),
            "error": data.get("error"),
        })

    def _write_state(self, execution_id: str, data: dict) -> None:
        path = self.runtime_dir / f"task-state-{execution_id}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data))

    def _read_state(self, execution_id: str) -> dict | None:
        path = self.runtime_dir / f"task-state-{execution_id}.json"
        if path.exists():
            return json.loads(path.read_text())
        return None
