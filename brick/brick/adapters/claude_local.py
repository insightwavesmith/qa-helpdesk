"""ClaudeLocalAdapter — Claude Code CLI subprocess 직접 실행. tmux 의존 없음.

Paperclip claude-local/execute.ts 패턴 포팅:
1. asyncio.create_subprocess_exec (shell=False)
2. env merge — config.env string 값만
3. nesting guard 4개 제거 (CLAUDECODE 등)
4. timeout/grace: SIGTERM → sleep → SIGKILL
5. CLI args: --print - --output-format stream-json --verbose
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path

from brick.adapters.base import TeamAdapter
from brick.models.block import Block
from brick.models.team import AdapterStatus

NESTING_GUARD_VARS = [
    "CLAUDECODE",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_SESSION",
    "CLAUDE_CODE_PARENT_SESSION",
]

_MAX_OUTPUT_BYTES = 32 * 1024  # 32KB cap


class ClaudeLocalAdapter(TeamAdapter):
    """
    Claude Code CLI subprocess 직접 실행. tmux 의존 없음.
    Paperclip claude-local/execute.ts 패턴 포팅.
    """

    def __init__(self, config: dict | None = None):
        config = config or {}
        self.command = config.get("command", "claude")
        self.model = config.get("model", "")
        self.cwd = config.get("cwd", "")
        self.timeout_sec = config.get("timeoutSec", 0)
        self.grace_sec = config.get("graceSec", 20)
        self.max_turns = config.get("maxTurns", 0)
        self.skip_permissions = config.get("dangerouslySkipPermissions", False)
        self.env_config: dict[str, str] = config.get("env", {})
        self.extra_args: list[str] = config.get("extraArgs", [])
        self.runtime_dir = Path(config.get("runtimeDir", ".bkit/runtime"))
        self.continue_session = config.get("continueSession", False)
        self.session_id = config.get("sessionId", "")
        self.role = config.get("role", "")
        self.project = config.get("project", "")  # P1-B3: 프로젝트 필드
        self._processes: dict[str, asyncio.subprocess.Process] = {}

    async def start_block(self, block: Block, context: dict) -> str:
        execution_id = f"cl-{block.id}-{int(time.time())}"
        workflow_id = context.get("workflow_id", "")

        env = self._build_env(execution_id, block.id)
        args = self._build_args()
        prompt = f"TASK: {block.what}\n\nCONTEXT:\n{json.dumps(context)}"

        # 상태 파일 초기화
        self._write_state(execution_id, {
            "status": "running",
            "block_id": block.id,
            "started_at": time.time(),
        })

        cwd = self.cwd or None

        try:
            process = await asyncio.create_subprocess_exec(
                self.command,
                *args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
                cwd=cwd,
            )
        except FileNotFoundError:
            self._write_state(execution_id, {
                "status": "failed",
                "error": f"Command not found: {self.command}",
            })
            return execution_id

        # stdin에 프롬프트 전송 후 닫기
        if process.stdin:
            process.stdin.write(prompt.encode())
            process.stdin.close()

        self._processes[execution_id] = process

        # 백그라운드 모니터 태스크
        asyncio.create_task(
            self._monitor_process(
                execution_id, process,
                workflow_id=workflow_id, block_id=block.id,
            )
        )

        return execution_id

    async def _monitor_process(
        self,
        execution_id: str,
        process: asyncio.subprocess.Process,
        *,
        workflow_id: str = "",
        block_id: str = "",
    ) -> None:
        """백그라운드에서 프로세스 완료를 기다리고 상태 파일 업데이트."""
        stdout_chunks: list[bytes] = []
        stderr_chunks: list[bytes] = []
        timed_out = False

        async def _read_stream(
            stream: asyncio.StreamReader | None,
            chunks: list[bytes],
            max_bytes: int = _MAX_OUTPUT_BYTES,
        ) -> None:
            """EOF까지 읽되, max_bytes 초과 시 truncate."""
            if not stream:
                return
            total = 0
            while True:
                data = await stream.read(8192)
                if not data:
                    break
                chunks.append(data)
                total += len(data)
                if total >= max_bytes:
                    break

        async def _read_all() -> None:
            await asyncio.gather(
                _read_stream(process.stdout, stdout_chunks),
                _read_stream(process.stderr, stderr_chunks),
            )
            await process.wait()

        try:
            if self.timeout_sec > 0:
                await asyncio.wait_for(_read_all(), timeout=self.timeout_sec)
            else:
                await _read_all()
        except asyncio.TimeoutError:
            timed_out = True
            # SIGTERM → grace → SIGKILL
            try:
                process.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(process.wait(), timeout=self.grace_sec)
            except asyncio.TimeoutError:
                try:
                    process.kill()
                except ProcessLookupError:
                    pass

        exit_code = process.returncode

        stdout_data = b"".join(stdout_chunks)
        stderr_data = b"".join(stderr_chunks)

        if timed_out:
            self._write_state(execution_id, {
                "status": "failed",
                "error": f"타임아웃 ({self.timeout_sec}s)",
            })
        elif exit_code == 0:
            self._write_state(execution_id, {
                "status": "completed",
                "stdout": stdout_data.decode(errors="replace"),
                "stderr": stderr_data.decode(errors="replace"),
            })
            # ── 프로세스 완료 → executor.complete_block() 자동 호출 ──
            await self._notify_complete(workflow_id, block_id)
        else:
            stderr_str = stderr_data.decode(errors="replace")
            first_line = next(
                (l.strip() for l in stderr_str.splitlines() if l.strip()), ""
            )
            self._write_state(execution_id, {
                "status": "failed",
                "error": first_line or f"exit code {exit_code}",
                "exit_code": exit_code,
                "stderr": stderr_str,
            })

        self._processes.pop(execution_id, None)

    async def _notify_complete(
        self, workflow_id: str, block_id: str
    ) -> None:
        """프로세스 성공 완료 시 executor.complete_block()을 호출하여 Gate를 즉시 발동."""
        if not workflow_id or not block_id:
            return
        try:
            # lazy import — 순환 참조 방지
            from brick.dashboard.routes.engine_bridge import executor

            if executor:
                await executor.complete_block(workflow_id, block_id)
        except Exception:
            # 실패해도 기존 폴링 fallback 유지
            pass

    async def check_status(self, execution_id: str) -> AdapterStatus:
        """상태 파일 읽기 + 10분 staleness 감지."""
        state = self._read_state(execution_id)
        if state:
            status = state.get("status", "running")
            if status != "running":
                return AdapterStatus(
                    status=status,
                    artifacts=state.get("artifacts"),
                    error=state.get("error"),
                    exit_code=state.get("exit_code"),
                    stderr=state.get("stderr"),
                )

        # staleness: execution_id에서 타임스탬프 추출
        try:
            ts = float(execution_id.rsplit("-", 1)[-1])
            if time.time() - ts > 600:
                return AdapterStatus(status="failed", error="타임아웃 — 10분 초과")
        except (ValueError, IndexError):
            pass

        return AdapterStatus(status="running")

    async def cancel(self, execution_id: str) -> bool:
        process = self._processes.get(execution_id)
        if process and process.returncode is None:
            try:
                process.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(process.wait(), timeout=self.grace_sec)
            except asyncio.TimeoutError:
                try:
                    process.kill()
                except ProcessLookupError:
                    pass
        self._write_state(execution_id, {
            "status": "failed",
            "error": "Cancelled by engine",
        })
        self._processes.pop(execution_id, None)
        return True

    async def get_artifacts(self, execution_id: str) -> list[str]:
        state = self._read_state(execution_id)
        return state.get("artifacts", []) if state else []

    # ── 헬퍼 ──────────────────────────────────────────────────

    def _build_env(self, execution_id: str, block_id: str) -> dict[str, str]:
        """환경변수 빌드: os.environ 복사 → nesting guard 제거 → 브릭 vars 주입 → config.env merge."""
        env: dict[str, str] = {
            k: v for k, v in os.environ.items() if isinstance(v, str)
        }

        # nesting guard 제거 (Paperclip server-utils.ts L774-783 패턴)
        for var in NESTING_GUARD_VARS:
            env.pop(var, None)

        # 브릭 실행 컨텍스트 주입
        env["BRICK_EXECUTION_ID"] = execution_id
        env["BRICK_BLOCK_ID"] = block_id

        # config.env merge — string 값만 (Paperclip execute.ts L232-234 패턴)
        for key, value in self.env_config.items():
            if isinstance(value, str):
                env[key] = value

        # PATH 보장
        if "PATH" not in env:
            env["PATH"] = "/usr/local/bin:/usr/bin:/bin"

        return env

    def _build_args(self) -> list[str]:
        """CLI 인자 빌드 (Paperclip execute.ts L419-433 패턴)."""
        args = ["--print", "-", "--output-format", "stream-json", "--verbose"]
        # P1-B3: 프로젝트별 에이전트 오버라이드 → --system-prompt-file / --agent
        if self.role:
            if self.project and ".." not in self.project:
                project_agent = Path(f"brick/projects/{self.project}/agents/{self.role}.md")
                if project_agent.exists():
                    args.extend(["--system-prompt-file", str(project_agent)])
                else:
                    args.extend(["--agent", self.role])
            else:
                args.extend(["--agent", self.role])
        if self.model:
            args += ["--model", self.model]
        if self.skip_permissions:
            args.append("--dangerously-skip-permissions")
        if self.max_turns > 0:
            args += ["--max-turns", str(self.max_turns)]
        # --continue / --session-id 지원
        if self.continue_session:
            args.append("--continue")
        if self.session_id:
            args += ["--session-id", self.session_id]
        args.extend(self.extra_args)
        return args

    def _write_state(self, execution_id: str, data: dict) -> None:
        p = self.runtime_dir / f"task-state-{execution_id}.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(data))

    def _read_state(self, execution_id: str) -> dict | None:
        p = self.runtime_dir / f"task-state-{execution_id}.json"
        return json.loads(p.read_text()) if p.exists() else None
