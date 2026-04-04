# Brick 3축 플러그인 레지스트리 Design

> **피처**: brick-3axis-plugin (Gate/Link/Adapter 플러그인화 + claude_local)
> **레벨**: L2
> **작성**: PM | 2026-04-04
> **TASK**: docs/tasks/TASK-brick-3axis-plugin.md
> **레퍼런스**: Paperclip `packages/adapters/claude-local/src/server/execute.ts`

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| **피처** | brick-3axis-plugin |
| **핵심** | 3축(Gate/Link/Adapter) `match`/`elif`/하드코딩 → dict 기반 플러그인 레지스트리 + claude_local 신규 |
| **제약** | TeamAdapter ABC 변경 금지, 기존 어댑터 수정 금지, 엔진 동작 변경 X (디스패치만 전환) |

### 결과 요약

| 지표 | 값 |
|------|-----|
| **TDD 케이스** | 35건 (GR-01~07, LR-01~07, AR-01~06, CL-01~12, IT-01~03) |
| **불변식** | 10건 (INV-01 ~ INV-10) |
| **변경 파일** | 7건 (신규 1, 수정 6) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 3축 모두 코드 직접 수정 없이 확장 불가 → 오픈소스 배포해도 포크 필수 |
| **Solution** | dict 기반 레지스트리 + `register()` API → 코드 수정 없이 플러그인 추가 |
| **Function UX Effect** | `gate_executor.register_gate("my-type", handler)` 한 줄로 커스텀 Gate 추가 |
| **Core Value** | "누구든 자기만의 Gate/Link/Adapter를 추가" = 오픈소스 확장성의 기반 |

---

## 0. 6단계 사고 프로세스

### Step 1: TASK 재해석

브릭 3축의 현재 확장 불가능한 구조:
- **Gate**: `match handler.type:` 7개 하드코딩 (`gates/base.py:14-29`)
- **Link**: `if/elif` 체인 6개 하드코딩 (`state_machine.py:213-262`)
- **Adapter**: `adapter_pool` dict 수동 등록 (`engine_bridge.py:78-83`)
- **PresetValidator**: `VALID_*` 상수 셋 3개 하드코딩 (`preset_validator.py:8-11`)

→ 전부 dict 기반 레지스트리로 전환. 빌트인 자동 등록 + 외부 `register()` 호출로 확장.

### Step 2: 영향범위

| 파일 | 변경 유형 | 변경 내용 |
|------|----------|----------|
| `brick/brick/adapters/claude_local.py` | **신규** | ClaudeLocalAdapter (~150줄) |
| `brick/brick/gates/base.py` | 수정 | `match` → `self._handlers` dict lookup |
| `brick/brick/gates/concrete.py` | 수정 | `__init__`에서 `_register_builtins()` 호출 |
| `brick/brick/engine/state_machine.py` | 수정 | `elif` → `self._link_handlers` dict lookup |
| `brick/brick/engine/preset_validator.py` | 수정 | `VALID_*` 상수 → 레지스트리 인자 기반 동적 조회 |
| `brick/brick/dashboard/routes/engine_bridge.py` | 수정 | import + adapter_pool에 `claude_local` 추가 |
| `brick/brick/adapters/__init__.py` | 수정 | export 추가 |

**변경하지 않는 파일:**
- `base.py` (TeamAdapter ABC) — 인터페이스 불변
- `claude_agent_teams.py` — 기존 tmux+MCP 유지
- `claude_code.py` — 기존 유지
- `webhook.py`, `human.py` — 기존 유지
- 프리셋 YAML 7개 — 무변경

### Step 3: 선행 조건

- 3×3 자유도 코드 존재 ✅ (engine-100pct, 3x3-gap-fill 설계 완료)
- Paperclip execute.ts 분석 완료 ✅

### Step 4: 의존성

- engine-100pct Design의 RetryAdapterCommand, staleness 감지 → claude_local도 동일 패턴 사용. 충돌 없음.
- 3x3-gap-fill Design의 compete/cron → 링크 레지스트리로 자연 흡수. 충돌 없음.
- brick-agent-abstraction Design → 이 Design이 **상위 호환으로 대체**. claude_local 부분 포함.

### Step 5: 방법 도출

| 방법 | 장점 | 단점 |
|------|------|------|
| A: Python `entry_points` 기반 자동 발견 | pip install로 플러그인 추가 | 과잉. 브릭은 아직 단일 repo |
| **B: dict 기반 인스턴스 레지스트리** | 최소 변경, 기존 코드 구조 유지, 즉시 `register()` 가능 | 패키지 자동 발견 없음 (수동 import 필요) |
| C: decorator 기반 | `@register_gate("type")` | 임포트 순서 의존. 사이드이펙트 |

**선택: B** — 가장 단순하고 안전. 기존 클래스 구조를 유지하면서 디스패치만 dict로 전환.
entry_points(A) 방식은 오픈소스 배포 시 B 위에 추가하면 됨 (호환).

### Step 6: 팀원 배정

PM: Design (이 문서) → CTO → backend-dev: 구현 + TDD 35건

---

## 1. 레지스트리 패턴 — 공통 원칙

3축 모두 동일한 패턴:

```
Before: match/elif 하드코딩 → 7/6/4개 고정
After:  self._handlers: dict[str, HandlerFn] = {}
        self.register("type", handler)
        handler = self._handlers[type]
```

### 핵심 규칙

1. **인스턴스 레지스트리**: 모듈 전역 dict가 아닌 클래스 인스턴스 `self._handlers`. 테스트 격리 보장.
2. **빌트인 자동 등록**: `__init__` → `_register_builtins()`. 별도 호출 불필요.
3. **외부 등록 API**: `register_*(name, handler)` 메서드. 1줄로 플러그인 추가.
4. **동작 변경 없음**: 기존 빌트인 핸들러 로직은 한 줄도 수정 안 함. 디스패치 구조만 전환.
5. **PresetValidator 동적 연동**: 레지스트리에 등록된 타입만 유효로 인정.

---

## 2. Gate Registry (Brick 축)

### 2.1 현재 구조

```python
# gates/base.py — GateExecutor.execute()
match handler.type:
    case "command": return await self._run_command(handler, context)
    case "http":    return await self._run_http(handler, context)
    # ... 7개 case
    case _:         raise ValueError(f"Unknown gate type: {handler.type}")
```

### 2.2 변경 후

```python
# gates/base.py — GateExecutor

# 타입 정의
GateHandlerFn = Callable[[GateHandler, dict], Awaitable[GateResult]]

class GateExecutor:
    def __init__(self):
        self._handlers: dict[str, GateHandlerFn] = {}
        self._register_builtins()

    def _register_builtins(self):
        """서브클래스가 오버라이드하여 빌트인 등록."""
        pass

    def register_gate(self, type_name: str, handler: GateHandlerFn) -> None:
        """외부 Gate 핸들러 등록. 기존 타입 덮어쓰기 가능."""
        self._handlers[type_name] = handler

    def registered_gate_types(self) -> set[str]:
        """등록된 Gate 타입 목록. PresetValidator 연동용."""
        return set(self._handlers.keys())

    async def execute(self, handler: GateHandler, context: dict) -> GateResult:
        fn = self._handlers.get(handler.type)
        if fn is None:
            raise ValueError(f"Unknown gate type: {handler.type}")
        return await fn(handler, context)

    # run_gates, _run_sequential, _run_parallel, _run_vote — 변경 없음
```

```python
# gates/concrete.py — ConcreteGateExecutor

class ConcreteGateExecutor(GateExecutor):
    def __init__(self, llm_client=None, agent_runner=None):
        self.llm_client = llm_client
        self.agent_runner = agent_runner
        super().__init__()  # → _register_builtins() 호출

    def _register_builtins(self):
        self.register_gate("command", self._run_command)
        self.register_gate("http", self._run_http)
        self.register_gate("prompt", self._run_prompt)
        self.register_gate("agent", self._run_agent)
        self.register_gate("review", self._run_review)
        self.register_gate("metric", self._run_metric)
        self.register_gate("approval", self._run_approval)

    # _run_command, _run_http 등 7개 메서드 — 코드 변경 0줄
```

### 2.3 외부 플러그인 사용법

```python
# 사용자 코드
async def my_custom_gate(handler: GateHandler, context: dict) -> GateResult:
    # 커스텀 검증 로직
    return GateResult(passed=True, detail="Custom check passed", type="my-check")

gate_executor.register_gate("my-check", my_custom_gate)

# 프리셋 YAML에서 사용
# gate:
#   handlers:
#     - type: my-check
#       ...
```

---

## 3. Link Registry (Link 축)

### 3.1 현재 구조

```python
# state_machine.py — _find_next_blocks()
for link in wf.definition.links:
    if link.type == "sequential": ...
    elif link.type == "loop": ...
    elif link.type == "branch": ...
    elif link.type == "parallel": ...
    elif link.type == "compete": ...
    elif link.type == "cron": ...
    # 6개 elif
```

### 3.2 LinkResolveResult 데이터 클래스

각 링크 핸들러가 반환하는 통일된 결과:

```python
@dataclass
class LinkResolveResult:
    next_ids: list[str]          # 다음 큐잉할 블록 ID들
    commands: list[Command]       # 부가 커맨드 (CompeteStartCommand 등)
    context_updates: dict         # 컨텍스트 변경 (루프 카운터 등)
```

### 3.3 변경 후

```python
# state_machine.py — StateMachine

# 타입 정의
LinkHandlerFn = Callable[
    [LinkDefinition, WorkflowInstance, str, dict],
    LinkResolveResult
]

class StateMachine:
    def __init__(self):
        self._link_handlers: dict[str, LinkHandlerFn] = {}
        self._register_builtins()

    def _register_builtins(self):
        self.register_link("sequential", self._resolve_sequential)
        self.register_link("loop", self._resolve_loop)
        self.register_link("branch", self._resolve_branch)
        self.register_link("parallel", self._resolve_parallel)
        self.register_link("compete", self._resolve_compete)
        self.register_link("cron", self._resolve_cron)

    def register_link(self, type_name: str, handler: LinkHandlerFn) -> None:
        self._link_handlers[type_name] = handler

    def registered_link_types(self) -> set[str]:
        return set(self._link_handlers.keys())
```

### 3.4 _find_next_blocks 리팩터링

```python
def _find_next_blocks(self, wf, block_id) -> list[str]:
    from brick.engine.condition_evaluator import evaluate_condition
    next_ids = []
    extra_commands = []
    context = wf.context

    for link in wf.definition.links:
        if link.from_block != block_id:
            continue

        handler = self._link_handlers.get(link.type)
        if handler is None:
            continue  # 미등록 링크 타입 → 무시 (안전)

        result = handler(link, wf, block_id, context)
        next_ids.extend(result.next_ids)
        extra_commands.extend(result.commands)
        context.update(result.context_updates)

    # extra_commands는 호출부에서 처리
    self._extra_link_commands = extra_commands
    return next_ids
```

### 3.5 빌트인 핸들러 추출 (로직 변경 0)

기존 elif 블록을 그대로 메서드로 분리. **로직 변경 없음**, 코드 이동만:

```python
def _resolve_sequential(self, link, wf, block_id, context) -> LinkResolveResult:
    return LinkResolveResult(next_ids=[link.to_block], commands=[], context_updates={})

def _resolve_loop(self, link, wf, block_id, context) -> LinkResolveResult:
    from brick.engine.condition_evaluator import evaluate_condition
    if evaluate_condition(link.condition, context):
        loop_key = f"_loop_{block_id}_{link.to_block}"
        loop_count = context.get(loop_key, 0)
        if loop_count < link.max_retries:
            return LinkResolveResult(
                next_ids=[link.to_block],
                commands=[],
                context_updates={loop_key: loop_count + 1},
            )
    return LinkResolveResult(next_ids=[], commands=[], context_updates={})

def _resolve_branch(self, link, wf, block_id, context) -> LinkResolveResult:
    from brick.engine.condition_evaluator import evaluate_condition
    if evaluate_condition(link.condition, context):
        return LinkResolveResult(next_ids=[link.to_block], commands=[], context_updates={})
    return LinkResolveResult(next_ids=[], commands=[], context_updates={})

def _resolve_parallel(self, link, wf, block_id, context) -> LinkResolveResult:
    return LinkResolveResult(next_ids=[link.to_block], commands=[], context_updates={})

def _resolve_compete(self, link, wf, block_id, context) -> LinkResolveResult:
    if link.teams:
        return LinkResolveResult(
            next_ids=[],
            commands=[CompeteStartCommand(
                block_id=link.to_block,
                teams=link.teams,
                judge=link.judge or {},
            )],
            context_updates={},
        )
    return LinkResolveResult(next_ids=[link.to_block], commands=[], context_updates={})

def _resolve_cron(self, link, wf, block_id, context) -> LinkResolveResult:
    if hasattr(self, 'cron_scheduler') and self.cron_scheduler:
        from brick.engine.cron_scheduler import CronJob
        to_block = wf.blocks.get(link.to_block)
        self.cron_scheduler.register(CronJob(
            workflow_id=wf.id,
            from_block_id=block_id,
            to_block_id=link.to_block,
            adapter=to_block.adapter if to_block else "",
            schedule=link.schedule or "0 * * * *",
            max_runs=link.max_retries or 999,
        ))
    return LinkResolveResult(next_ids=[], commands=[], context_updates={})
```

### 3.6 외부 플러그인 사용법

```python
# 사용자 코드
def my_priority_link(link, wf, block_id, context) -> LinkResolveResult:
    # 우선순위 기반 라우팅
    priority = context.get("priority", "normal")
    if priority == "high":
        return LinkResolveResult(next_ids=[link.to_block], commands=[], context_updates={})
    return LinkResolveResult(next_ids=[], commands=[], context_updates={})

state_machine.register_link("priority", my_priority_link)

# 프리셋 YAML
# links:
#   - from: plan
#     to: do
#     type: priority
```

---

## 4. Adapter Registry (Team 축)

### 4.1 현재 구조

```python
# engine_bridge.py — 수동 dict
adapter_pool = {
    "claude_agent_teams": ClaudeAgentTeamsAdapter({}),
    "claude_code": ClaudeCodeAdapter({}),
    "webhook": WebhookAdapter({}),
    "human": HumanAdapter({}),
}
```

### 4.2 변경: dict 호환 레지스트리

WorkflowExecutor가 `self.adapter_pool[name]` 구문을 사용하므로, dict 호환 인터페이스 유지:

```python
# engine_bridge.py 내부 (별도 파일 불필요)

class AdapterRegistry:
    """dict 호환 어댑터 레지스트리. WorkflowExecutor adapter_pool 대체."""

    def __init__(self):
        self._adapters: dict[str, TeamAdapter] = {}

    def register(self, name: str, adapter: TeamAdapter) -> None:
        self._adapters[name] = adapter

    def get(self, name: str) -> TeamAdapter:
        if name not in self._adapters:
            raise KeyError(f"Unknown adapter: {name}")
        return self._adapters[name]

    def registered_adapter_types(self) -> set[str]:
        return set(self._adapters.keys())

    # dict 호환 (WorkflowExecutor 무변경)
    def __getitem__(self, name: str) -> TeamAdapter:
        return self.get(name)

    def __contains__(self, name: str) -> bool:
        return name in self._adapters

    def items(self):
        return self._adapters.items()
```

### 4.3 빌트인 등록

```python
# engine_bridge.py — init_engine()

def init_engine(root: str = ".bkit/") -> None:
    # ... 기존 코드 ...

    adapter_pool = AdapterRegistry()
    adapter_pool.register("claude_agent_teams", ClaudeAgentTeamsAdapter({}))
    adapter_pool.register("claude_code", ClaudeCodeAdapter({}))
    adapter_pool.register("claude_local", ClaudeLocalAdapter({}))  # 신규
    adapter_pool.register("webhook", WebhookAdapter({}))
    adapter_pool.register("human", HumanAdapter({}))

    # WorkflowExecutor는 adapter_pool[name] 구문 그대로 사용 (무변경)
    we = WorkflowExecutor(
        ...,
        adapter_pool=adapter_pool,
    )
```

### 4.4 외부 플러그인 사용법

```python
# 사용자 코드
class MyCustomAdapter(TeamAdapter):
    async def start_block(self, block, context): ...
    async def check_status(self, eid): ...
    async def get_artifacts(self, eid): ...
    async def cancel(self, eid): ...

adapter_pool.register("my-agent", MyCustomAdapter())
```

---

## 5. PresetValidator 동적 연동

### 5.1 현재 구조

```python
# preset_validator.py
VALID_LINK_TYPES = {"sequential", "parallel", "compete", "loop", "cron", "branch"}
VALID_GATE_TYPES = {"command", "http", "prompt", "agent", "review", "metric", "approval"}
VALID_ADAPTERS = {"claude_agent_teams", "claude_code", "codex", "human", ...}
```

### 5.2 변경 후

모듈 상수 제거 → 레지스트리에서 동적 조회:

```python
class PresetValidator:
    def __init__(
        self,
        gate_types: set[str] | None = None,
        link_types: set[str] | None = None,
        adapter_types: set[str] | None = None,
    ):
        # 레지스트리 미전달 시 기존 상수를 기본값으로 (하위호환)
        self._gate_types = gate_types or DEFAULT_GATE_TYPES
        self._link_types = link_types or DEFAULT_LINK_TYPES
        self._adapter_types = adapter_types or DEFAULT_ADAPTERS

    def validate(self, definition):
        errors = []
        # ...
        if link.type not in self._link_types:     # 기존: VALID_LINK_TYPES
            errors.append(...)
        if handler.type not in self._gate_types:   # 기존: VALID_GATE_TYPES
            errors.append(...)
        if team.adapter not in self._adapter_types: # 기존: VALID_ADAPTERS
            errors.append(...)
```

### 5.3 engine_bridge에서 연결

```python
def init_engine(root: str = ".bkit/") -> None:
    # ...
    ge = ConcreteGateExecutor(...)
    sm = StateMachine()

    val = PresetValidator(
        gate_types=ge.registered_gate_types(),
        link_types=sm.registered_link_types(),
        adapter_types=adapter_pool.registered_adapter_types(),
    )
```

**효과**: 커스텀 Gate/Link/Adapter를 등록하면 PresetValidator가 자동으로 인식. 별도 상수 수정 불필요.

---

## 6. claude_local 어댑터 (Team 축 신규)

### 6.1 Paperclip 패턴 매핑

Paperclip `execute.ts`에서 가져올 핵심 패턴 5가지:

| # | Paperclip 패턴 | 위치 | 브릭 적용 |
|---|---------------|------|----------|
| 1 | subprocess spawn | `runChildProcess(runId, command, args, {cwd, env, shell: false})` | `asyncio.create_subprocess_exec("claude", *args, cwd=cwd, env=env)` |
| 2 | env merge | `for (const [key, value] of Object.entries(envConfig)) { env[key] = value }` (L232-234) | `config["env"]` dict → `os.environ` 복사본에 merge |
| 3 | nesting guard 제거 | `CLAUDECODE` 등 4개 삭제 (server-utils.ts L774-783) | 동일 4개 제거 |
| 4 | timeout/grace | SIGTERM → graceSec → SIGKILL (server-utils.ts L813-824) | `asyncio.wait_for` + terminate → kill |
| 5 | CLI args 빌드 | `--print -`, `--output-format stream-json`, `--model` (L419-433) | 동일 args |

### 6.2 Config Schema

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
```

전체 옵션:

| 키 | 타입 | 기본값 | 설명 |
|----|------|--------|------|
| `command` | string | `"claude"` | CLI 경로 |
| `model` | string | `""` | `--model` |
| `cwd` | string | `""` | 작업 디렉토리 |
| `dangerouslySkipPermissions` | bool | `false` | `--dangerously-skip-permissions` |
| `timeoutSec` | int | `0` | 타임아웃 (0=무제한) |
| `graceSec` | int | `20` | SIGTERM→SIGKILL 유예 |
| `maxTurns` | int | `0` | `--max-turns` (0=무제한) |
| `extraArgs` | list | `[]` | 추가 CLI 인자 |
| `env` | dict | `{}` | 환경변수 주입 (Agent Teams 등) |

### 6.3 클래스 구조

```python
# brick/brick/adapters/claude_local.py

NESTING_GUARD_VARS = [
    "CLAUDECODE",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_SESSION",
    "CLAUDE_CODE_PARENT_SESSION",
]

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
        self._processes: dict[str, asyncio.subprocess.Process] = {}

    async def start_block(self, block, context) -> str:
        ...  # § 6.4

    async def check_status(self, execution_id) -> AdapterStatus:
        ...  # § 6.5

    async def cancel(self, execution_id) -> bool:
        ...  # § 6.6

    async def get_artifacts(self, execution_id) -> list[str]:
        ...  # state file 기반
```

### 6.4 start_block 흐름

```
start_block(block, context)
│
├─ 1. execution_id = f"cl-{block.id}-{int(time.time())}"
│
├─ 2. env 빌드 (_build_env)
│   ├─ os.environ 복사
│   ├─ nesting guard 4개 제거 (Paperclip server-utils L774-783)
│   ├─ BRICK_EXECUTION_ID, BRICK_BLOCK_ID 주입
│   ├─ config.env merge — string 값만 (Paperclip execute.ts L232-234)
│   └─ PATH 미존재 시 기본값 보장
│
├─ 3. args 빌드 (_build_args)
│   └─ ["--print", "-", "--output-format", "stream-json", "--verbose"]
│     + [--model M] + [--dangerously-skip-permissions] + [--max-turns N]
│     + extra_args
│
├─ 4. prompt = f"TASK: {block.what}\n\nCONTEXT:\n{json.dumps(context)}"
│
├─ 5. state file 초기화 (status: running)
│
├─ 6. asyncio.create_subprocess_exec(command, *args, stdin=PIPE, stdout=PIPE, stderr=PIPE)
│     → stdin.write(prompt) → stdin.close()
│
├─ 7. _processes[eid] = process
│
├─ 8. asyncio.create_task(_monitor_process(eid, process))
│
└─ return execution_id
```

### 6.5 _monitor_process (백그라운드)

```
_monitor_process(eid, process)
│
├─ timeout 적용 (timeoutSec > 0)
│   └─ asyncio.wait_for → TimeoutError 시:
│       ├─ process.terminate() (SIGTERM)
│       ├─ await asyncio.sleep(grace_sec)
│       └─ process.kill() (SIGKILL, if still alive)
│
├─ stdout/stderr 수집 (최대 32KB)
│
├─ state file 업데이트:
│   ├─ exit 0 → completed
│   ├─ timeout → failed + "타임아웃"
│   └─ non-zero → failed + stderr 첫 줄
│
└─ _processes에서 제거
```

### 6.6 cancel

```python
async def cancel(self, execution_id: str) -> bool:
    process = self._processes.get(execution_id)
    if process and process.returncode is None:
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=self.grace_sec)
        except asyncio.TimeoutError:
            process.kill()
    self._write_state(execution_id, {"status": "failed", "error": "Cancelled by engine"})
    self._processes.pop(execution_id, None)
    return True
```

---

## 7. Paperclip → 브릭 매핑 상세

개발자 참조용 1:1 매핑:

| Paperclip (TypeScript) | 브릭 (Python) |
|------------------------|---------------|
| `execute.ts:309` `execute(ctx)` | `claude_local.py` `start_block(block, context)` |
| `execute.ts:232-234` env merge loop | `_build_env()` 내 for loop |
| `execute.ts:419-433` `buildClaudeArgs()` | `_build_args()` |
| `server-utils.ts:774-783` nesting var strip | `_build_env()` 내 `NESTING_GUARD_VARS` pop |
| `server-utils.ts:787` `spawn(target.command, target.args, {shell: false})` | `asyncio.create_subprocess_exec(command, *args)` |
| `server-utils.ts:795-797` stdin write+end | `process.stdin.write(prompt); process.stdin.close()` |
| `server-utils.ts:813-824` timeout SIGTERM→SIGKILL | `asyncio.wait_for` + terminate → kill |
| `types.ts:264-266` `ServerAdapterModule.execute` | `TeamAdapter.start_block` (ABC 계약) |

---

## 8. 하위호환 전략

| 대상 | 전략 |
|------|------|
| `TeamAdapter` ABC | **변경 없음** |
| `claude_agent_teams.py` | **변경 없음** |
| `claude_code.py` | **변경 없음** |
| 기존 프리셋 7개 | **변경 없음**. `adapter: claude_agent_teams` 계속 동작 |
| `GateExecutor.execute()` | 시그니처 동일. 내부 dispatch만 match→dict |
| `StateMachine._find_next_blocks()` | 반환값 동일 (`list[str]`). 내부만 elif→dict |
| `PresetValidator()` | 인자 없이 생성 시 기존 상수 기본값 사용 |
| `WorkflowExecutor.adapter_pool` | `AdapterRegistry.__getitem__` → dict 호환 |

---

## 9. TDD 케이스 (35건)

### 9.1 Gate Registry (GR-01 ~ GR-07)

| ID | 테스트 | 검증 |
|----|--------|------|
| **GR-01** | `ConcreteGateExecutor()` 생성 → 빌트인 7종 등록됨 | `registered_gate_types()` == 7개 |
| **GR-02** | `register_gate("custom", handler)` → `execute(type="custom")` 성공 | GateResult 반환 |
| **GR-03** | 미등록 gate type → `execute()` → ValueError | 예외 메시지에 타입명 포함 |
| **GR-04** | `_run_command` 동작 회귀 — exit 0 → passed=True | 기존 동작 유지 |
| **GR-05** | 커스텀 gate 등록 + PresetValidator → 검증 통과 | ValidationError 없음 |
| **GR-06** | 미등록 gate + PresetValidator → 에러 | ValidationError 1건 |
| **GR-07** | `register_gate` 중복 호출 → 최신 handler 사용 | 두 번째 handler 실행됨 |

### 9.2 Link Registry (LR-01 ~ LR-07)

| ID | 테스트 | 검증 |
|----|--------|------|
| **LR-01** | `StateMachine()` 생성 → 빌트인 6종 등록됨 | `registered_link_types()` == 6개 |
| **LR-02** | `register_link("custom", handler)` → `_find_next_blocks`에서 라우팅 | next_ids에 결과 포함 |
| **LR-03** | 미등록 link type → `_find_next_blocks` → 무시 (빈 list) | next_ids == [] |
| **LR-04** | sequential 링크 회귀 — 다음 블록 반환 | next_ids == [to_block] |
| **LR-05** | loop 링크 회귀 — 조건 충족 시 재실행 | next_ids == [to_block] |
| **LR-06** | 커스텀 link 등록 + PresetValidator → 통과 | ValidationError 없음 |
| **LR-07** | 미등록 link + PresetValidator → 에러 | ValidationError 1건 |

### 9.3 Adapter Registry (AR-01 ~ AR-06)

| ID | 테스트 | 검증 |
|----|--------|------|
| **AR-01** | `AdapterRegistry` + 빌트인 5종 등록 (claude_local 포함) | `registered_adapter_types()` == 5개 |
| **AR-02** | `register("custom", adapter)` → `get("custom")` | adapter 인스턴스 반환 |
| **AR-03** | 미등록 adapter → `get()` → KeyError | 예외 |
| **AR-04** | `registry["name"]` dict 호환 | `__getitem__` 동작 |
| **AR-05** | 커스텀 adapter 등록 + PresetValidator → 통과 | ValidationError 없음 |
| **AR-06** | 미등록 adapter + PresetValidator → warning | severity="warning" |

### 9.4 claude_local (CL-01 ~ CL-12)

| ID | 테스트 | 검증 |
|----|--------|------|
| **CL-01** | `start_block` → subprocess + execution_id `cl-{block_id}-{ts}` 형식 | regex 매치 |
| **CL-02** | `config.env: {CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"}` → env 주입 | subprocess env에 키 존재 |
| **CL-03** | nesting guard 4개 제거 | env에 CLAUDECODE 등 없음 |
| **CL-04** | `--model`, `--dangerously-skip-permissions` args 포함 | args 리스트 검증 |
| **CL-05** | exit 0 → state file completed | status="completed" |
| **CL-06** | exit 1 → state file failed | status="failed" |
| **CL-07** | timeout → SIGTERM → SIGKILL | terminate, kill 호출됨 |
| **CL-08** | cancel → PID SIGTERM + state file failed | status="failed" |
| **CL-09** | check_status → state file 읽기 | AdapterStatus 반환 |
| **CL-10** | 10분 초과 staleness → failed | error에 "타임아웃" |
| **CL-11** | command 미존재 → FileNotFoundError → failed | "Command not found" |
| **CL-12** | config.env 비-string 값 무시 | int/dict 스킵, string만 주입 |

### 9.5 통합 (IT-01 ~ IT-03)

| ID | 테스트 | 검증 |
|----|--------|------|
| **IT-01** | 기존 프리셋 7개 로드 → regression 없음 | 전부 validation pass |
| **IT-02** | PresetValidator가 3개 레지스트리 동적 조회 | 커스텀 등록 후 validate 통과 |
| **IT-03** | tmux 없는 환경에서 `claude_local` 어댑터 엔진 시작 | 에러 없이 start |

---

## 10. 불변식 (10건)

| ID | 불변식 | 검증 방법 |
|----|--------|----------|
| **INV-01** | `TeamAdapter` ABC 인터페이스 변경 없음 | `base.py` diff = 0 |
| **INV-02** | `claude_agent_teams.py` 변경 없음 | diff = 0 |
| **INV-03** | `claude_code.py` 변경 없음 | diff = 0 |
| **INV-04** | Gate 빌트인 7종 동작 유지 | 기존 테스트 전부 통과 |
| **INV-05** | Link 빌트인 6종 동작 유지 | 기존 테스트 전부 통과 |
| **INV-06** | 기존 프리셋 7개 무변경 | YAML diff = 0 |
| **INV-07** | subprocess `shell=False` | `create_subprocess_exec` 사용 (exec, not shell) |
| **INV-08** | nesting guard 4개 항상 제거 | `_build_env` 내 pop 4회 |
| **INV-09** | `config.env` string 타입만 주입 | `isinstance(value, str)` 체크 |
| **INV-10** | `WorkflowExecutor.adapter_pool` dict 호환 | `__getitem__`, `__contains__` 구현 |

---

## 11. 파일 목록

| 파일 | 유형 | 변경 내용 |
|------|------|----------|
| `brick/brick/adapters/claude_local.py` | **신규** | ClaudeLocalAdapter 전체 (~150줄) |
| `brick/brick/gates/base.py` | 수정 | `match` → `_handlers` dict + `register_gate()` + `registered_gate_types()` |
| `brick/brick/gates/concrete.py` | 수정 | `_register_builtins()` 추가 (7종 등록). 핸들러 코드 변경 0줄 |
| `brick/brick/engine/state_machine.py` | 수정 | `elif` → `_link_handlers` dict + `register_link()` + 6개 메서드 추출 |
| `brick/brick/engine/preset_validator.py` | 수정 | `__init__` 인자로 레지스트리 수신. 상수는 기본값으로 유지 (하위호환) |
| `brick/brick/dashboard/routes/engine_bridge.py` | 수정 | `AdapterRegistry` 클래스 + `claude_local` 등록 + PresetValidator 연결 |
| `brick/brick/adapters/__init__.py` | 수정 | `ClaudeLocalAdapter` export |

---

## 12. 기존 Design과의 관계

| Design | 관계 |
|--------|------|
| **brick-agent-abstraction** | **이 Design이 상위 호환으로 대체**. claude_local 부분 포함 + 3축 레지스트리 추가 |
| brick-bugfix-sprint1 | 충돌 없음. adapter_pool 주입은 sprint1에서 완료 |
| brick-sprint2-engine-sync | 충돌 없음. EnginePoller는 check_status 호출 — 인터페이스 동일 |
| brick-engine-100pct | 충돌 없음. RetryAdapterCommand 패턴 그대로 사용 |
| brick-3x3-gap-fill | 충돌 없음. compete/cron은 링크 레지스트리로 자연 흡수 |

---

## 13. 플러그인 등록 전체 흐름 (사용자 시나리오)

```python
# 1. 사용자가 커스텀 Gate/Link/Adapter를 만든다
class SlackNotifyGate:
    async def __call__(self, handler, context):
        # Slack에 알림 → 응답 대기
        return GateResult(passed=True, detail="Slack approved")

def weighted_random_link(link, wf, block_id, context):
    # 가중치 랜덤 라우팅
    import random
    if random.random() < 0.7:
        return LinkResolveResult(next_ids=[link.to_block], commands=[], context_updates={})
    return LinkResolveResult(next_ids=[], commands=[], context_updates={})

class GPT4Adapter(TeamAdapter):
    async def start_block(self, block, context): ...
    async def check_status(self, eid): ...
    async def get_artifacts(self, eid): ...
    async def cancel(self, eid): ...

# 2. 엔진 초기화 시 등록
gate_executor.register_gate("slack-notify", SlackNotifyGate())
state_machine.register_link("weighted-random", weighted_random_link)
adapter_pool.register("gpt4", GPT4Adapter({}))

# 3. 프리셋 YAML에서 사용
# blocks:
#   - id: review
#     gate:
#       handlers:
#         - type: slack-notify
# links:
#   - from: plan
#     to: do-a
#     type: weighted-random
# teams:
#   review:
#     adapter: gpt4
```
