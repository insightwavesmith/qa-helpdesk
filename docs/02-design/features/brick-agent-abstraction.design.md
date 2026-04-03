# Brick Agent Abstraction Design — claude_local Adapter

> **피처**: brick-agent-abstraction (tmux 없이 subprocess 직접 실행)
> **레벨**: L2
> **작성**: PM | 2026-04-04
> **선행**: brick-bugfix-sprint1 Phase 1 (adapter_pool 주입)
> **TASK**: docs/tasks/TASK-brick-agent-abstraction.md
> **레퍼런스**: Paperclip `packages/adapters/claude-local/src/server/execute.ts`

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| **피처** | brick-agent-abstraction |
| **시작일** | 2026-04-04 |
| **핵심** | tmux 없이 `asyncio.create_subprocess_exec`로 Claude Code CLI 직접 실행 + env 주입으로 Agent Teams 지원 |
| **제약** | TeamAdapter ABC 변경 금지, 기존 프리셋 7개 regression 금지, `claude_agent_teams.py` 수정 금지 |

### 결과 요약

| 지표 | 값 |
|------|-----|
| **TDD 케이스** | 24건 (CL-01 ~ CL-24) |
| **불변식** | 8건 (INV-CL-1 ~ INV-CL-8) |
| **변경 파일** | 4건 (신규 1, 수정 3) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | `claude_agent_teams`, `claude_code` 어댑터가 tmux 로컬 의존 → Smith님 Mac에서만 동작 |
| **Solution** | `claude_local` 어댑터: subprocess 직접 실행 + env 주입 → tmux 없는 환경에서도 동작 |
| **Function UX Effect** | 프리셋 YAML에 `adapter: claude_local` + `config.env` 지정만으로 단일/팀 모드 전환 |
| **Core Value** | "세상 모든 사람이 쓰는 워크플로우 도구"의 첫 단추 — 설치형 오픈소스 단계 |

---

## 0. 6단계 사고 프로세스

### Step 1: TASK 재해석

"tmux 없이 Claude Code CLI를 subprocess로 직접 실행하는 `claude_local` 어댑터를 Python으로 작성. Paperclip의 `execute.ts` 패턴을 포팅하되, `config.env`에 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"`을 넣으면 Agent Teams 모드가 동작하게 만든다."

### Step 2: 영향범위

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `brick/brick/adapters/claude_local.py` | **신규** | ClaudeLocalAdapter 전체 구현 |
| `brick/brick/dashboard/routes/engine_bridge.py` | 수정 (1줄) | adapter_pool에 `claude_local` 추가 |
| `brick/brick/engine/preset_validator.py` | 수정 (1줄) | VALID_ADAPTERS에 `claude_local` 추가 |
| `brick/brick/adapters/__init__.py` | 수정 (1줄) | export 추가 |

**변경하지 않는 파일:**
- `base.py` (TeamAdapter ABC)
- `claude_agent_teams.py` (기존 tmux+MCP 방식 유지)
- `claude_code.py` (기존 유지, 향후 deprecate 후 claude_local alias)
- 프리셋 YAML 7개 (기존 그대로 동작)

### Step 3: 선행 조건

- `TeamAdapter` ABC 존재 ✅
- `adapter_pool` dict 구조 존재 ✅ (`engine_bridge.py:78-83`)
- Paperclip execute.ts 분석 완료 ✅

### Step 4: 의존성

- 다른 Design과 독립 (기존 파일 건드리지 않음)
- Sprint1/Sprint2/Engine100% Design과 충돌 없음

### Step 5: 방법 도출

| 방법 | 장점 | 단점 |
|------|------|------|
| **A: Paperclip 1:1 완전 포팅** | skills/session resume/quota 전부 지원 | 과잉 설계. 브릭에 불필요한 기능 다수 |
| **B: 핵심만 포팅 (subprocess + env + 상태파일)** | 최소 변경, 빠른 구현, 검증 용이 | skills/session resume 미지원 (후속 가능) |

**선택: B** — TASK가 요구하는 건 "tmux 없이 동작 + Agent Teams env 주입". Paperclip의 skills/session/quota는 브릭 엔진에 해당 인프라가 없으므로 포팅 불가. 핵심 패턴(subprocess spawn, env merge, nesting guard, timeout/grace, stdout 파싱)만 가져온다.

### Step 6: 팀원 배정

- PM: Design 작성 (이 문서)
- CTO → backend-dev: `claude_local.py` 구현 + engine_bridge 수정 + TDD 24건

---

## 1. Paperclip 패턴 분석 — 브릭 적용 매핑

Paperclip `execute.ts`에서 가져올 핵심 패턴 5가지:

| # | Paperclip 패턴 | 위치 (execute.ts) | 브릭 적용 |
|---|---------------|------------------|----------|
| 1 | **subprocess spawn** | `runChildProcess(runId, command, args, {cwd, env, shell: false})` | `asyncio.create_subprocess_exec("claude", *args, cwd=cwd, env=env)` |
| 2 | **env merge** | `for (const [key, value] of Object.entries(envConfig)) { env[key] = value }` (L232-234) | `config["env"]` dict를 `os.environ` 복사본에 merge |
| 3 | **nesting guard 제거** | `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SESSION`, `CLAUDE_CODE_PARENT_SESSION` 삭제 (L774-783) | 동일하게 4개 env var 삭제 |
| 4 | **timeout/grace** | SIGTERM → graceSec 대기 → SIGKILL (L813-824) | `asyncio.wait_for` + SIGTERM → grace → SIGKILL |
| 5 | **CLI args 빌드** | `--print`, `--output-format stream-json`, `--verbose`, `--model`, `--dangerously-skip-permissions` (L419-433) | 동일 args 빌드 |

### 포팅하지 않는 것 (이유)

| Paperclip 기능 | 미포팅 이유 |
|---------------|-----------|
| `buildSkillsDir` (skills 심볼릭링크) | 브릭에 skills 인프라 없음. `.bkit/skills`는 별도 체계 |
| `--resume sessionId` (세션 재개) | 브릭 block은 1회 실행 단위. 세션 재개 불필요 |
| `parseClaudeStreamJson` (스트림 파싱) | 1차: exit code + state file 기반 판정. stream 파싱은 후속 |
| `onMeta`, `onSpawn` 콜백 | Paperclip 서버 인프라용. 브릭은 state file로 대체 |
| `billingType`, `costUsd`, `usage` | 브릭에 과금 추적 없음 |

---

## 2. ClaudeLocalAdapter 클래스 설계

### 2.1 클래스 구조

```python
# brick/brick/adapters/claude_local.py

class ClaudeLocalAdapter(TeamAdapter):
    """
    Claude Code CLI를 subprocess로 직접 실행하는 어댑터.
    tmux 의존 없음. Paperclip claude-local 패턴 포팅.
    """

    def __init__(self, config: dict | None = None):
        config = config or {}
        self.command: str = config.get("command", "claude")
        self.model: str = config.get("model", "")
        self.cwd: str = config.get("cwd", "")
        self.timeout_sec: int = config.get("timeoutSec", 0)       # 0 = 무제한
        self.grace_sec: int = config.get("graceSec", 20)
        self.max_turns: int = config.get("maxTurns", 0)            # 0 = 무제한
        self.skip_permissions: bool = config.get("dangerouslySkipPermissions", False)
        self.env_config: dict[str, str] = config.get("env", {})    # Agent Teams 등
        self.extra_args: list[str] = config.get("extraArgs", [])
        self.runtime_dir = Path(config.get("runtimeDir", ".bkit/runtime"))

        # PID 추적 (cancel용)
        self._processes: dict[str, asyncio.subprocess.Process] = {}

    async def start_block(self, block: Block, context: dict) -> str: ...
    async def check_status(self, execution_id: str) -> AdapterStatus: ...
    async def get_artifacts(self, execution_id: str) -> list[str]: ...
    async def cancel(self, execution_id: str) -> bool: ...
```

### 2.2 Config Schema (프리셋 YAML)

```yaml
# 단일 에이전트 모드
do:
  adapter: claude_local
  config:
    model: claude-opus-4-6
    dangerouslySkipPermissions: true

# Agent Teams 모드
do:
  adapter: claude_local
  config:
    model: claude-opus-4-6
    dangerouslySkipPermissions: true
    env:
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"

# 전체 옵션
do:
  adapter: claude_local
  config:
    command: claude                     # CLI 경로 (기본: "claude")
    model: claude-opus-4-6             # --model 플래그
    cwd: /path/to/workspace            # 작업 디렉토리 (기본: 엔진 root)
    dangerouslySkipPermissions: true   # --dangerously-skip-permissions
    timeoutSec: 3600                   # 타임아웃 (초, 0=무제한)
    graceSec: 20                       # SIGTERM 후 SIGKILL까지 유예
    maxTurns: 50                       # --max-turns
    extraArgs: ["--verbose"]           # 추가 CLI 인자
    env:                               # 환경변수 주입
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"
      ANTHROPIC_API_KEY: "sk-..."
```

---

## 3. Subprocess 실행 흐름

### 3.1 start_block 상세

```
start_block(block, context)
│
├─ 1. execution_id 생성: f"cl-{block.id}-{int(time.time())}"
│
├─ 2. 환경변수 빌드 (_build_env)
│   ├─ os.environ 복사
│   ├─ Nesting guard 제거 (4개)
│   ├─ 브릭 컨텍스트 주입 (BRICK_EXECUTION_ID, BRICK_BLOCK_ID)
│   ├─ config.env merge (Agent Teams 등)
│   └─ PATH 보장
│
├─ 3. CLI args 빌드 (_build_args)
│   ├─ ["--print", "-", "--output-format", "stream-json", "--verbose"]
│   ├─ [--model model] (if model)
│   ├─ [--dangerously-skip-permissions] (if skip_permissions)
│   ├─ [--max-turns N] (if max_turns > 0)
│   └─ [...extra_args]
│
├─ 4. prompt 생성: f"TASK: {block.what}\n\nCONTEXT:\n{json.dumps(context)}"
│
├─ 5. state file 초기화 (status: "running")
│
├─ 6. subprocess 실행 (asyncio.create_subprocess_exec)
│   ├─ stdin=PIPE (prompt 전달)
│   ├─ stdout=PIPE, stderr=PIPE
│   ├─ cwd=self.cwd or 엔진 root
│   ├─ env=merged_env
│   └─ shell=False (보안)
│
├─ 7. _processes[execution_id] = process (PID 추적)
│
├─ 8. _monitor_process(execution_id, process) 백그라운드 태스크
│   └─ asyncio.create_task
│
└─ return execution_id
```

### 3.2 _monitor_process (백그라운드)

```
_monitor_process(execution_id, process)
│
├─ timeout 적용 (if timeout_sec > 0)
│   └─ asyncio.wait_for(process.wait(), timeout=timeout_sec)
│       └─ TimeoutError 시:
│           ├─ process.terminate() (SIGTERM)
│           ├─ asyncio.sleep(grace_sec)
│           └─ process.kill() (SIGKILL, if still alive)
│
├─ stdout/stderr 수집
│
├─ exit code 판정:
│   ├─ 0 → status: "completed"
│   ├─ timeout → status: "failed", error: "타임아웃"
│   └─ non-zero → status: "failed", error: stderr 첫 줄
│
├─ state file 업데이트
│   └─ .bkit/runtime/task-state-{execution_id}.json
│
└─ _processes에서 제거
```

### 3.3 Nesting Guard 제거

Paperclip `server-utils.ts:774-783`과 동일. Claude Code CLI가 다른 Claude Code 세션 안에서 실행되면 거부하는데, 브릭 엔진이 Claude Code 세션 안에서 띄워진 경우 이 변수들이 env에 남아있을 수 있다.

```python
NESTING_GUARD_VARS = [
    "CLAUDECODE",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_SESSION",
    "CLAUDE_CODE_PARENT_SESSION",
]

def _build_env(self) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if isinstance(v, str)}

    # 1. Nesting guard 제거
    for var in NESTING_GUARD_VARS:
        env.pop(var, None)

    # 2. 브릭 컨텍스트 주입
    env["BRICK_EXECUTION_ID"] = execution_id
    env["BRICK_BLOCK_ID"] = block.id

    # 3. config.env merge (Paperclip L232-234 패턴)
    for key, value in self.env_config.items():
        if isinstance(value, str):
            env[key] = value

    # 4. PATH 보장 (Paperclip ensurePathInEnv 패턴)
    if "PATH" not in env:
        env["PATH"] = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

    return env
```

### 3.4 CLI Args 빌드

Paperclip `buildClaudeArgs` (execute.ts:419-433) 패턴:

```python
def _build_args(self, prompt: str) -> list[str]:
    args = ["--print", "-", "--output-format", "stream-json", "--verbose"]

    if self.skip_permissions:
        args.append("--dangerously-skip-permissions")
    if self.model:
        args.extend(["--model", self.model])
    if self.max_turns > 0:
        args.extend(["--max-turns", str(self.max_turns)])
    if self.extra_args:
        args.extend(self.extra_args)

    return args
```

stdin으로 prompt를 전달 (Paperclip `opts.stdin` 패턴, server-utils.ts:795-797):

```python
process = await asyncio.create_subprocess_exec(
    self.command, *args,
    stdin=asyncio.subprocess.PIPE,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.PIPE,
    cwd=effective_cwd,
    env=env,
)
process.stdin.write(prompt.encode())
process.stdin.close()
```

---

## 4. 상태 관리

### 4.1 State File 형식

경로: `.bkit/runtime/task-state-{execution_id}.json`

기존 `claude_agent_teams.py`, `claude_code.py`와 동일한 형식 유지:

```json
{
  "status": "running|completed|failed",
  "block_id": "plan",
  "started_at": 1712345678.0,
  "completed_at": 1712345700.0,
  "exit_code": 0,
  "error": null,
  "artifacts": [],
  "metrics": {},
  "stdout_tail": "... (최대 32KB)"
}
```

### 4.2 check_status

```python
async def check_status(self, execution_id: str) -> AdapterStatus:
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

    # staleness 감지 (engine-100pct 패턴)
    try:
        start_ts = float(execution_id.rsplit("-", 1)[-1])
        if time.time() - start_ts > 600:
            return AdapterStatus(
                status="failed",
                error="Claude Local 응답 타임아웃 (10분 초과)",
            )
    except (ValueError, IndexError):
        pass

    return AdapterStatus(status="running")
```

### 4.3 cancel

PID 추적 기반 (tmux 불필요):

```python
async def cancel(self, execution_id: str) -> bool:
    process = self._processes.get(execution_id)
    if process and process.returncode is None:
        process.terminate()  # SIGTERM
        try:
            await asyncio.wait_for(process.wait(), timeout=self.grace_sec)
        except asyncio.TimeoutError:
            process.kill()  # SIGKILL

    self._write_state(execution_id, {
        "status": "failed",
        "error": "Cancelled by engine",
    })
    self._processes.pop(execution_id, None)
    return True
```

---

## 5. 통합 포인트

### 5.1 engine_bridge.py 수정

```python
# 기존 (L78-83)
adapter_pool = {
    "claude_agent_teams": ClaudeAgentTeamsAdapter({}),
    "claude_code": ClaudeCodeAdapter({}),
    "webhook": WebhookAdapter({}),
    "human": HumanAdapter({}),
}

# 변경 후
from brick.adapters.claude_local import ClaudeLocalAdapter

adapter_pool = {
    "claude_agent_teams": ClaudeAgentTeamsAdapter({}),
    "claude_code": ClaudeCodeAdapter({}),
    "claude_local": ClaudeLocalAdapter({}),     # 신규
    "webhook": WebhookAdapter({}),
    "human": HumanAdapter({}),
}
```

### 5.2 preset_validator.py 수정

`VALID_ADAPTERS` 목록에 `"claude_local"` 추가.

### 5.3 프리셋 YAML 호환

기존 7개 프리셋은 `adapter: claude_agent_teams` → 변경 없이 동작.
새 프리셋에서 `adapter: claude_local` 사용 가능.

```yaml
# 예시: 새 프리셋 (tmux 없이 동작)
kind: BrickPreset
metadata:
  name: t-pdca-local
spec:
  blocks:
    - id: plan
      what: "Plan 작성"
      type: plan
      do:
        adapter: claude_local
        config:
          model: claude-opus-4-6
          dangerouslySkipPermissions: true
          env:
            CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"
```

---

## 6. 하위호환 전략

| 대상 | 전략 |
|------|------|
| `claude_agent_teams` 어댑터 | **변경 없음**. tmux+MCP 그대로. Smith님 현재 운영 유지 |
| `claude_code` 어댑터 | **변경 없음**. 향후 `claude_local`로 대체 가능 (별도 TASK) |
| 기존 프리셋 7개 | **변경 없음**. `adapter: claude_agent_teams` 계속 동작 |
| `TeamAdapter` ABC | **변경 없음**. `start_block`, `check_status`, `cancel` 인터페이스 유지 |
| adapter_pool | `claude_local` 키 추가만. 기존 키 제거 없음 |

---

## 7. 에러 처리

### 7.1 claude 명령어 미존재

```python
try:
    process = await asyncio.create_subprocess_exec(self.command, *args, ...)
except FileNotFoundError:
    self._write_state(execution_id, {
        "status": "failed",
        "error": f"Command not found: {self.command}. Claude Code CLI가 설치되어 있는지 확인하세요.",
    })
    return execution_id
```

### 7.2 인증 실패

Claude Code CLI 인증 실패 시 stderr에 `"claude_auth_required"` 또는 login URL 출력. `_monitor_process`에서 stderr 파싱:

```python
if "login" in stderr.lower() or exit_code == 1:
    error_msg = f"Claude 인증 필요. stderr: {stderr[:200]}"
```

### 7.3 exit code 매핑

| exit code | 의미 | state file status |
|-----------|------|------------------|
| 0 | 정상 완료 | `completed` |
| 1 | 일반 에러 | `failed` |
| 137 (SIGKILL) | 타임아웃/강제종료 | `failed` |
| 143 (SIGTERM) | 정상 종료 요청 | `failed` |

---

## 8. TDD 케이스 (24건)

### 8.1 Subprocess 실행 (CL-01 ~ CL-06)

| ID | 테스트 | 검증 |
|----|--------|------|
| **CL-01** | `start_block` → subprocess 실행 + execution_id 반환 | execution_id가 `cl-{block.id}-{timestamp}` 형식 |
| **CL-02** | `start_block` → state file 생성 | `.bkit/runtime/task-state-{eid}.json` 존재, status=running |
| **CL-03** | `_build_args` → 기본 args | `--print`, `-`, `--output-format`, `stream-json`, `--verbose` 포함 |
| **CL-04** | `_build_args` + model 지정 → `--model` 포함 | `--model claude-opus-4-6` |
| **CL-05** | `_build_args` + skip_permissions → `--dangerously-skip-permissions` 포함 | 플래그 존재 |
| **CL-06** | `_build_args` + max_turns=50 → `--max-turns 50` 포함 | 플래그+값 존재 |

### 8.2 Env 주입 (CL-07 ~ CL-11)

| ID | 테스트 | 검증 |
|----|--------|------|
| **CL-07** | `config.env: {CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"}` → env 주입 | subprocess env에 해당 키 존재 |
| **CL-08** | `config.env: {ANTHROPIC_API_KEY: "sk-test"}` → env 주입 | subprocess env에 해당 키 존재 |
| **CL-09** | nesting guard 제거 | `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SESSION`, `CLAUDE_CODE_PARENT_SESSION` 없음 |
| **CL-10** | `config.env` 값이 string이 아닌 경우 무시 | int/dict/list 값 스킵 |
| **CL-11** | PATH 미존재 시 기본 PATH 주입 | `/usr/local/bin:/opt/homebrew/bin:...` 포함 |

### 8.3 프로세스 모니터링 (CL-12 ~ CL-16)

| ID | 테스트 | 검증 |
|----|--------|------|
| **CL-12** | exit code 0 → state file `completed` | status=completed, exit_code=0 |
| **CL-13** | exit code 1 → state file `failed` | status=failed, error 메시지 존재 |
| **CL-14** | timeout 발생 → SIGTERM 전송 | process.terminate() 호출됨 |
| **CL-15** | SIGTERM 후 grace 내 미종료 → SIGKILL | process.kill() 호출됨 |
| **CL-16** | stdout tail 32KB 캡 | state file의 stdout_tail 길이 ≤ 32768 |

### 8.4 check_status (CL-17 ~ CL-19)

| ID | 테스트 | 검증 |
|----|--------|------|
| **CL-17** | state file 존재 + completed → AdapterStatus(completed) | status="completed" |
| **CL-18** | state file 미존재 + 10분 초과 → AdapterStatus(failed) | status="failed", error에 타임아웃 |
| **CL-19** | state file 미존재 + 10분 이내 → AdapterStatus(running) | status="running" |

### 8.5 cancel (CL-20 ~ CL-21)

| ID | 테스트 | 검증 |
|----|--------|------|
| **CL-20** | cancel → SIGTERM → state file failed | status=failed, error="Cancelled by engine" |
| **CL-21** | cancel 후 _processes에서 제거 | `execution_id not in adapter._processes` |

### 8.6 통합 (CL-22 ~ CL-24)

| ID | 테스트 | 검증 |
|----|--------|------|
| **CL-22** | adapter_pool에 `claude_local` 등록 | `"claude_local" in adapter_pool` |
| **CL-23** | command 미존재 → FileNotFoundError → failed state | state file에 "Command not found" |
| **CL-24** | 기존 프리셋 7개 `adapter: claude_agent_teams` → regression 없음 | 모든 프리셋 로드 성공, claude_local 미사용 |

---

## 9. 불변식 (8건)

| ID | 불변식 | 검증 방법 |
|----|--------|----------|
| **INV-CL-1** | `TeamAdapter` ABC 인터페이스 변경 없음 | `base.py` diff = 0 |
| **INV-CL-2** | `claude_agent_teams.py` 변경 없음 | diff = 0 |
| **INV-CL-3** | `claude_code.py` 변경 없음 | diff = 0 |
| **INV-CL-4** | subprocess 실행 시 `shell=False` | `create_subprocess_exec` 사용 (exec, not shell) |
| **INV-CL-5** | nesting guard 4개 변수 항상 제거 | `_build_env` 내 pop 4회 |
| **INV-CL-6** | `config.env`에서 string 타입만 주입 | `isinstance(value, str)` 체크 |
| **INV-CL-7** | execution_id 형식 `cl-{block_id}-{unix_ts}` | regex 검증 가능 |
| **INV-CL-8** | 기존 프리셋 7개 무변경 | YAML 파일 diff = 0 |

---

## 10. Paperclip → 브릭 매핑 상세

개발자가 Paperclip 코드를 보며 구현할 때 참조할 1:1 매핑표.

| Paperclip (TypeScript) | 브릭 (Python) | 비고 |
|------------------------|---------------|------|
| `execute.ts:309` `execute(ctx)` | `claude_local.py` `start_block(block, context)` | 진입점 |
| `execute.ts:232-234` env merge loop | `_build_env()` 내 `for key, value in env_config.items()` | 동일 패턴 |
| `execute.ts:419-433` `buildClaudeArgs()` | `_build_args()` | `--print -` 등 |
| `server-utils.ts:774-783` nesting var strip | `_build_env()` 내 `NESTING_GUARD_VARS` pop | 4개 동일 |
| `server-utils.ts:787` `spawn(target.command, target.args, {shell: false})` | `asyncio.create_subprocess_exec(command, *args)` | shell=False 보장 |
| `server-utils.ts:795-797` stdin write+end | `process.stdin.write(prompt); process.stdin.close()` | prompt 전달 |
| `server-utils.ts:813-824` timeout SIGTERM→SIGKILL | `asyncio.wait_for` + `process.terminate()` → `process.kill()` | 동일 로직 |
| `server-utils.ts:826-840` stdout/stderr capture | `process.communicate()` 또는 stream read | 버퍼 캡 적용 |
| `execute.ts:111` `asString(config.command, "claude")` | `config.get("command", "claude")` | 기본값 |
| `execute.ts:249` `asNumber(config.timeoutSec, 0)` | `config.get("timeoutSec", 0)` | 0=무제한 |
| `execute.ts:319` `asBoolean(config.dangerouslySkipPermissions, false)` | `config.get("dangerouslySkipPermissions", False)` | 기본 False |
| `execute.ts:467-475` `runChildProcess` 호출 | `asyncio.create_subprocess_exec` 호출 | 핵심 실행 |

---

## 11. 파일 목록

| 파일 | 유형 | 변경 내용 |
|------|------|----------|
| `brick/brick/adapters/claude_local.py` | **신규** | ClaudeLocalAdapter 전체 (~150줄) |
| `brick/brick/dashboard/routes/engine_bridge.py` | 수정 | import + adapter_pool에 1줄 추가 |
| `brick/brick/engine/preset_validator.py` | 수정 | VALID_ADAPTERS에 `"claude_local"` 추가 |
| `brick/brick/adapters/__init__.py` | 수정 | export 추가 |

---

## 12. 기존 Design과의 관계

| Design | 충돌 여부 | 이유 |
|--------|----------|------|
| brick-bugfix-sprint1 | 없음 | adapter_pool 주입은 sprint1에서 완료. claude_local은 추가만 |
| brick-sprint2-engine-sync | 없음 | EnginePoller는 check_status 호출. ClaudeLocalAdapter도 동일 인터페이스 |
| brick-engine-100pct | 없음 | RetryAdapterCommand, staleness 감지 — claude_local도 동일 패턴 사용 |
| brick-3x3-gap-fill | 없음 | Adapter 확장은 webhook/human/claude_code. claude_local은 별도 |
