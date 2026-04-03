"""HumanAdapter — manual human execution with dashboard integration + timeout."""

from __future__ import annotations

import json
import time
from pathlib import Path

from brick.adapters.base import TeamAdapter
from brick.models.block import Block
from brick.models.team import AdapterStatus


class HumanAdapter(TeamAdapter):
    """Blocks wait for human completion via file marker with timeout + state file."""

    def __init__(self, config: dict | None = None):
        config = config or {}
        self.completions_dir = Path(config.get("completions_dir", ".bkit/runtime/human-completions"))
        self.runtime_dir = Path(config.get("runtime_dir", ".bkit/runtime"))
        self.timeout_seconds = config.get("timeout_seconds", 86400)  # 24시간
        self.assignee = config.get("assignee", "smith")  # 담당자

    async def start_block(self, block: Block, context: dict) -> str:
        execution_id = f"hu-{block.id}-{int(time.time())}"

        # 상태 파일에 대기 정보 기록 (대시보드에서 조회 가능)
        self._write_state(execution_id, {
            "status": "waiting_human",
            "block_id": block.id,
            "what": block.what,
            "assignee": self.assignee,
            "started_at": time.time(),
            "timeout_at": time.time() + self.timeout_seconds,
            "context": {k: str(v)[:500] for k, v in context.items()},  # 요약
        })

        self.completions_dir.mkdir(parents=True, exist_ok=True)
        return execution_id

    async def check_status(self, execution_id: str) -> AdapterStatus:
        # 완료 파일 확인
        completion_file = self.completions_dir / execution_id
        if completion_file.exists():
            try:
                data = json.loads(completion_file.read_text())
            except json.JSONDecodeError:
                data = {}
            self._write_state(execution_id, {
                "status": "completed",
                "metrics": data.get("metrics", {}),
                "artifacts": data.get("artifacts", []),
            })
            return AdapterStatus(
                status="completed",
                metrics=data.get("metrics"),
                artifacts=data.get("artifacts"),
            )

        # 타임아웃 확인
        state = self._read_state(execution_id)
        if state and state.get("timeout_at"):
            if time.time() > state["timeout_at"]:
                return AdapterStatus(
                    status="failed",
                    error=f"수동 작업 타임아웃: {self.assignee}가 {self.timeout_seconds}초 내 완료하지 않음",
                )

        return AdapterStatus(status="waiting_human", message=f"대기 중: {self.assignee}")

    async def cancel(self, execution_id: str) -> bool:
        self._write_state(execution_id, {"status": "failed", "error": "Cancelled"})
        return True

    async def get_artifacts(self, execution_id: str) -> list[str]:
        completion_file = self.completions_dir / execution_id
        if completion_file.exists():
            try:
                data = json.loads(completion_file.read_text())
                return data.get("artifacts", [])
            except json.JSONDecodeError:
                pass
        return []

    def _write_state(self, execution_id: str, data: dict) -> None:
        path = self.runtime_dir / f"task-state-{execution_id}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data))

    def _read_state(self, execution_id: str) -> dict | None:
        path = self.runtime_dir / f"task-state-{execution_id}.json"
        if path.exists():
            return json.loads(path.read_text())
        return None
