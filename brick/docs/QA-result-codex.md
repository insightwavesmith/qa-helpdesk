# QA 결과 — Codex 담당 (P2 + P3)

> 작성: Codex (subagent) | 기준일: 2026-04-05
> 코드 직접 확인 기준 (추측 없음)
> 담당: P2-A(6건), P2-B(3건), P2-C(12건), P3-F(7건) = 총 28건

---

## 판정 요약

| 구분 | PASS | FAIL | WARN | SKIP | 계 |
|------|------|------|------|------|----|
| P2-A (장애 복구) | 4 | 2 | 0 | 0 | 6 |
| P2-B (경합) | 3 | 0 | 0 | 0 | 3 |
| P2-C (보안) | 10 | 1 | 1 | 0 | 12 |
| P3-F (자유도) | 7 | 0 | 0 | 0 | 7 |
| **합계** | **24** | **3** | **1** | **0** | **28** |

---

## FAIL 목록 (즉시 수정 필요)

| ID | 항목 | 심각도 |
|----|------|--------|
| P2-A01 | 서버 재시작 후 checkpoint 자동 복구 없음 | HIGH |
| P2-A06 | EventBus 핸들러 예외 격리 없음 | MEDIUM |
| P2-C02 | Command gate — interpreter 인자 악용 (python -c, node -e) | **CRITICAL** |

---

## P2-A: 장애 복구 상세

### P2-A01 ❌ FAIL — 서버 재시작 → checkpoint 복구

**확인 코드:** `brick/dashboard/routes/engine_bridge.py` → `init_engine()`

```python
def init_engine(root: str = ".bkit/") -> None:
    # ... StateMachine, EventBus, CheckpointStore 초기화 ...
    # ← 여기에 checkpoint_store.list_active() 기반 자동 복구 코드 없음
    executor = we
```

**문제:** 서버 재시작 시 `checkpoint_store.list_active()`로 활성 워크플로우를 자동 재개하는 로직 없음.
수동으로 `POST /engine/resume/{id}` 호출 필요. 운영 중 재시작 → 진행 중 Building 전부 멈춤.

**수정 코드:**
```python
# engine_bridge.py init_engine() 마지막 부분에 추가
import asyncio as _asyncio
import logging as _logging

_logger = _logging.getLogger(__name__)

async def _auto_recover_workflows() -> None:
    """서버 재시작 후 RUNNING 상태 워크플로우 자동 모니터링 재개."""
    if not checkpoint_store or not executor:
        return
    active_ids = checkpoint_store.list_active()
    _logger.info("auto-recover: %d active workflow(s) found", len(active_ids))
    for wf_id in active_ids:
        instance = checkpoint_store.load(wf_id)
        if not instance:
            continue
        from brick.models.events import BlockStatus
        for block_id, bi in instance.blocks.items():
            if bi.status == BlockStatus.RUNNING and bi.execution_id:
                _logger.info("auto-recover: resume monitoring %s/%s", wf_id, block_id)
                _asyncio.create_task(executor._monitor_block(instance, block_id))

# init_engine() 마지막에:
#   loop = asyncio.get_event_loop()
#   loop.call_soon(lambda: asyncio.ensure_future(_auto_recover_workflows()))
```

---

### P2-A02 ✅ PASS — adapter 프로세스 비정상 종료 → 재시도

**확인 코드:** `executor.py` `_monitor_block()` L700~720

```python
elif status.status == "failed":
    event = Event(type="block.adapter_failed", data={...})
    async with self._checkpoint_lock:
        instance, cmds = self.state_machine.transition(instance, event)
        self.checkpoint.save(instance.id, instance)
    await self._execute_commands(instance, cmds)
    break
```

StateMachine에서 `retry_count < max_retries` → `RetryAdapterCommand(delay=5 * 3^(n-1))` (5s/15s/45s). ✅

---

### P2-A03 ✅ PASS — adapter 재시도 3회 소진

**확인 코드:** `state_machine.py` L200 근방

```python
elif event.type == "block.adapter_failed":
    if block_inst.retry_count < max_retries:
        ...commands.append(RetryAdapterCommand(...))
    else:
        block_inst.status = BlockStatus.FAILED
        wf.status = WorkflowStatus.FAILED
        commands.append(NotifyCommand(type="adapter_exhausted", ...))
```

3회 소진 → FAILED + `adapter_exhausted` 알림 이벤트 발행. ✅

---

### P2-A04 ✅ PASS — Gate 실행 중 예외

**확인 코드:** `concrete.py` 각 `_run_*` 메서드 내 try/except

- `_run_command`: `asyncio.TimeoutError` → GateResult(passed=False) 반환
- `_run_http`: `except Exception as e:` → GateResult(passed=False) 반환
- `_run_prompt`, `_run_agent`: 예외 처리 포함

Gate 예외가 엔진 크래시로 이어지지 않음. ✅

---

### P2-A05 ✅ PASS — Slack 전송 실패

**확인 코드:** `slack_subscriber.py`

```python
def _on_event(self, event: Event) -> None:
    ...
    loop.create_task(self._send_async(text))  # fire-and-forget
```

`_send_async`는 별도 task로 실행 → 실패해도 엔진에 영향 없음. ✅

---

### P2-A06 ❌ FAIL — EventBus 핸들러 예외 격리

**확인 코드:** `event_bus.py` `publish()` 메서드

```python
def publish(self, event: Event) -> None:
    # Call specific type handlers
    for handler in self._handlers.get(event.type, []):
        handler(event)  # ← try/except 없음
    # Call wildcard handlers
    if event.type != "*":
        for handler in self._handlers.get("*", []):
            handler(event)  # ← try/except 없음
```

**문제:** 핸들러 중 하나에서 예외 발생 시, 나머지 핸들러 실행이 중단됨.
예: SlackSubscriber 예외 → workflow.completed 이벤트 처리 핸들러가 미실행 가능.

**수정 코드:**
```python
def publish(self, event: Event) -> None:
    import logging
    _log = logging.getLogger(__name__)
    
    # Call specific type handlers
    for handler in list(self._handlers.get(event.type, [])):
        try:
            handler(event)
        except Exception:
            _log.exception("EventBus handler error (type=%s, handler=%s)", event.type, handler)
    
    # Call wildcard handlers
    if event.type != "*":
        for handler in list(self._handlers.get("*", [])):
            try:
                handler(event)
            except Exception:
                _log.exception("EventBus wildcard handler error (type=%s, handler=%s)", event.type, handler)
```

---

## P2-B: 경합 상세

### P2-B01 ✅ PASS — parallel 블록 동시 complete

**확인 코드:** `executor.py`

```python
self._checkpoint_lock = asyncio.Lock()  # L254
...
# _monitor_block 내:
async with self._checkpoint_lock:
    await self.complete_block(instance.id, block_id)
```

`_checkpoint_lock`이 `_monitor_block`, `_cron_emit`, `_monitor_compete` 전부에 적용됨. ✅

---

### P2-B02 ✅ PASS — compete 블록 동시 complete → 승자 2명 방지

**확인 코드:** `executor.py` `_monitor_compete()`

```python
if winner:
    ...
    try:
        async with self._checkpoint_lock:
            await self.complete_block(instance.id, block_id)
    except Exception:
        pass
    break  # ← 첫 winner 발견 후 즉시 종료
```

Lock 내에서 complete_block 호출. 나머지 팀은 cancel 처리. ✅

---

### P2-B03 ✅ PASS — cron 트리거 + 수동 complete 동시

**확인 코드:** `executor.py` `_cron_emit()`

```python
async with self._checkpoint_lock:
    block_inst.status = BlockStatus.QUEUED
    ...
    self.checkpoint.save(instance.id, instance)
```

cron 트리거도 `_checkpoint_lock` 사용. 수동 complete와 충돌 방지. ✅

---

## P2-C: 보안 상세

### P2-C01 ✅ PASS — Command gate Shell Injection

**확인 코드:** `concrete.py` `_run_command()`

```python
safe_context = {}
for key, value in context.items():
    safe_context[key] = shlex.quote(str(value))
cmd_str = cmd_template.format(**safe_context)
```

context 값에 `; rm -rf /` 가 있어도 `shlex.quote()`로 이스케이프됨. ✅

---

### P2-C02 ❌ FAIL — Command allowlist 우회 (python -c, node -e) — **CRITICAL**

**확인 코드:** `command_allowlist.py`

```python
ALLOWED_COMMANDS: set[str] = {
    "python",   # ← 인터프리터 허용
    "node",     # ← 인터프리터 허용
    "npm",      # ← lifecycle scripts 가능
    "git",      # ← git config 조작 가능
    ...
}

BLOCKED_ARGS: list[str] = [
    "--force", "-rf", "rm ", "sudo", "chmod", "chown",
    "mkfs", "dd ", "> /dev", "| sh", "| bash", "$((", "`"
]
```

**실제 검증 결과 (코드 직접 실행):**
```
python -c 'import subprocess; subprocess.run(["cat", "/etc/passwd"])' → allowed=True ✗
node -e 'require("child_process").execSync("id")'                     → allowed=True ✗
git config --global user.email "attacker@evil.com"                    → allowed=True ✗
npm run postinstall                                                    → allowed=True ✗
```

**위험도 평가:**
- `python -c "…"` : subprocess, os.system, importlib 등 모든 Python API 접근 가능
- `node -e "…"` : child_process.execSync, fs.writeFileSync 등 Node.js API 접근 가능
- `git config --global` : git 전역 설정 조작 (credential helper 등 탈취 가능)
- `npm run postinstall` : package.json 스크립트 임의 실행

이건 allowlist가 있어도 **사실상 우회 가능** 상태. Gate command 기능 자체가 임의 코드 실행 벡터.

**수정 코드:**
```python
# command_allowlist.py 수정

# 1. 인터프리터 전용 BLOCKED_FIRST_ARGS 추가 (2nd arg level)
INTERPRETER_COMMANDS: set[str] = {"python", "python3", "node", "perl", "ruby", "php"}

# 인터프리터 허용 args 화이트리스트 (-c 는 절대 불허)
INTERPRETER_ALLOWED_ARGS: dict[str, set[str]] = {
    "python": {"-m", "--version", "-V"},  # -c 제외
    "python3": {"-m", "--version", "-V"},
    "node": {"--version", "-v"},  # -e 제외
}

def validate_command(cmd_parts: list[str]) -> tuple[bool, str]:
    if not cmd_parts:
        return False, "빈 명령"

    binary = cmd_parts[0].rsplit("/", 1)[-1]

    if binary not in ALLOWED_COMMANDS:
        return False, f"허용되지 않은 명령: {binary}"

    # 인터프리터 명령 특수 처리 — 허용된 arg만 가능
    if binary in INTERPRETER_COMMANDS:
        if len(cmd_parts) > 1:
            first_arg = cmd_parts[1]
            allowed_args = INTERPRETER_ALLOWED_ARGS.get(binary, set())
            if first_arg.startswith("-") and first_arg not in allowed_args:
                return False, f"인터프리터 옵션 차단: {binary} {first_arg} (임의 코드 실행 가능)"

    # 인자 패턴 검사
    full_cmd = " ".join(cmd_parts)
    for pattern in BLOCKED_ARGS:
        if pattern in full_cmd:
            return False, f"차단된 인자 패턴: {pattern}"

    return True, ""
```

추가로 `ALLOWED_COMMANDS`에서 순수 인터프리터(`python`, `node`)는 제거하고, 필요한 경우 스크립트 파일 실행(`.py`, `.js` 파일 인자)만 허용하는 방식으로 강화 권장.

---

### P2-C03 ✅ PASS — Artifact path traversal

**확인 코드:** `concrete.py` `_run_artifact()`

```python
if '..' in path_str or os.path.isabs(path_str):
    return GateResult(passed=False, detail=f"경로 보안 위반: {path_str}", ...)
```

`../../../etc/passwd` → 즉시 차단. ✅

---

### P2-C04 ✅ PASS — Project YAML traversal

**확인 코드:** `executor.py` `_load_project_yaml()`

```python
safe_base = base.resolve()
candidate = (base / project_name / "project.yaml").resolve()
if not str(candidate).startswith(str(safe_base)):
    return None
```

`project_name = "../../secrets"` → `resolve()` 기반으로 safe_base 밖 → `None` 반환. ✅

---

### P2-C05 ✅ PASS — Role path traversal

**확인 코드:** `claude_local.py` `_build_args()`

```python
if self.role:
    if '..' in self.role:
        logging.getLogger(__name__).warning('role에 path traversal 감지: %s', self.role)
    elif self.project and ".." not in self.project:
        ...
```

`..` 포함 role → 경고 로그 + 무시. ✅

---

### P2-C06 ✅ PASS — 세션 토큰 해싱

**확인 코드:** `session.py`

```python
token = secrets.token_hex(32)
token_hash = hashlib.sha256(token.encode()).hexdigest()
# DB에 token_hash만 저장, raw token은 반환만 함
```

SHA-256 해시만 DB 저장. ✅

---

### P2-C07 ✅ PASS — API 인증

**확인 코드:** `engine_bridge.py` 엔드포인트 Depends

```python
@router.post("/start")
async def start_workflow(req: StartRequest, user: BrickUser = Depends(require_role_dep("operator"))):
...
@router.get("/health")
async def health_check():  # ← 인증 없음 (의도적)
```

/health 제외 모든 engine 엔드포인트에 `authenticate_request` 또는 `require_role_dep` 적용. ✅

---

### P2-C08 ✅ PASS — RBAC 적용

**확인 코드:** `engine_bridge.py`

| 엔드포인트 | 최소 역할 |
|-----------|---------|
| POST /start | operator |
| POST /complete-block | operator |
| GET /status/{id} | viewer |
| POST /suspend,/resume,/cancel | operator |
| POST /hook,/retry-adapter | operator |
| GET /human/tasks | viewer (authenticate_request) |

viewer = 조회만, operator = 실행, admin 없어도 동작. ✅

---

### P2-C09 ✅ PASS — Slack 토큰 마스킹

**확인 코드:** `slack_subscriber.py`

```python
_SENSITIVE_PATTERNS = [
    (re.compile(r'(SLACK_BOT_TOKEN|API_KEY|SECRET|PASSWORD|TOKEN)=[^\s]+', re.I), r'\1=***'),
    (re.compile(r'(Bearer\s+)[^\s]+', re.I), r'\1***'),
    (re.compile(r'xox[bp]-[0-9a-zA-Z\-]+'), '***'),
    (re.compile(r'sk-[0-9a-zA-Z]{20,}'), '***'),
]
```

`xox*`, `sk-*`, `Bearer ...`, `TOKEN=...` 모두 마스킹. adapter_failed stderr에도 `_mask_sensitive()` 적용. ✅

---

### P2-C10 ✅ PASS — Nesting guard

**확인 코드:** `claude_local.py`

```python
NESTING_GUARD_VARS = [
    "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_SESSION", "CLAUDE_CODE_PARENT_SESSION",
]
# _build_env()에서:
for var in NESTING_GUARD_VARS:
    env.pop(var, None)
```

4개 env 제거 → 자식 claude가 또 부모인척 할 수 없음. ✅

---

### P2-C11 ✅ PASS — stdout 32KB cap

**확인 코드:** `claude_local.py`

```python
_MAX_OUTPUT_BYTES = 32 * 1024
...
async def _read_stream(stream, chunks, max_bytes=_MAX_OUTPUT_BYTES):
    total = 0
    while True:
        data = await stream.read(8192)
        if not data: break
        chunks.append(data)
        total += len(data)
        if total >= max_bytes: break  # truncate
```

32KB 초과 시 읽기 중단. stdout/stderr 각각 적용. ✅

---

### P2-C12 ⚠️ WARN — Webhook auth_value 로그 노출

**확인 코드:** `webhook.py`

```python
self.auth_value = config.get("auth_value", "")
...
headers["Authorization"] = f"Bearer {self.auth_value}"
...
raise RuntimeError(f"Webhook 실패: HTTP {resp.status_code} — {resp.text[:200]}")
```

**현재 상태:** `webhook.py`에 logger 없음. RuntimeError 메시지에 `auth_value` 직접 포함 안 됨.
`executor.py`에서 `str(e)` → `event.data["error"]`로 저장 — auth_value 미노출.

**WARN 이유:** 현재는 안전하지만, 향후 디버그 로그(`logger.debug(f"headers: {headers}")`) 같은 코드 추가 시 auth_value가 노출될 위험이 있음. 명시적 방어 코드 없음.

**권장 조치:**
```python
def _get_safe_headers(self) -> dict:
    """로깅 안전 헤더 (auth 마스킹)."""
    safe = {**self.headers}
    if "Authorization" in safe:
        safe["Authorization"] = "Bearer ***"
    if "X-API-Key" in safe:
        safe["X-API-Key"] = "***"
    return safe
```

---

## P3: 자유도 상세

### F-01 ✅ PASS — 새 Gate 추가 수정 포인트 (≤2곳)

**실제 확인:**
1. `ConcreteGateExecutor._register_builtins()` — `self.register_gate("jira-check", handler)` 1줄 추가
2. `init_engine()`의 `PresetValidator(gate_types=ge.registered_gate_types())` — **자동 연동** (수정 불필요)

→ **1곳** 수정. 또는 `pyproject.toml` entry_points로 **0곳**도 가능.

---

### F-02 ✅ PASS — 새 Link 추가 수정 포인트 (1곳)

**실제 확인:**
1. `StateMachine._register_builtins()` — `self.register_link("approval-chain", handler)` 1줄 추가
2. `init_engine()`의 `PresetValidator(link_types=sm.registered_link_types())` — **자동 연동** (수정 불필요)

→ **1곳** 수정.

---

### F-03 ✅ PASS — 새 Adapter 추가 수정 포인트 (≤3곳)

**실제 확인:**
1. `TeamAdapter` 구현 (새 파일)
2. `init_engine()` 내 `adapter_pool.register("cursor", CursorAdapter({}))` — 1줄 추가
3. (선택) `pyproject.toml` entry_points 등록

→ **2곳** (코드 수정 기준). DEFAULT_ADAPTERS 상수는 fallback용이라 필수 수정 아님.

---

### F-04 ✅ PASS — 새 프리셋 추가 수정 포인트 (0곳)

**실제 확인:** `PresetLoader.load(name)` → `presets_dir/{name}.yaml` 자동 탐색. 코드 수정 없이 YAML 파일만 추가하면 됨.

→ **0곳** 수정.

---

### F-05 ✅ PASS — PluginManager entry_points

**실제 확인:** `plugin_manager.py` `_discover_via_entry_points()` + `pyproject.toml`

```toml
[project.entry-points."brick.adapters"]
claude_agent_teams = "brick.adapters.claude_agent_teams:ClaudeAgentTeamsAdapter"
...
```

`importlib.metadata.entry_points().select(group="brick.adapters")` 기반 자동 발견. fallback도 구현됨. ✅

---

### F-06 ✅ PASS — Gate 레지스트리 → Validator 자동 연동

**실제 확인:** `engine_bridge.py` `init_engine()`

```python
preset_validator = PresetValidator(
    gate_types=ge.registered_gate_types(),  # ← 레지스트리 기반 자동
    ...
)
```

새 gate 등록 → `ge.registered_gate_types()` 자동 반영. ✅

---

### F-07 ✅ PASS — Link 레지스트리 → Validator 자동 연동

**실제 확인:** `engine_bridge.py` `init_engine()`

```python
preset_validator = PresetValidator(
    ...
    link_types=sm.registered_link_types(),  # ← 레지스트리 기반 자동
    ...
)
```

새 link 등록 → `sm.registered_link_types()` 자동 반영. ✅

---

## 수정 우선순위

### 1순위 — 즉시 수정 (CRITICAL)
**P2-C02**: `command_allowlist.py` — `python -c`, `node -e` 등 인터프리터 인자 차단

```python
# command_allowlist.py에 추가
INTERPRETER_COMMANDS: set[str] = {"python", "python3", "node", "perl", "ruby", "php"}

INTERPRETER_BLOCKED_ARGS: set[str] = {
    "-c", "-e",   # 인라인 코드 실행
    "-r",         # node --require
    "--eval",
}

def validate_command(cmd_parts: list[str]) -> tuple[bool, str]:
    if not cmd_parts:
        return False, "빈 명령"

    binary = cmd_parts[0].rsplit("/", 1)[-1]

    if binary not in ALLOWED_COMMANDS:
        return False, f"허용되지 않은 명령: {binary}"

    # 인터프리터 인라인 코드 실행 차단
    if binary in INTERPRETER_COMMANDS and len(cmd_parts) > 1:
        second = cmd_parts[1]
        if second in INTERPRETER_BLOCKED_ARGS:
            return False, f"인터프리터 인라인 코드 실행 차단: {binary} {second}"

    # 기존 인자 패턴 검사
    full_cmd = " ".join(cmd_parts)
    for pattern in BLOCKED_ARGS:
        if pattern in full_cmd:
            return False, f"차단된 인자 패턴: {pattern}"

    return True, ""
```

### 2순위 — 운영 안정성 (HIGH)
**P2-A06**: `event_bus.py` publish() 핸들러 예외 격리

```python
def publish(self, event: Event) -> None:
    import logging
    _log = logging.getLogger(__name__)
    for handler in list(self._handlers.get(event.type, [])):
        try:
            handler(event)
        except Exception:
            _log.exception("EventBus handler error (event=%s)", event.type)
    if event.type != "*":
        for handler in list(self._handlers.get("*", [])):
            try:
                handler(event)
            except Exception:
                _log.exception("EventBus wildcard handler error (event=%s)", event.type)
```

### 3순위 — 운영 편의 (MEDIUM)
**P2-A01**: 서버 재시작 후 checkpoint 자동 복구 (RUNNING 상태 블록 모니터링 재개)

---

## 기타 관찰 사항

1. **P2-B (경합)**: `_checkpoint_lock`이 `_monitor_block`, `_monitor_compete`, `_cron_emit` 전부에 적용되어 있고, 모든 checkpoint 저장 전에 Lock 획득. 설계가 견고함.

2. **P2-A04 (Gate 예외)**: 각 Gate `_run_*` 메서드 내 try/except 존재. 단 `GateExecutor.execute()`에는 try/except 없어서 등록되지 않은 gate type은 `ValueError`를 그대로 throw함 — `run_gates()`를 호출하는 `executor.complete_block()`에서 잡힘.

3. **F-03 (새 Adapter)**: `DEFAULT_ADAPTERS` 상수(`preset_validator.py`)와 실제 `init_engine()`의 `adapter_pool` 등록이 별도임. 새 adapter 추가 시 두 곳이 sync되지 않을 수 있음 — `init_engine()` 내 registry 기반으로 완전 통일 권장.

4. **P2-C12 (Webhook auth_value)**: 현재는 직접 노출 안 되지만, `webhook.py`에 logging import조차 없음. 향후 디버그 추가 시 실수로 노출 가능성 존재 → `_get_safe_headers()` 방어 메서드 추가 권장.
