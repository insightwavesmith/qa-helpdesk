"""ClaudeCodeAdapter — single Claude Code agent via MCP/tmux."""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

from brick.adapters.base import TeamAdapter
from brick.adapters.mcp_bridge import MCPBridge
from brick.models.block import Block
from brick.models.team import AdapterStatus


class ClaudeCodeAdapter(TeamAdapter):
    """
    단일 Claude Code 에이전트 어댑터.
    claude_agent_teams와 달리 팀 없이 단독 에이전트가 블록 실행.
    """

    def __init__(self, config: dict | None = None):
        config = config or {}
        self.session = config.get("session", "brick-claude")
        self.model = config.get("model", "")  # 미지정 시 기본 모델
        self.runtime_dir = Path(config.get("runtime_dir", ".bkit/runtime"))
        self.comm_method = config.get("method", "tmux")  # tmux | mcp
        self.mcp_broker_port = config.get("broker_port", 7899)
        self.mcp = MCPBridge(self.mcp_broker_port, str(self.runtime_dir))
        self.processes: dict[str, int] = {}  # execution_id → PID

    async def start_block(self, block: Block, context: dict) -> str:
        execution_id = f"cc-{block.id}-{int(time.time())}"

        if self.comm_method == "mcp":
            success = await self._start_via_mcp(block, context, execution_id)
            if not success:
                await self._start_via_tmux(block, context, execution_id)
        else:
            await self._start_via_tmux(block, context, execution_id)

        self._write_state(execution_id, {
            "status": "running",
            "block_id": block.id,
            "started_at": time.time(),
        })
        return execution_id

    async def _start_via_mcp(self, block: Block, context: dict, execution_id: str) -> bool:
        """MCP로 기동 중인 Claude Code 인스턴스에 작업 전달."""
        peer_id = await self.mcp.find_peer(session=self.session, role="CLAUDE_CODE")
        if not peer_id:
            return False

        message = {
            "protocol": "bscamp-team/v1",
            "type": "BLOCK_TASK",
            "execution_id": execution_id,
            "block_id": block.id,
            "what": block.what,
            "context": {k: str(v)[:500] for k, v in context.items()},
        }

        success, _ = await self.mcp.send_task(peer_id, message, ack_timeout=30)
        return success

    async def _start_via_tmux(self, block: Block, context: dict, execution_id: str) -> None:
        """tmux 세션에서 Claude Code CLI 실행."""
        task_prompt = f"TASK: {block.what}"
        model_flag = f"--model {self.model}" if self.model else ""

        # tmux 세션 생성 (없으면)
        proc = await asyncio.create_subprocess_exec(
            "tmux", "has-session", "-t", self.session,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        if proc.returncode != 0:
            create = await asyncio.create_subprocess_exec(
                "tmux", "new-session", "-d", "-s", self.session,
            )
            await create.wait()

        # Claude Code 실행 명령 전송
        cmd = f"claude {model_flag} -p \"{task_prompt}\""
        send = await asyncio.create_subprocess_exec(
            "tmux", "send-keys", "-t", self.session, cmd, "Enter",
        )
        await send.wait()

    async def check_status(self, execution_id: str) -> AdapterStatus:
        """상태 파일 기반 + staleness 감지."""
        state = self._read_state(execution_id)
        if state:
            status = state.get("status", "running")
            if status != "running":
                return AdapterStatus(
                    status=status,
                    metrics=state.get("metrics"),
                    artifacts=state.get("artifacts"),
                    error=state.get("error"),
                )

        # staleness (engine-100pct 패턴)
        try:
            start_ts = float(execution_id.rsplit("-", 1)[-1])
            if time.time() - start_ts > 600:
                return AdapterStatus(status="failed", error="Claude Code 응답 타임아웃")
        except (ValueError, IndexError):
            pass

        return AdapterStatus(status="running")

    async def cancel(self, execution_id: str) -> bool:
        """tmux 세션에 Ctrl+C 전송."""
        proc = await asyncio.create_subprocess_exec(
            "tmux", "send-keys", "-t", self.session, "C-c", "",
        )
        await proc.wait()
        self._write_state(execution_id, {"status": "failed", "error": "Cancelled"})
        return True

    async def get_artifacts(self, execution_id: str) -> list[str]:
        state = self._read_state(execution_id)
        return state.get("artifacts", []) if state else []

    def _write_state(self, eid: str, data: dict) -> None:
        p = self.runtime_dir / f"task-state-{eid}.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(data))

    def _read_state(self, eid: str) -> dict | None:
        p = self.runtime_dir / f"task-state-{eid}.json"
        return json.loads(p.read_text()) if p.exists() else None
