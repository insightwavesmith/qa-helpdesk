# Design: Brick Codex Adapter (OpenAI Codex CLI 통합)

> 작성일: 2026-04-05
> 작성자: PM
> 레벨: L2-기능
> 선행: brick-team-adapter.design.md (어댑터 패턴), brick-pdca-preset.design.md (프리셋 구조)
> 참고 패턴: ClaudeLocalAdapter (338줄, subprocess 기반)

---

## 6단계 사고 프로세스

| 단계 | 내용 |
|------|------|
| **1. TASK 재해석** | codex.py 26줄 stub(전부 NotImplementedError)을 실제 동작하는 어댑터로 구현하여, 브릭 엔진이 OpenAI Codex CLI를 실행 백엔드로 사용할 수 있게 한다 |
| **2. 영향 범위** | `brick/brick/adapters/codex.py` (전면 재작성), `brick/brick/adapters/__init__.py` (export 추가), `brick/brick/dashboard/plugin_manager.py` (fallback 등록), `brick/brick/dashboard/routes/engine_bridge.py` (init_engine 등록), `brick/brick/tests/test_adapters.py` (기존 stub 테스트 교체) |
| **3. 선행 조건** | TeamAdapter ABC 확정 ✅, ClaudeLocalAdapter 참고 패턴 존재 ✅, 프리셋에 codex 어댑터 참조 존재 ✅ |
| **4. 의존성** | 다른 팀 작업과 독립적. codex.py만 수정. engine_bridge.py는 init_engine() 1줄 추가 |
| **5. 방법 도출** | **A**: ClaudeLocalAdapter 패턴 포팅 (subprocess, 상태 파일, 백그라운드 모니터) — 검증된 패턴, 최소 리스크. **B**: HTTP API 기반 (Codex를 서버 모드로 운영) — Codex CLI에 서버 모드 없음, 불가. → **A 채택** |
| **6. 팀원 배정** | backend-dev 1명: codex.py 구현 + 테스트. 검증 기준: TDD 18건 전체 통과 + tsc/build 성공 |

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **목표** | OpenAI Codex CLI를 브릭 엔진 어댑터로 통합. 프리셋에서 `adapter: codex`로 블록 실행 가능 |
| **핵심 변경** | codex.py stub → subprocess 기반 실 구현 (ClaudeLocalAdapter 패턴) |
| **현행 문제** | codex.py 전부 NotImplementedError. 프리셋에 codex가 참조되지만 실행 불가 |
| **수정 범위** | codex.py (전면), __init__.py (+1줄), plugin_manager.py (+1줄), engine_bridge.py (+2줄), test_adapters.py (교체) |
| **TDD** | BD-001 ~ BD-018 (18건) |

---

## 0. 프로젝트 제약 조건

| 항목 | 값 |
|------|-----|
| **Python** | 3.12+ (type hints, `from __future__ import annotations`) |
| **엔진** | asyncio 기반. 모든 어댑터 메서드 async |
| **상태 관리** | 파일 기반 (`task-state-{execution_id}.json`) |
| **런타임 디렉토리** | `.bkit/runtime/` |
| **기존 불변식** | INV-EB-1~11 유지. 새 어댑터가 기존 불변식 변경 없음 |
| **Codex CLI** | `@openai/codex` (npm), Node.js 22+ 필요 |
| **API 키** | `OPENAI_API_KEY` 환경변수 |

### 0.1 현재 구현 상태 (2026-04-05 기준)

| 컴포넌트 | 파일 | 상태 | 비고 |
|---------|------|------|------|
| CodexAdapter | `brick/brick/adapters/codex.py` | ❌ stub | 4메서드 전부 NotImplementedError |
| AdapterRegistry | `engine_bridge.py:115-120` | ⚠️ codex 미등록 | 5종만 등록 (claude_agent_teams, claude_code, claude_local, webhook, human) |
| PluginManager fallback | `plugin_manager.py:22-27` | ⚠️ codex 미등록 | 4종만 등록 |
| PresetValidator | `preset_validator.py:11` | ✅ codex 포함 | DEFAULT_ADAPTERS에 "codex" 존재 |
| 프리셋 | `do-codex-qa.yaml` 외 3건 | ✅ codex 참조 | gate 커맨드에서 `codex review --uncommitted` 사용 |
| 테스트 | `test_adapters.py:156-169` | ✅ stub 테스트 | NotImplementedError 발생 확인만 |

### 0.2 OpenAI Codex CLI 인터페이스

```bash
# 설치
npm install -g @openai/codex

# 비대화형 자동화 (핵심 패턴)
codex --quiet --approval-mode full-auto "프롬프트"

# 주요 플래그
--quiet / -q              # 비대화형. TUI 비활성, stdout에 결과 출력
--approval-mode / -a      # suggest | auto-edit | full-auto
--model / -m              # codex-mini-latest (기본) | o4-mini | o3 등
--working-dir / -w        # 작업 디렉토리
--no-project-doc          # AGENTS.md 무시
--config / -c             # config YAML 경로

# stdin 파이프
echo "프롬프트" | codex -q -a full-auto

# 환경변수
OPENAI_API_KEY=sk-...     # 필수
OPENAI_BASE_URL=...       # 프록시/대체 엔드포인트 (선택)
```

| 특성 | Claude Code CLI | Codex CLI |
|------|----------------|-----------|
| 비대화형 플래그 | `--print -` | `--quiet` |
| 출력 형식 | `--output-format stream-json` | 없음 (텍스트만) |
| 권한 스킵 | `--dangerously-skip-permissions` | `--approval-mode full-auto` |
| 모델 지정 | `--model` | `--model` |
| 작업 디렉토리 | `cwd` 인자 | `--working-dir` |
| 프롬프트 전달 | stdin pipe | 첫 번째 위치 인자 또는 stdin |
| API 키 | `ANTHROPIC_API_KEY` | `OPENAI_API_KEY` |
| 종료 코드 | 0=성공, 비0=실패 | 0=성공, 1=에러 |
| 샌드박스 | 없음 | full-auto 시 Seatbelt/Docker |

---

## 1. 아키텍처

### 1.1 어댑터 위치

```
brick/brick/adapters/
  base.py              ← TeamAdapter ABC (4 abstract + 2 optional)
  claude_local.py      ← ClaudeLocalAdapter (참고 패턴, 338줄)
  codex.py             ← CodexAdapter (이 Design의 구현 대상)
  __init__.py          ← export 추가
```

### 1.2 실행 흐름

```
WorkflowExecutor
  → AdapterRegistry.get("codex")
    → CodexAdapter.start_block(block, context)
      → asyncio.create_subprocess_exec("codex", ...)
        → stdin에 프롬프트 전송 (또는 위치 인자)
        → _monitor_process() 백그라운드 태스크
          → stdout/stderr 수집
          → 상태 파일 업데이트
          → 완료 시 _notify_complete() 호출
  → EnginePoller → check_status()
    → 상태 파일 읽기 + staleness 감지
```

### 1.3 ClaudeLocalAdapter와의 차이점

| 항목 | ClaudeLocalAdapter | CodexAdapter |
|------|-------------------|--------------|
| CLI 바이너리 | `claude` | `codex` |
| 프롬프트 전달 | stdin pipe | 위치 인자 (셸 이스케이프 안전) |
| 출력 형식 | stream-json 파싱 가능 | 텍스트 only (파싱 불필요) |
| nesting guard | CLAUDECODE 등 4개 제거 | 불필요 |
| API 키 | ANTHROPIC_API_KEY | OPENAI_API_KEY |
| 권한 모드 | `--dangerously-skip-permissions` | `--approval-mode full-auto` |
| 작업 디렉토리 | `cwd` kwarg | `--working-dir` 플래그 |
| 세션 관리 | `--continue`, `--session-id` | 없음 (stateless) |

---

## 2. 상세 설계

### 2.1 CodexAdapter 클래스

```python
"""CodexAdapter — OpenAI Codex CLI subprocess 실행."""

from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path

from brick.adapters.base import TeamAdapter
from brick.models.block import Block
from brick.models.team import AdapterStatus

_MAX_OUTPUT_BYTES = 32 * 1024  # 32KB cap (ClaudeLocalAdapter와 동일)


class CodexAdapter(TeamAdapter):
    """
    OpenAI Codex CLI subprocess 실행 어댑터.
    ClaudeLocalAdapter 패턴 기반, Codex CLI 인터페이스에 맞게 조정.
    """

    # 플러그인 메타데이터 (PluginManager 디스커버리용)
    display_name = "OpenAI Codex"
    icon = "🤖"
    description = "OpenAI Codex CLI를 통한 코드 생성/리뷰 실행"

    def __init__(self, config: dict | None = None):
        config = config or {}
        self.command = config.get("command", "codex")
        self.model = config.get("model", "")           # 미지정 시 codex-mini-latest
        self.cwd = config.get("cwd", "")
        self.timeout_sec = config.get("timeoutSec", 0)
        self.grace_sec = config.get("graceSec", 20)
        self.approval_mode = config.get("approvalMode", "full-auto")
        self.quiet = config.get("quiet", True)          # 비대화형 기본
        self.env_config: dict[str, str] = config.get("env", {})
        self.extra_args: list[str] = config.get("extraArgs", [])
        self.runtime_dir = Path(config.get("runtimeDir", ".bkit/runtime"))
        self._processes: dict[str, asyncio.subprocess.Process] = {}

    async def start_block(self, block: Block, context: dict) -> str:
        execution_id = f"cx-{block.id}-{int(time.time())}"
        workflow_id = context.get("workflow_id", "")

        env = self._build_env(execution_id, block.id)
        prompt = f"TASK: {block.what}\n\nCONTEXT:\n{json.dumps(context)}"

        # 반려 시 사유 주입 (ClaudeLocalAdapter P1-A1 패턴)
        reject_reason = context.get('reject_reason', '')
        if reject_reason:
            reject_count = context.get('reject_count', 1)
            prompt = (
                f'⚠️ 이전 산출물이 반려됨 (시도 {reject_count}회)\n'
                f'반려 사유: {reject_reason}\n'
                f'이 부분을 수정하여 다시 작성해라.\n\n'
                + prompt
            )

        args = self._build_args(prompt)

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

        self._processes[execution_id] = process

        # 백그라운드 모니터 태스크
        asyncio.create_task(
            self._monitor_process(
                execution_id, process,
                workflow_id=workflow_id, block_id=block.id,
            )
        )

        return execution_id

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
        """환경변수 빌드: os.environ 복사 → 브릭 vars 주입 → config.env merge."""
        env: dict[str, str] = {
            k: v for k, v in os.environ.items() if isinstance(v, str)
        }

        # 브릭 실행 컨텍스트 주입
        env["BRICK_EXECUTION_ID"] = execution_id
        env["BRICK_BLOCK_ID"] = block_id

        # config.env merge — string 값만
        for key, value in self.env_config.items():
            if isinstance(value, str):
                env[key] = value

        # OPENAI_API_KEY 보장
        if "OPENAI_API_KEY" not in env:
            import logging
            logging.getLogger(__name__).warning(
                "OPENAI_API_KEY 미설정. Codex CLI가 실패할 수 있음"
            )

        # PATH 보장
        if "PATH" not in env:
            env["PATH"] = "/usr/local/bin:/usr/bin:/bin"

        return env

    def _build_args(self, prompt: str) -> list[str]:
        """CLI 인자 빌드. Codex CLI는 위치 인자로 프롬프트 전달."""
        args: list[str] = []
        if self.quiet:
            args.append("--quiet")
        if self.approval_mode:
            args.extend(["--approval-mode", self.approval_mode])
        if self.model:
            args.extend(["--model", self.model])
        if self.cwd:
            args.extend(["--working-dir", self.cwd])
        args.extend(self.extra_args)
        # 프롬프트는 마지막 위치 인자
        args.append(prompt)
        return args

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
        """프로세스 성공 완료 시 executor.complete_block() 호출."""
        if not workflow_id or not block_id:
            return
        try:
            from brick.dashboard.routes.engine_bridge import executor
            if executor:
                await executor.complete_block(workflow_id, block_id)
        except Exception:
            pass

    def _write_state(self, execution_id: str, data: dict) -> None:
        p = self.runtime_dir / f"task-state-{execution_id}.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(data))

    def _read_state(self, execution_id: str) -> dict | None:
        p = self.runtime_dir / f"task-state-{execution_id}.json"
        return json.loads(p.read_text()) if p.exists() else None

    @staticmethod
    def config_schema() -> dict:
        """PluginManager 디스커버리용 config JSON Schema."""
        return {
            "type": "object",
            "required": [],
            "properties": {
                "command": {
                    "type": "string",
                    "title": "Codex 실행 경로",
                    "default": "codex",
                },
                "model": {
                    "type": "string",
                    "title": "모델",
                    "default": "",
                    "description": "미지정 시 codex-mini-latest",
                },
                "approvalMode": {
                    "type": "string",
                    "title": "승인 모드",
                    "default": "full-auto",
                    "enum": ["suggest", "auto-edit", "full-auto"],
                },
                "timeoutSec": {
                    "type": "number",
                    "title": "타임아웃(초)",
                    "default": 0,
                    "description": "0 = 무제한",
                },
                "cwd": {
                    "type": "string",
                    "title": "작업 디렉토리",
                    "default": "",
                },
            },
        }
```

### 2.2 등록 변경 (3파일, 각 1~2줄)

#### `brick/brick/adapters/__init__.py`

```python
# 추가
from brick.adapters.codex import CodexAdapter

__all__ = ["ClaudeLocalAdapter", "CodexAdapter"]
```

#### `brick/brick/dashboard/plugin_manager.py` (L22-27 _FALLBACK_ADAPTERS)

```python
_FALLBACK_ADAPTERS = {
    "claude_agent_teams": "brick.adapters.claude_agent_teams:ClaudeAgentTeamsAdapter",
    "claude_code": "brick.adapters.claude_code:SingleClaudeCodeAdapter",
    "codex": "brick.adapters.codex:CodexAdapter",  # 추가
    "human": "brick.adapters.human:HumanAdapter",
    "webhook": "brick.adapters.webhook:WebhookAdapter",
}
```

#### `brick/brick/dashboard/routes/engine_bridge.py` (init_engine, L116-120)

```python
adapter_pool.register("claude_agent_teams", ClaudeAgentTeamsAdapter({}))
adapter_pool.register("claude_code", ClaudeCodeAdapter({}))
adapter_pool.register("claude_local", ClaudeLocalAdapter({}))
adapter_pool.register("codex", CodexAdapter({}))  # 추가
adapter_pool.register("webhook", WebhookAdapter({}))
adapter_pool.register("human", HumanAdapter({}))
```

import 추가:
```python
from brick.adapters.codex import CodexAdapter  # 추가
```

---

## 3. 프리셋 연동

현재 프리셋들은 `codex review --uncommitted`를 **gate command**로만 사용. 이는 어댑터와 별개 (gate handler가 셸 커맨드로 실행).

어댑터로서의 codex 사용은 향후 프리셋에서 아래처럼 가능:

```yaml
# 예시: Codex가 QA 블록을 실행하는 프리셋
blocks:
  - id: codex-qa
    type: QA
    what: "코드 리뷰: diff 분석 + 버그/보안 취약점 탐지"
    done:
      artifacts: []
    gate:
      handlers:
        - type: command
          command: "npx tsc --noEmit --quiet"
      on_fail: retry

teams:
  codex-qa:
    adapter: codex
    config:
      model: o4-mini
      approvalMode: full-auto
      timeoutSec: 300
      env:
        OPENAI_API_KEY: "${OPENAI_API_KEY}"
```

---

## 4. 불변식 (Invariants)

### 4.1 신규 불변식

| ID | 불변식 | 검증 방법 |
|----|--------|----------|
| **INV-CX-1** | CodexAdapter는 TeamAdapter ABC의 4개 abstract method를 모두 구현해야 한다 | isinstance(CodexAdapter(), TeamAdapter) == True |
| **INV-CX-2** | execution_id 형식은 `cx-{block_id}-{unix_timestamp}` | 정규식 `^cx-.+-\d+$` 매칭 |
| **INV-CX-3** | 상태 파일 경로는 `{runtime_dir}/task-state-{execution_id}.json` | 파일 존재 확인 |
| **INV-CX-4** | codex 바이너리 미존재 시 status=failed + error 메시지 반환 (엔진 크래시 없음) | FileNotFoundError 핸들링 |
| **INV-CX-5** | OPENAI_API_KEY 미설정 시 warning 로그 출력 (crash 아님) | logging mock 검증 |
| **INV-CX-6** | cancel() 호출 시 SIGTERM → grace → SIGKILL 순서 보장 | process mock 검증 |
| **INV-CX-7** | 타임아웃 시 상태 파일에 status=failed + error 기록 | 타임아웃 시나리오 테스트 |
| **INV-CX-8** | 프롬프트에 셸 메타문자가 있어도 injection 발생 안 함 | 위치 인자 전달 (셸 미경유) |
| **INV-CX-9** | stdout/stderr는 32KB 캡 적용 | _MAX_OUTPUT_BYTES 상수 |
| **INV-CX-10** | 프로세스 성공 완료(exit 0) 시 _notify_complete() 호출하여 Gate 즉시 발동 | 완료 흐름 검증 |

### 4.2 기존 불변식 영향

기존 INV-EB-1~11 변경 없음. CodexAdapter는 기존 어댑터와 동일한 인터페이스로 등록됨.

---

## 5. 에러 처리

| 에러 상황 | 처리 | 엔진 영향 |
|----------|------|----------|
| `codex` 바이너리 미설치 | FileNotFoundError catch → 상태 failed | 엔진 계속 동작. block만 failed |
| OPENAI_API_KEY 미설정 | Codex CLI가 에러 출력 → exit code ≠ 0 → failed | 엔진 계속 동작 |
| 프로세스 타임아웃 | SIGTERM → grace(20s) → SIGKILL → 상태 failed | 좀비 프로세스 방지 |
| stdout/stderr 과다 | 32KB 캡으로 truncate | 메모리 보호 |
| 상태 파일 읽기 실패 | None 반환 → running으로 간주 | 10분 staleness 감지로 최종 fail |

---

## 6. 보안 고려사항

| 항목 | 대책 |
|------|------|
| **커맨드 인젝션** | `asyncio.create_subprocess_exec` 사용 (shell=False). 프롬프트는 위치 인자로 전달, 셸 해석 없음 |
| **API 키 노출** | 환경변수로만 전달. 상태 파일/로그에 기록 안 함 |
| **PATH traversal** | cwd 설정은 config에서만. 프롬프트 내용으로 cwd 변경 불가 |
| **샌드박스** | Codex full-auto 모드는 자체 샌드박스(macOS: Seatbelt) 적용 |
| **env 주입** | config.env의 string 값만 허용 (ClaudeLocalAdapter와 동일 패턴) |

---

## 7. config_schema (대시보드 폼 자동 생성)

PluginManager가 `CodexAdapter.config_schema()`를 호출하여 대시보드에서 설정 폼을 자동 생성.

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| command | string | `"codex"` | Codex CLI 실행 경로 |
| model | string | `""` | 모델 (미지정 시 codex-mini-latest) |
| approvalMode | string | `"full-auto"` | suggest / auto-edit / full-auto |
| timeoutSec | number | `0` | 타임아웃 초 (0=무제한) |
| cwd | string | `""` | 작업 디렉토리 |

---

## 8. TDD 케이스

> 모든 테스트는 `brick/brick/__tests__/adapters/test_codex_adapter.py`에 작성.
> 함수명에 TDD ID 포함 필수 (예: `test_bd001_...`).

### 8.1 기본 동작 (BD-001 ~ BD-005)

| ID | 테스트명 | 검증 내용 | 관련 불변식 |
|----|---------|----------|------------|
| **BD-001** | `test_bd001_isinstance_team_adapter` | `isinstance(CodexAdapter(), TeamAdapter)` is True | INV-CX-1 |
| **BD-002** | `test_bd002_execution_id_format` | start_block 반환값이 `cx-{block_id}-{ts}` 형식 | INV-CX-2 |
| **BD-003** | `test_bd003_state_file_created` | start_block 후 상태 파일 생성 확인 | INV-CX-3 |
| **BD-004** | `test_bd004_default_config` | 기본 config: command="codex", quiet=True, approval_mode="full-auto" | — |
| **BD-005** | `test_bd005_custom_config` | config 전달 시 model, cwd, timeoutSec 반영 확인 | — |

### 8.2 프로세스 실행 (BD-006 ~ BD-009)

| ID | 테스트명 | 검증 내용 | 관련 불변식 |
|----|---------|----------|------------|
| **BD-006** | `test_bd006_command_not_found` | codex 바이너리 미존재 → status=failed, error 포함 | INV-CX-4 |
| **BD-007** | `test_bd007_build_args_quiet_fullaut` | _build_args에 --quiet, --approval-mode full-auto 포함 | — |
| **BD-008** | `test_bd008_build_args_model` | model 설정 시 --model 플래그 포함 | — |
| **BD-009** | `test_bd009_build_args_cwd` | cwd 설정 시 --working-dir 플래그 포함 | — |

### 8.3 환경변수 (BD-010 ~ BD-011)

| ID | 테스트명 | 검증 내용 | 관련 불변식 |
|----|---------|----------|------------|
| **BD-010** | `test_bd010_env_brick_vars_injected` | BRICK_EXECUTION_ID, BRICK_BLOCK_ID 주입 확인 | — |
| **BD-011** | `test_bd011_env_openai_key_warning` | OPENAI_API_KEY 미설정 시 warning 로그 | INV-CX-5 |

### 8.4 상태 관리 (BD-012 ~ BD-014)

| ID | 테스트명 | 검증 내용 | 관련 불변식 |
|----|---------|----------|------------|
| **BD-012** | `test_bd012_check_status_completed` | 상태 파일에 completed → AdapterStatus(status="completed") | — |
| **BD-013** | `test_bd013_check_status_staleness` | 10분 초과 → status=failed, error="타임아웃" | INV-CX-7 |
| **BD-014** | `test_bd014_get_artifacts` | 상태 파일 artifacts 반환 확인 | — |

### 8.5 취소/타임아웃 (BD-015 ~ BD-016)

| ID | 테스트명 | 검증 내용 | 관련 불변식 |
|----|---------|----------|------------|
| **BD-015** | `test_bd015_cancel_sigterm_sigkill` | cancel() → SIGTERM → grace → SIGKILL 순서 | INV-CX-6 |
| **BD-016** | `test_bd016_timeout_writes_failed` | 타임아웃 발생 → 상태 파일 failed 기록 | INV-CX-7 |

### 8.6 보안 (BD-017)

| ID | 테스트명 | 검증 내용 | 관련 불변식 |
|----|---------|----------|------------|
| **BD-017** | `test_bd017_prompt_no_shell_injection` | 프롬프트에 `$(rm -rf /)` 포함 → 위치 인자로 안전 전달 | INV-CX-8 |

### 8.7 엔진 통합 (BD-018)

| ID | 테스트명 | 검증 내용 | 관련 불변식 |
|----|---------|----------|------------|
| **BD-018** | `test_bd018_notify_complete_called` | exit 0 → _notify_complete(workflow_id, block_id) 호출 | INV-CX-10 |

---

## 9. 등록 체크리스트

구현 완료 후 아래 4곳에 CodexAdapter가 등록되어야 함:

- [ ] `brick/brick/adapters/codex.py` — 실 구현 (stub 대체)
- [ ] `brick/brick/adapters/__init__.py` — CodexAdapter export
- [ ] `brick/brick/dashboard/plugin_manager.py` — _FALLBACK_ADAPTERS에 codex 추가
- [ ] `brick/brick/dashboard/routes/engine_bridge.py` — init_engine()에 codex 등록 + import

---

## 10. E2E 시나리오 워크스루

### 시나리오: 프리셋에서 codex 어댑터로 QA 블록 실행

```
1. 사용자가 대시보드에서 "Do + Codex QA" 프리셋으로 워크플로우 시작
   → POST /engine/start { preset_name: "do-codex-qa", feature: "my-feature" }

2. WorkflowExecutor가 do 블록 실행 (adapter: claude_local)
   → ClaudeLocalAdapter.start_block() → 코드 구현

3. do 블록 완료 → Gate handler 실행: `codex review --uncommitted`
   → 이것은 command gate로 셸에서 직접 실행 (어댑터 아님)

4. [향후] codex-qa 블록이 adapter: codex로 실행되는 경우:
   → AdapterRegistry.get("codex") → CodexAdapter
   → start_block() → asyncio.create_subprocess_exec("codex", "--quiet", ...)
   → 프롬프트: "TASK: 코드 리뷰\nCONTEXT: {...}"
   → Codex CLI가 작업 디렉토리에서 코드 분석
   → exit 0 → 상태 파일 completed → _notify_complete()
   → EnginePoller가 check_status() → completed → Gate 실행

5. 실패 시:
   → exit 1 → 상태 파일 failed + stderr 기록
   → EnginePoller가 check_status() → failed → retry (max_retries 횟수만큼)
```

### 시나리오: Codex 바이너리 미설치

```
1. start_block() → asyncio.create_subprocess_exec("codex", ...)
2. FileNotFoundError 발생
3. 상태 파일에 { status: "failed", error: "Command not found: codex" } 기록
4. 엔진은 정상 동작 계속. 해당 블록만 failed 처리.
5. block.fallback_adapter가 설정되어 있으면 폴백 어댑터로 전환.
```

---

## 11. 구현 우선순위

| 순서 | 파일 | 작업 | 예상 줄 수 |
|------|------|------|-----------|
| 1 | `codex.py` | stub → 실 구현 | ~250줄 |
| 2 | `__init__.py` | export 추가 | +2줄 |
| 3 | `plugin_manager.py` | fallback 등록 | +1줄 |
| 4 | `engine_bridge.py` | init_engine 등록 + import | +2줄 |
| 5 | `test_codex_adapter.py` | TDD 18건 | ~300줄 |
| **합계** | | | **~555줄** |

---

## 12. 미래 확장 (Phase 3, 이 Design 범위 밖)

- Codex Responses API 연동 (HTTP 기반, subprocess 대신 API 호출)
- 스트리밍 출력 파싱 (Codex가 JSON 스트리밍 지원 시)
- TeamManagementAdapter 구현 (Codex 멀티 에이전트 지원 시)
- config.yaml 연동 (`~/.codex/config.yaml` 자동 탐지)
