# Brick Engine 100% 완성 Design

> **피처**: brick-engine-100pct (엔진 프로덕션 레디)
> **레벨**: L2
> **작성**: PM | 2026-04-04
> **선행**: brick-bugfix-sprint1 (Phase 1~2), brick-sprint2-engine-sync (Step 1~2)
> **보완 대상**: brick-sprint2-engine-sync.design.md (빠진 5가지 보완)

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| **피처** | brick-engine-100pct (엔진 프로덕션 레디) |
| **시작일** | 2026-04-04 |
| **완료 목표** | Sprint 2 구현과 병합 배포 |
| **보완 항목** | 5건 (Adapter 재시도, 핸드오프 자동화, 프로세스 통합, Shell Injection 방어, API Auth) |

### 결과 요약

| 지표 | 값 |
|------|-----|
| **보완 항목** | 5건 |
| **TDD 케이스** | 30건 (E1-01 ~ E1-30) |
| **불변식** | 13건 (INV-E1-1 ~ INV-E1-13) |
| **변경 파일** | 14건 (신규 4, 수정 10) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 엔진이 돌아가지만 실패 복구, 자동 핸드오프, 보안, 프로세스 관리가 없어 프로덕션 불가 |
| **Solution** | 5가지 보완으로 "실행 버튼 한 번이면 끝까지 자동" 달성 |
| **Function UX Effect** | Smith님이 대시보드에서 실행 → 에이전트가 일하고 → 다음 에이전트로 자동 전달 → 실패해도 재시도 → 무인 운영 |
| **Core Value** | 변수 0%. 맑은 날이든 비 오는 날이든 돌아가는 엔진 |

---

## 0. 6단계 사고 프로세스

### Step 1: TASK 재해석

Smith님의 목표: **대시보드에서 "실행" 누르면 에이전트한테 실제로 일이 가고, 끝나면 다음 에이전트한테 자동으로 넘어가는 상태.** 변수 0%.

Sprint1(버그 수정)과 Sprint2(동기화+연결+실시간)가 "엔진을 돌아가게" 만들었다면, 이 Design은 "엔진이 깨지지 않게" 만드는 것. 5가지 보완:

| # | 항목 | 한 줄 정의 |
|---|------|-----------|
| 1 | Adapter 재시도 | 에이전트 연결 실패 → 재시도 → 초과 시 알림 |
| 2 | 핸드오프 자동화 | 블록 완료 → 다음 팀 자동 호출 (수동 개입 0) |
| 3 | 프로세스 통합 | `npm start` 하나로 Express + Python 동시 기동/종료 |
| 4 | Shell Injection 방어 | command gate에서 악의적 명령 실행 차단 |
| 5 | API Auth | 인증 없는 API 호출 거부 |

### Step 2: 영향범위

```
Python 엔진 (3파일)
├── executor.py          — adapter 재시도 + 핸드오프 루프
├── state_machine.py     — block.adapter_failed 이벤트 추가
└── concrete.py          — Shell Injection 방어

Express (6파일)
├── server/index.ts              — Python child_process 기동
├── server/brick/engine/bridge.ts — Auth 헤더 추가
├── server/middleware/brick-auth.ts — API Auth 미들웨어 (신규)
├── server/app.ts                — 미들웨어 마운트
├── server/routes/brick/*.ts     — Auth 적용
└── package.json                 — start 스크립트

Python API (1파일)
└── dashboard/routes/engine_bridge.py — Auth 데코레이터

설정 (1파일)
└── .env                         — BRICK_API_KEY
```

### Step 3: 선행조건

| 선행 | 내용 | 이유 |
|------|------|------|
| Sprint1 Phase 1 | BRK-QA-001/002 수정 (ConcreteGateExecutor + adapter_pool 주입) | adapter가 연결돼야 재시도할 대상이 존재 |
| Sprint1 Phase 2 | BRK-QA-003/004 수정 (WAITING_APPROVAL + 루프백) | 핸드오프가 gate 결과에 의존 |
| Sprint2 Step 1 | EnginePoller 구현 | 재시도/핸드오프 상태를 대시보드로 전달하는 채널 |
| Sprint2 Step 2 | _monitor_block 구현 | adapter 완료 감지 → complete_block → 핸드오프 체인의 시작점 |

### Step 4: 의존성 (5가지 항목 간)

```
[4. Shell Injection]  [5. API Auth]     ← 독립, 병렬 가능
         │                    │
         └──────┬─────────────┘
                │
[1. Adapter 재시도]                      ← Sprint1 Phase 1 이후
         │
[2. 핸드오프 자동화]                      ← Adapter 재시도 포함해야 안정
         │
[3. 프로세스 통합]                        ← 모든 컴포넌트 완성 후 통합
```

**구현 순서**: Phase A (4+5 병렬) → Phase B (1) → Phase C (2) → Phase D (3)

### Step 5: 방법 도출

| # | 방법 | 대안 | 선택 이유 |
|---|------|------|----------|
| 1 | state_machine에 `block.adapter_failed` 이벤트 추가 + 지수 백오프 | executor에서만 retry 루프 | state_machine이 상태 전이의 single source. executor에 retry 넣으면 상태 불일치 |
| 2 | 기존 complete_block → _find_next_blocks → StartBlockCommand 체인 강화 | 별도 핸드오프 스케줄러 | 이미 체인 존재. 새 스케줄러는 과잉 |
| 3 | Express에서 `child_process.spawn('python')` | Docker Compose / PM2 | 단일 프로세스 트리가 가장 단순. Docker는 개발 환경 복잡성 증가 |
| 4 | `shlex.split` + `create_subprocess_exec` + allowlist | regex 필터링 / sandbox | shlex는 Python 표준. regex는 우회 가능. sandbox는 과잉 |
| 5 | API Key 미들웨어 (단일 키) | JWT / OAuth / Firebase Auth | 내부 대시보드 전용. JWT는 사용자 인증이 아님. 단일 키가 최소 복잡도 |

### Step 6: 팀원 배정

| 항목 | 담당 | 이유 |
|------|------|------|
| Adapter 재시도 (Python) | backend-dev | Python 엔진 핵심 로직 |
| 핸드오프 자동화 (Python) | backend-dev | executor + state_machine 수정 |
| 프로세스 통합 (Express) | backend-dev | child_process + 시그널 처리 |
| Shell Injection (Python) | backend-dev | Python 보안 수정 |
| API Auth (Express + Python) | backend-dev | 미들웨어 + 데코레이터 |
| TDD 전체 | backend-dev | 단일 담당자가 일관성 유지 |

---

## 1. 프로젝트 제약 조건

| 항목 | 값 |
|------|-----|
| **DB** | SQLite (better-sqlite3 + drizzle-orm) |
| **Express 포트** | 3200 |
| **Python 엔진 포트** | 3202 |
| **프론트 dev 포트** | 3201 |
| **어댑터** | claude_agent_teams: MCP + tmux 폴백 (Sprint1에서 adapter_pool 주입 완료 전제) |
| **기존 Design** | Sprint1 BRK-QA-011 (Shell Injection), BRK-QA-006 (Auth) — 이 Design은 보완판 |

---

## 2. Adapter 재시도 (block.failed 대응)

### 2.1 현재 문제

```python
# state_machine.py:152-156 — block.failed는 즉시 워크플로우 전체 FAILED
elif event.type == "block.failed":
    block_inst.status = BlockStatus.FAILED
    block_inst.error = event.data.get("error", "Block execution failed")
    wf.status = WorkflowStatus.FAILED  # ← 워크플로우 전체 죽음
```

```python
# executor.py:321-349 — _execute_command에 try/except 없음
# adapter.start_block() 예외 → 미처리 → 워크플로우 상태 불일치
```

에이전트(어댑터) 연결 1번 실패 → 워크플로우 전체 죽음. 재시도 경로 없음.

### 2.2 설계: `block.adapter_failed` 이벤트

gate 실패(`block.gate_failed`)에는 retry가 있지만, adapter 실패에는 없다. 동일 패턴 적용.

**state_machine.py** — 새 이벤트 핸들러 추가:

```python
elif event.type == "block.adapter_failed":
    # adapter 실패 재시도 — gate_failed의 retry 패턴 재사용
    block_config = block_inst.block
    max_retries = block_config.adapter_max_retries if hasattr(block_config, 'adapter_max_retries') else 3

    if block_inst.retry_count < max_retries:
        block_inst.retry_count += 1
        block_inst.status = BlockStatus.QUEUED  # QUEUED로 복귀 (RUNNING이 아님)
        block_inst.error = None
        commands.append(RetryAdapterCommand(
            block_id=block_id,
            adapter=block_inst.adapter,
            retry_count=block_inst.retry_count,
            delay=5 * (3 ** (block_inst.retry_count - 1)),  # 5s, 15s, 45s
        ))
    else:
        # 재시도 소진 → 워크플로우 FAILED + 알림 이벤트
        block_inst.status = BlockStatus.FAILED
        block_inst.error = f"Adapter 재시도 {max_retries}회 소진: {event.data.get('error', '')}"
        wf.status = WorkflowStatus.FAILED
        commands.append(NotifyCommand(
            type="adapter_exhausted",
            data={
                "workflow_id": wf.id,
                "block_id": block_id,
                "adapter": block_inst.adapter,
                "retries": max_retries,
                "error": block_inst.error,
            }
        ))

    commands.append(SaveCheckpointCommand())
```

### 2.3 설계: RetryAdapterCommand + 지수 백오프

**executor.py** — `_execute_command`에 새 Command 타입 추가:

```python
elif isinstance(cmd, RetryAdapterCommand):
    # 지수 백오프 대기
    await asyncio.sleep(cmd.delay)

    adapter = self.adapter_pool.get(cmd.adapter)
    if not adapter:
        # adapter 자체가 없으면 재시도 무의미
        event = Event(type="block.failed", data={
            "block_id": cmd.block_id,
            "error": f"Adapter '{cmd.adapter}' not found in pool",
        })
        instance, cmds = self.state_machine.transition(instance, event)
        await self._execute_commands(instance, cmds)
        return

    block_inst = instance.blocks.get(cmd.block_id)
    if not block_inst:
        return

    try:
        execution_id = await adapter.start_block(block_inst.block, {
            "workflow_id": instance.id,
            "block_id": cmd.block_id,
            "block_what": block_inst.block.what,
            "block_type": block_inst.block.type,
            "project_context": instance.context,
            "retry_count": cmd.retry_count,
        })
        block_inst.execution_id = execution_id

        event = Event(type="block.started", data={"block_id": cmd.block_id})
        instance, cmds = self.state_machine.transition(instance, event)
        self.checkpoint.save(instance.id, instance)
        await self._execute_commands(instance, cmds)

        # 모니터링 재시작
        asyncio.create_task(self._monitor_block(instance, cmd.block_id))

    except Exception as e:
        event = Event(type="block.adapter_failed", data={
            "block_id": cmd.block_id,
            "error": str(e),
        })
        instance, cmds = self.state_machine.transition(instance, event)
        self.checkpoint.save(instance.id, instance)
        await self._execute_commands(instance, cmds)
```

### 2.4 설계: StartBlockCommand에 try/except 추가

기존 `_execute_command`의 `StartBlockCommand` 핸들러도 감싸야 첫 시도부터 adapter_failed 이벤트를 탈 수 있다.

**executor.py** — `_execute_command` 수정:

```python
if isinstance(cmd, StartBlockCommand):
    adapter = self.adapter_pool.get(cmd.adapter)
    if not adapter:
        # adapter 없음 → 즉시 adapter_failed
        event = Event(type="block.adapter_failed", data={
            "block_id": cmd.block_id,
            "error": f"Adapter '{cmd.adapter}' not found in pool",
        })
        instance, cmds = self.state_machine.transition(instance, event)
        self.checkpoint.save(instance.id, instance)
        await self._execute_commands(instance, cmds)
        return

    block_inst = instance.blocks.get(cmd.block_id)
    if not block_inst:
        return

    try:
        execution_id = await adapter.start_block(block_inst.block, {
            "workflow_id": instance.id,
            "block_id": cmd.block_id,
            "block_what": block_inst.block.what,
            "block_type": block_inst.block.type,
            "project_context": instance.context,
        })
        block_inst.execution_id = execution_id

        event = Event(type="block.started", data={"block_id": cmd.block_id})
        instance, cmds = self.state_machine.transition(instance, event)
        self.checkpoint.save(instance.id, instance)
        await self._execute_commands(instance, cmds)

        # 모니터링 시작 (Sprint2 설계)
        asyncio.create_task(self._monitor_block(instance, cmd.block_id))

    except Exception as e:
        event = Event(type="block.adapter_failed", data={
            "block_id": cmd.block_id,
            "error": str(e),
        })
        instance, cmds = self.state_machine.transition(instance, event)
        self.checkpoint.save(instance.id, instance)
        await self._execute_commands(instance, cmds)
```

### 2.5 설계: NotifyCommand (COO 알림)

재시도 소진 시 Express로 전달. EnginePoller가 Python 상태를 읽을 때 `failed` + `error` 메시지를 eventBus로 발행 → WebSocket → 대시보드 토스트 표시.

**추가 알림 경로**: `NotifyCommand`는 executor에서 `event_bus.emit("adapter.exhausted", data)`로 발행. EnginePoller가 이 이벤트를 포함한 상태를 읽어 Express eventBus에 재발행.

```python
elif isinstance(cmd, NotifyCommand):
    self.event_bus.emit(cmd.type, cmd.data)
    self.checkpoint.save(instance.id, instance)
```

### 2.6 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| E1-01 | `test_e1_01_adapter_failed_retries` | adapter 예외 시 block.adapter_failed | retry_count 증가, 상태 QUEUED |
| E1-02 | `test_e1_02_adapter_retry_backoff` | RetryAdapterCommand delay | 1차=5s, 2차=15s, 3차=45s |
| E1-03 | `test_e1_03_adapter_retry_exhausted` | 3회 초과 | block FAILED + workflow FAILED + NotifyCommand |
| E1-04 | `test_e1_04_adapter_retry_success` | 2차 재시도 성공 | block RUNNING + _monitor_block 시작 |
| E1-05 | `test_e1_05_adapter_not_found` | adapter_pool에 키 없음 | adapter_failed 이벤트 (silent skip 아님) |

---

## 3. 핸드오프 자동화

### 3.1 현재 상태

Sprint2의 `_monitor_block`이 adapter 완료를 감지하면 `complete_block`을 호출한다. `complete_block`은 gate를 실행하고, gate 통과 시 `block.gate_passed` → state_machine이 `_find_next_blocks` → `StartBlockCommand` 발행 → 다음 블록의 adapter 호출.

**이 체인은 이미 존재한다.** 문제는 체인의 약한 고리:

| 약점 | 영향 |
|------|------|
| `_monitor_block`에서 `complete_block` 호출 시 예외 처리 없음 | gate 실패 → 모니터링 루프 죽음 |
| 다음 블록의 adapter가 다른 팀인 경우 핸드오프 이벤트 없음 | 팀 전환 추적 불가 |
| parallel 링크에서 여러 다음 블록 동시 시작 시 경합 | checkpoint 동시 쓰기 충돌 |
| `check_status`가 파일 미존재를 "running"으로 반환 | 죽은 작업도 영원히 "running" — 무한 폴링 |
| stale 5분 경고만 하고 실패 처리 없음 | 죽은 어댑터가 영원히 running 상태 유지 |

### 3.2a 설계: checkpoint 경합 해결 (asyncio.Lock)

parallel 링크에서 2개 이상의 `_monitor_block`이 동시에 `checkpoint.save()`를 호출하면 파일 기반 CheckpointStore에서 동시 쓰기 충돌이 발생한다. `asyncio.Lock`으로 직렬화.

**executor.py** — `__init__`에 Lock 추가:

```python
class WorkflowExecutor:
    def __init__(self, state_machine, event_bus, checkpoint, ...):
        # 기존 필드들...
        self._checkpoint_lock = asyncio.Lock()  # parallel 블록 checkpoint 경합 방지
```

**checkpoint.save() 호출부 전부 Lock 감싸기:**

```python
# _monitor_block 내 complete_block 호출
async with self._checkpoint_lock:
    await self.complete_block(instance.id, block_id, ...)

# _monitor_block 내 block.adapter_failed 전이
async with self._checkpoint_lock:
    instance, cmds = self.state_machine.transition(instance, event)
    self.checkpoint.save(instance.id, instance)

# _execute_command 내 StartBlockCommand/RetryAdapterCommand
async with self._checkpoint_lock:
    instance, cmds = self.state_machine.transition(instance, event)
    self.checkpoint.save(instance.id, instance)
```

**complete_block도 Lock 감싸기:**

```python
async def complete_block(self, workflow_id, block_id, metrics, artifacts):
    async with self._checkpoint_lock:
        instance = self.checkpoint.load(workflow_id)
        # ... 기존 gate 실행 + 상태 전이 로직 ...
        self.checkpoint.save(instance.id, instance)
    # Lock 밖에서 후속 commands 실행
    await self._execute_commands(instance, commands)
```

**핵심**: Lock 범위는 `load → transition → save` 구간만. `_execute_commands`는 Lock 밖에서 실행하여 데드락 방지.

### 3.2 설계: _monitor_block 강화

**executor.py** — `_monitor_block` 수정 (Sprint2 설계 보완):

```python
async def _monitor_block(self, instance: WorkflowInstance, block_id: str):
    """어댑터 완료 폴링. 10초 간격. staleness 감지 + 실패 처리."""
    POLL_INTERVAL = 10
    STALE_THRESHOLD = 300       # 5분 — 경고 이벤트
    STALE_HARD_TIMEOUT = 600    # 10분 — adapter_failed 발행 → 재시도 진입
    last_change_time = time.time()
    last_status = None

    while True:
        await asyncio.sleep(POLL_INTERVAL)

        # 최신 인스턴스 로드
        instance = self.checkpoint.load(instance.id)
        if not instance:
            break
        block_inst = instance.blocks.get(block_id)
        if not block_inst or block_inst.status != BlockStatus.RUNNING:
            break
        if not block_inst.execution_id:
            break

        adapter = self.adapter_pool.get(block_inst.adapter)
        if not adapter:
            break

        try:
            status = await adapter.check_status(block_inst.execution_id)

            # staleness 감지
            if status.status != last_status:
                last_status = status.status
                last_change_time = time.time()
            elif time.time() - last_change_time > STALE_THRESHOLD:
                # 5분 경고
                self.event_bus.emit("block.stale", {
                    "workflow_id": instance.id,
                    "block_id": block_id,
                    "last_status": last_status,
                    "stale_seconds": int(time.time() - last_change_time),
                })

            # 10분 초과 → adapter_failed로 재시도 태움 (경고만 하고 끝내기 금지)
            if time.time() - last_change_time > STALE_HARD_TIMEOUT:
                event = Event(type="block.adapter_failed", data={
                    "block_id": block_id,
                    "error": f"Stale 타임아웃: {int(time.time() - last_change_time)}초 간 상태 변화 없음",
                })
                async with self._checkpoint_lock:
                    instance, cmds = self.state_machine.transition(instance, event)
                    self.checkpoint.save(instance.id, instance)
                await self._execute_commands(instance, cmds)
                break

            if status.status == "completed":
                try:
                    # checkpoint 경합 방지 — Lock 내에서 complete_block
                    async with self._checkpoint_lock:
                        await self.complete_block(
                            instance.id,
                            block_id,
                            metrics=status.metrics or {},
                            artifacts=status.artifacts or [],
                        )
                except Exception as e:
                    # complete_block 실패 (gate 실패 등) → 로그만
                    self.event_bus.emit("block.monitor_error", {
                        "workflow_id": instance.id,
                        "block_id": block_id,
                        "error": str(e),
                    })
                break

            elif status.status == "failed":
                event = Event(type="block.adapter_failed", data={
                    "block_id": block_id,
                    "error": status.error or "Adapter reported failure",
                })
                async with self._checkpoint_lock:
                    instance, cmds = self.state_machine.transition(instance, event)
                    self.checkpoint.save(instance.id, instance)
                await self._execute_commands(instance, cmds)
                break

        except Exception:
            pass  # 네트워크 에러 등 — 다음 폴링에서 재시도
```

### 3.3 설계: 핸드오프 이벤트 발행

팀이 바뀌는 순간을 추적하기 위해, `StartBlockCommand` 실행 시 이전 블록과 다음 블록의 adapter(팀)가 다르면 핸드오프 이벤트 발행.

**executor.py** — `_execute_command` StartBlockCommand 핸들러에 추가:

```python
# adapter.start_block 성공 후
if block_inst.block.team != self._get_previous_team(instance, cmd.block_id):
    self.event_bus.emit("block.handoff", {
        "workflow_id": instance.id,
        "from_block": self._get_previous_block_id(instance, cmd.block_id),
        "to_block": cmd.block_id,
        "from_team": self._get_previous_team(instance, cmd.block_id),
        "to_team": block_inst.block.team,
    })
```

**헬퍼 메서드**:

```python
def _get_previous_block_id(self, instance: WorkflowInstance, current_block_id: str) -> str | None:
    """링크를 역추적하여 이전 블록 ID 반환."""
    for link in instance.definition.links:
        if link.to_block == current_block_id:
            return link.from_block
    return None

def _get_previous_team(self, instance: WorkflowInstance, current_block_id: str) -> str | None:
    prev_id = self._get_previous_block_id(instance, current_block_id)
    if prev_id and prev_id in instance.blocks:
        return instance.blocks[prev_id].block.team
    return None
```

### 3.4 설계: check_status staleness 대응

**claude_agent_teams.py** — `check_status` 수정:

```python
async def check_status(self, execution_id: str) -> AdapterStatus:
    state_file = self.runtime_dir / f"task-state-{execution_id}.json"

    if not state_file.exists():
        # 파일 미존재 시 생성 시간 기반 staleness 판단
        # execution_id 형식: "{block_id}-{unix_timestamp}"
        try:
            start_ts = float(execution_id.rsplit("-", 1)[-1])
            elapsed = time.time() - start_ts
            if elapsed > 600:  # 10분 초과
                return AdapterStatus(
                    status="failed",
                    error=f"상태 파일 미생성 (경과: {int(elapsed)}초)"
                )
        except (ValueError, IndexError):
            pass
        return AdapterStatus(status="running")

    # 기존: 파일 읽어서 상태 반환
    data = json.loads(state_file.read_text())
    return AdapterStatus(
        status=data.get("status", "running"),
        metrics=data.get("metrics"),
        artifacts=data.get("artifacts"),
        error=data.get("error"),
    )
```

### 3.5 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| E1-06 | `test_e1_06_handoff_auto_next_block` | 블록 A 완료 → 블록 B 자동 시작 | B.status=RUNNING, adapter.start_block 호출됨 |
| E1-07 | `test_e1_07_handoff_different_team` | 팀 전환 시 이벤트 | block.handoff 이벤트 발행 (from_team, to_team) |
| E1-08 | `test_e1_08_handoff_parallel_blocks` | parallel 링크에서 2개 블록 동시 시작 | 둘 다 RUNNING, 각각 _monitor_block |
| E1-09 | `test_e1_09_monitor_stale_detection` | 5분 간 상태 변화 없음 | block.stale 이벤트 발행 |
| E1-10 | `test_e1_10_check_status_file_missing_timeout` | 10분 간 상태 파일 미생성 | status=failed 반환 |
| E1-11 | `test_e1_11_monitor_complete_block_error` | complete_block에서 gate 실패 | block.monitor_error 이벤트, 모니터 루프 종료 |
| E1-26 | `test_e1_26_stale_hard_timeout_triggers_retry` | 10분 간 상태 변화 없음 (_monitor_block) | block.adapter_failed 이벤트 발행 → 재시도 진입 |
| E1-27 | `test_e1_27_parallel_checkpoint_no_corruption` | parallel 링크에서 2개 _monitor_block 동시 complete_block | checkpoint 파일 무결성 유지 (Lock 직렬화) |

---

## 4. 프로세스 통합

### 4.1 현재 문제

Express(`npm run dev`)와 Python(`python -m uvicorn ...`)을 별도 터미널에서 수동 실행. Python 미기동 시 bridge.ts가 `engine_unavailable` 반환하지만 Express는 정상 응답 — 사용자는 엔진이 꺼진 걸 모름.

### 4.2 설계: ProcessManager

**dashboard/server/brick/engine/process-manager.ts** (신규):

```typescript
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { EngineBridge } from './bridge.js';

const PYTHON_PORT = 3202;
const HEALTH_CHECK_INTERVAL = 5000;
const HEALTH_CHECK_MAX_RETRIES = 10;  // 10 * 5초 = 최대 50초 대기
const SHUTDOWN_TIMEOUT = 10000;  // 10초

export class ProcessManager {
  private pythonProcess: ChildProcess | null = null;
  private bridge = new EngineBridge();
  private healthy = false;

  /**
   * Python 엔진 프로세스 시작.
   * brick/ 디렉토리에서 uvicorn 실행.
   */
  async startPython(): Promise<void> {
    if (this.pythonProcess) {
      console.log('[process-manager] Python 이미 실행 중');
      return;
    }

    const brickDir = path.resolve(process.cwd(), '..', 'brick');

    this.pythonProcess = spawn('python', [
      '-m', 'uvicorn',
      'brick.dashboard.main:app',
      '--host', '0.0.0.0',
      '--port', String(PYTHON_PORT),
      '--reload',
    ], {
      cwd: brickDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    // stdout/stderr 포워딩
    this.pythonProcess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim();
      if (lines) console.log(`[python] ${lines}`);
    });

    this.pythonProcess.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().trim();
      if (lines) console.error(`[python] ${lines}`);
    });

    this.pythonProcess.on('exit', (code) => {
      console.log(`[process-manager] Python 종료 (code=${code})`);
      this.pythonProcess = null;
      this.healthy = false;
    });

    // 헬스체크로 기동 대기
    await this.waitForHealth();
  }

  /**
   * Python /health 엔드포인트 응답 대기.
   */
  private async waitForHealth(): Promise<void> {
    for (let i = 0; i < HEALTH_CHECK_MAX_RETRIES; i++) {
      try {
        const result = await this.bridge.checkHealth();
        if (result.ok) {
          this.healthy = true;
          console.log('[process-manager] Python 엔진 정상 기동');
          return;
        }
      } catch {}
      await new Promise(r => setTimeout(r, HEALTH_CHECK_INTERVAL));
    }
    console.error('[process-manager] Python 엔진 기동 실패 — 타임아웃');
    // 실패해도 Express는 시작. bridge가 engine_unavailable 반환할 것
  }

  /**
   * 정상 종료. SIGTERM → 10초 대기 → SIGKILL.
   */
  async stop(): Promise<void> {
    if (!this.pythonProcess) return;

    return new Promise((resolve) => {
      const proc = this.pythonProcess!;

      const killTimer = setTimeout(() => {
        console.warn('[process-manager] SIGKILL 전송');
        proc.kill('SIGKILL');
        resolve();
      }, SHUTDOWN_TIMEOUT);

      proc.on('exit', () => {
        clearTimeout(killTimer);
        this.pythonProcess = null;
        this.healthy = false;
        resolve();
      });

      proc.kill('SIGTERM');
    });
  }

  isHealthy(): boolean {
    return this.healthy;
  }
}
```

### 4.3 설계: 서버 마운트

**dashboard/server/index.ts** — 수정:

```typescript
import { ProcessManager } from './brick/engine/process-manager.js';

const processManager = new ProcessManager();

// 서버 시작 시 Python도 함께
async function bootstrap() {
  // 1. Python 엔진 기동
  await processManager.startPython();

  // 2. Express 서버 시작
  const server = http.createServer(app);
  setupWebSocket(server);
  enginePoller.start();

  server.listen(PORT, () => {
    console.log(`[server] Express 기동: http://localhost:${PORT}`);
  });

  // 3. 종료 시그널 처리
  const shutdown = async () => {
    console.log('[server] 종료 시작...');
    enginePoller.stop();
    await processManager.stop();
    server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap();
```

### 4.4 설계: package.json start 스크립트

```json
{
  "scripts": {
    "start": "node dist/server/index.js",
    "dev": "tsx watch server/index.ts",
    "start:engine-only": "cd ../brick && python -m uvicorn brick.dashboard.main:app --port 3202"
  }
}
```

`npm start` 또는 `npm run dev` 하나로 Express + Python 동시 기동. Python 단독 실행이 필요한 경우 `start:engine-only` 사용.

### 4.5 설계: 엔진 상태 API

대시보드에서 엔진 상태를 확인할 수 있도록 상태 엔드포인트 추가.

**dashboard/server/routes/brick/engine-status.ts** (신규):

```typescript
import { Express } from 'express';

export function registerEngineStatusRoutes(
  app: Express,
  processManager: ProcessManager,
) {
  app.get('/api/brick/engine/health', async (req, res) => {
    const bridge = new EngineBridge();
    const result = await bridge.checkHealth();

    res.json({
      process: processManager.isHealthy(),
      engine: result.ok,
      timestamp: new Date().toISOString(),
    });
  });
}
```

### 4.6 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| E1-12 | `test_e1_12_process_manager_start` | startPython 호출 | child_process 생성 + /health 응답 대기 |
| E1-13 | `test_e1_13_process_manager_stop_graceful` | stop 호출 | SIGTERM → 프로세스 종료 |
| E1-14 | `test_e1_14_process_manager_stop_force` | SIGTERM 후 10초 무응답 | SIGKILL |
| E1-15 | `test_e1_15_python_exit_recovery` | Python 비정상 종료 | healthy=false, 재시작 가능 |
| E1-16 | `test_e1_16_health_api` | GET /api/brick/engine/health | process+engine 상태 반환 |

---

## 5. Shell Injection 방어

### 5.1 현재 문제

Sprint1 Design (BRK-QA-011)에서 `shlex.quote` + `create_subprocess_exec` 수정을 설계했다. 이 Design은 **추가 방어 계층**을 설계한다.

```python
# concrete.py:30-39 — 현재 코드
cmd = handler.command or ""
if context:
    try:
        cmd = cmd.format(**context)   # ← 악의적 context 값 주입
    except KeyError:
        pass
proc = await asyncio.create_subprocess_shell(cmd, ...)  # ← 셸 실행
```

Sprint1이 `shlex.quote`로 context 값을 이스케이프하고 `create_subprocess_exec`로 바꾸는 1차 방어를 설계했다. 이 Design은 2차 방어(command allowlist)를 추가한다.

### 5.2 설계: Command Allowlist

`create_subprocess_exec`만으로는 실행 가능한 바이너리에 제한이 없다. 예: `rm`, `curl`, `wget` 등 위험한 명령도 실행 가능.

**brick/brick/gates/command_allowlist.py** (신규):

```python
"""
Command Gate 실행 허용 명령 allowlist.
이 목록에 없는 명령은 거부.
"""

# 허용 명령 목록 — 절대 경로 또는 명령명
ALLOWED_COMMANDS: set[str] = {
    # 빌드/테스트
    "npm",
    "npx",
    "node",
    "python",
    "pytest",
    "vitest",

    # git
    "git",

    # 파일 조회 (읽기 전용)
    "cat",
    "ls",
    "find",
    "grep",
    "wc",
    "head",
    "tail",
    "diff",

    # 프로세스
    "echo",
    "true",
    "false",
    "test",
    "sleep",

    # brick 전용
    "brick-check",
    "brick-lint",
}

# 절대 차단 — allowlist에 있어도 이 인자 패턴이 있으면 거부
BLOCKED_ARGS: list[str] = [
    "--force",
    "-rf",
    "rm ",
    "sudo",
    "chmod",
    "chown",
    "mkfs",
    "dd ",
    "> /dev",
    "| sh",
    "| bash",
    "$((",
    "`",
]


def validate_command(cmd_parts: list[str]) -> tuple[bool, str]:
    """
    allowlist 기반 명령 검증.

    Args:
        cmd_parts: shlex.split()된 명령 리스트

    Returns:
        (허용 여부, 거부 사유)
    """
    if not cmd_parts:
        return False, "빈 명령"

    binary = cmd_parts[0].rsplit("/", 1)[-1]  # /usr/bin/npm → npm

    if binary not in ALLOWED_COMMANDS:
        return False, f"허용되지 않은 명령: {binary}"

    # 인자 패턴 검사
    full_cmd = " ".join(cmd_parts)
    for pattern in BLOCKED_ARGS:
        if pattern in full_cmd:
            return False, f"차단된 인자 패턴: {pattern}"

    return True, ""
```

### 5.3 설계: concrete.py 최종 형태

Sprint1 수정(shlex) + 이 Design(allowlist) 통합:

```python
import shlex
from brick.gates.command_allowlist import validate_command

async def _run_command(self, handler: GateHandler, context: dict) -> GateResult:
    cmd_template = handler.command or ""

    # 1. context 값 이스케이프 (Sprint1 BRK-QA-011)
    safe_context = {}
    if context:
        for key, value in context.items():
            safe_context[key] = shlex.quote(str(value))

    try:
        cmd_str = cmd_template.format(**safe_context)
    except KeyError:
        return GateResult(passed=False, output="명령 템플릿 키 누락")

    # 2. 명령 파싱 + allowlist 검증 (이 Design)
    try:
        cmd_parts = shlex.split(cmd_str)
    except ValueError as e:
        return GateResult(passed=False, output=f"명령 파싱 실패: {e}")

    allowed, reason = validate_command(cmd_parts)
    if not allowed:
        return GateResult(passed=False, output=f"명령 거부: {reason}")

    # 3. subprocess_exec로 실행 (Sprint1 BRK-QA-011)
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd_parts,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=handler.timeout or 60,
        )
    except asyncio.TimeoutError:
        proc.kill()
        return GateResult(passed=False, output="명령 실행 타임아웃")

    return GateResult(
        passed=(proc.returncode == 0),
        output=stdout.decode().strip(),
        metadata={"returncode": proc.returncode, "stderr": stderr.decode().strip()},
    )
```

### 5.4 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| E1-17 | `test_e1_17_command_allowlist_npm` | `npm test` | 허용 |
| E1-18 | `test_e1_18_command_block_rm` | `rm -rf /` | 거부: 허용되지 않은 명령 |
| E1-19 | `test_e1_19_command_block_injection` | context에 `; rm -rf /` | shlex.quote로 이스케이프 → 무해 |
| E1-20 | `test_e1_20_command_block_pipe_sh` | `echo hello | sh` | 거부: 차단된 인자 패턴 |
| E1-21 | `test_e1_21_command_subprocess_exec` | 실행 방식 | create_subprocess_exec (shell=False) |

---

## 6. API Auth

### 6.1 현재 문제

Sprint1 Design (BRK-QA-006)에서 `requireApprover` 미들웨어를 설계했다. 그러나 이는 승인/리뷰 API 한정이었다. **전체 Brick API에 인증이 없다.**

- Express: cors() + express.json()만. 인증 미들웨어 0개.
- Python FastAPI: `@router.post("/start")` 등 전부 오픈.
- bridge.ts: Python 호출 시 Authorization 헤더 없음.

### 6.2 설계: API Key 인증

2-레이어 인증: **프론트→Express는 세션 쿠키**, **Express→Python은 서버사이드 API Key**. 프론트엔드에 API Key를 노출하지 않는다.

```
프론트엔드(브라우저)                  Express 서버                    Python 엔진
    │                                    │                              │
    ├── POST /api/brick/auth/login ──→   │ (비밀번호 검증)              │
    │   ← Set-Cookie: brick_session      │                              │
    │                                    │                              │
    ├── GET /api/brick/* ──────────────→ │                              │
    │   Cookie: brick_session            │── X-Brick-API-Key ─────────→│
    │   ← 200 OK                         │   (서버사이드, .env)          │
```

#### 6.2.1 Express 세션 쿠키 인증

**dashboard/server/middleware/brick-auth.ts** (신규):

```typescript
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const BRICK_API_KEY = process.env.BRICK_API_KEY || '';
const BRICK_SESSION_SECRET = process.env.BRICK_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const BRICK_DASHBOARD_PASSWORD = process.env.BRICK_DASHBOARD_PASSWORD || '';

// 세션 토큰 저장소 (인메모리 — 서버 재시작 시 재로그인)
const activeSessions = new Map<string, { createdAt: number }>();
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24시간

/**
 * 세션 토큰 생성.
 */
function createSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 세션 유효성 검증.
 */
function isValidSession(token: string): boolean {
  const session = activeSessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

/**
 * 로그인 엔드포인트 등록.
 * POST /api/brick/auth/login { password: string }
 * → Set-Cookie: brick_session=<token>
 */
export function registerBrickAuthRoutes(app: import('express').Express): void {
  app.post('/api/brick/auth/login', (req, res) => {
    const { password } = req.body;

    if (!BRICK_DASHBOARD_PASSWORD) {
      // 비밀번호 미설정 → 개발 모드 자동 로그인
      const token = createSessionToken();
      activeSessions.set(token, { createdAt: Date.now() });
      res.cookie('brick_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: SESSION_TTL,
      });
      return res.json({ ok: true, mode: 'development' });
    }

    if (password !== BRICK_DASHBOARD_PASSWORD) {
      return res.status(401).json({ error: '비밀번호 불일치' });
    }

    const token = createSessionToken();
    activeSessions.set(token, { createdAt: Date.now() });
    res.cookie('brick_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: SESSION_TTL,
    });
    res.json({ ok: true });
  });

  app.post('/api/brick/auth/logout', (req, res) => {
    const token = req.cookies?.brick_session;
    if (token) activeSessions.delete(token);
    res.clearCookie('brick_session');
    res.json({ ok: true });
  });
}

/**
 * Brick API 인증 미들웨어.
 *
 * 인증 경로 2가지:
 * 1. 브라우저: Cookie brick_session (프론트엔드 → Express)
 * 2. 서버간: X-Brick-API-Key 헤더 (bridge.ts → Python, 외부 호출)
 *
 * 예외:
 * - GET /api/brick/engine/health (헬스체크)
 * - POST /api/brick/auth/* (로그인/로그아웃)
 */
export function requireBrickAuth(req: Request, res: Response, next: NextFunction): void {
  // 예외 경로
  if (req.path === '/api/brick/engine/health' && req.method === 'GET') {
    return next();
  }
  if (req.path.startsWith('/api/brick/auth/')) {
    return next();
  }

  // 경로 1: 세션 쿠키 (브라우저)
  const sessionToken = req.cookies?.brick_session;
  if (sessionToken && isValidSession(sessionToken)) {
    return next();
  }

  // 경로 2: API Key (서버간)
  if (BRICK_API_KEY) {
    const apiKey = req.headers['x-brick-api-key'] as string
      || (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : '');
    if (apiKey === BRICK_API_KEY) {
      return next();
    }
  }

  // 개발 모드 폴백: 키+비밀번호 둘 다 미설정
  if (!BRICK_API_KEY && !BRICK_DASHBOARD_PASSWORD && process.env.NODE_ENV === 'development') {
    console.warn('[brick-auth] 인증 미설정 — 개발 모드 통과');
    return next();
  }

  res.status(401).json({ error: '인증 실패: 로그인하거나 유효한 API Key를 제공하세요' });
}
```

#### 6.2.2 Express 마운트

**dashboard/server/app.ts** — 수정:

```typescript
import cookieParser from 'cookie-parser';
import { requireBrickAuth, registerBrickAuthRoutes } from './middleware/brick-auth.js';

// 기존
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(cookieParser());  // 세션 쿠키 파싱

// Auth 라우트 등록 (미들웨어 전에 — /auth/* 자체는 인증 불필요)
registerBrickAuthRoutes(app);

// Brick API 경로에 인증 적용
app.use('/api/brick', requireBrickAuth);
```

**package.json**: `cookie-parser` 의존성 추가 필요.

```bash
npm install cookie-parser
npm install -D @types/cookie-parser
```

#### 6.2.3 Python FastAPI 인증

**brick/brick/dashboard/middleware/auth.py** (신규):

```python
import os
from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

BRICK_API_KEY = os.getenv("BRICK_API_KEY", "")
api_key_header = APIKeyHeader(name="X-Brick-API-Key", auto_error=False)

async def verify_brick_api_key(api_key: str = Security(api_key_header)) -> str:
    """Brick API Key 검증. 미설정 시 개발 모드 통과."""
    if not BRICK_API_KEY:
        # 개발 모드
        return "dev"

    if api_key != BRICK_API_KEY:
        raise HTTPException(status_code=401, detail="인증 실패: 유효하지 않은 API Key")

    return api_key
```

**engine_bridge.py** — 라우터에 의존성 추가:

```python
from brick.dashboard.middleware.auth import verify_brick_api_key
from fastapi import Depends

# 모든 라우트에 인증 적용
router = APIRouter(
    prefix="/engine",
    dependencies=[Depends(verify_brick_api_key)],
)
```

#### 6.2.4 bridge.ts — Authorization 헤더

**dashboard/server/brick/engine/bridge.ts** — `request` 메서드 수정:

```typescript
private async request<T>(path: string, options: RequestInit = {}): Promise<EngineResponse<T>> {
  const url = `${this.config.baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // API Key가 있으면 Python 엔진에도 전달
  if (process.env.BRICK_API_KEY) {
    headers['X-Brick-API-Key'] = process.env.BRICK_API_KEY;
  }

  // ... 기존 fetch 로직
}
```

#### 6.2.5 프론트엔드 API 클라이언트

프론트→Express는 **세션 쿠키**로 인증. API Key를 프론트엔드에 노출하지 않는다. `credentials: 'include'`로 쿠키 자동 전송.

**dashboard/src/lib/brick-api.ts** — 수정:

```typescript
export async function brickFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  // API Key 헤더 불필요 — httpOnly 쿠키가 자동 전송됨

  return fetch(`/api/brick${path}`, {
    ...options,
    headers,
    credentials: 'include',  // 세션 쿠키 포함
  });
}

/**
 * 대시보드 로그인.
 * 성공 시 brick_session 쿠키가 Set-Cookie로 설정됨.
 */
export async function brickLogin(password: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/brick/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
    credentials: 'include',
  });
  return res.json();
}

export async function brickLogout(): Promise<void> {
  await fetch('/api/brick/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
}
```

#### 6.2.6 .env 설정

```env
# Express↔Python 서버간 API Key (프론트엔드에 노출 안 됨)
BRICK_API_KEY=bk_dev_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 대시보드 로그인 비밀번호 (미설정 시 개발 모드 자동 로그인)
BRICK_DASHBOARD_PASSWORD=

# 세션 시크릿 (미설정 시 자동 생성 — 서버 재시작 시 세션 무효화)
BRICK_SESSION_SECRET=
```

### 6.3 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| E1-22 | `test_e1_22_express_no_cookie_no_key_reject` | 쿠키도 API Key도 없이 요청 | 401 응답 |
| E1-23 | `test_e1_23_express_session_cookie_accept` | 로그인 후 세션 쿠키로 요청 | 200 응답 |
| E1-24 | `test_e1_24_python_auth_reject` | API Key 없이 Python 직접 호출 | 401 응답 |
| E1-25 | `test_e1_25_health_no_auth` | GET /api/brick/engine/health | 인증 없이 200 |
| E1-28 | `test_e1_28_login_sets_httponly_cookie` | POST /api/brick/auth/login 성공 | Set-Cookie: brick_session (httpOnly, sameSite=strict) |
| E1-29 | `test_e1_29_express_api_key_accept` | X-Brick-API-Key 헤더로 요청 (서버간) | 200 응답 |
| E1-30 | `test_e1_30_session_expired_reject` | 24시간 초과 세션 쿠키 | 401 응답 |

---

## 7. 파일 변경 목록

| 파일 | 변경 유형 | 섹션 | 내용 |
|------|----------|------|------|
| `brick/brick/engine/state_machine.py` | 수정 | 2 | block.adapter_failed 이벤트 핸들러 |
| `brick/brick/engine/executor.py` | 수정 | 2,3 | adapter retry + StartBlockCommand try/except + 핸드오프 이벤트 + _monitor_block 강화 |
| `brick/brick/adapters/claude_agent_teams.py` | 수정 | 3 | check_status staleness 감지 |
| `brick/brick/gates/concrete.py` | 수정 | 5 | shlex + allowlist 통합 방어 |
| `brick/brick/gates/command_allowlist.py` | **신규** | 5 | Command allowlist 정의 |
| `brick/brick/dashboard/routes/engine_bridge.py` | 수정 | 6 | Auth 의존성 추가 |
| `brick/brick/dashboard/middleware/auth.py` | **신규** | 6 | Python API Key 검증 |
| `dashboard/server/brick/engine/process-manager.ts` | **신규** | 4 | Python child_process 관리 |
| `dashboard/server/brick/engine/bridge.ts` | 수정 | 6 | Authorization 헤더 추가 |
| `dashboard/server/middleware/brick-auth.ts` | **신규** | 6 | Express API Key 미들웨어 |
| `dashboard/server/app.ts` | 수정 | 6 | requireBrickAuth 마운트 |
| `dashboard/server/index.ts` | 수정 | 4 | ProcessManager 통합 + shutdown 시그널 |
| `dashboard/src/lib/brick-api.ts` | 수정 | 6 | credentials: include + brickLogin/brickLogout |
| `dashboard/package.json` | 수정 | 6 | cookie-parser 의존성 추가 |

---

## 8. TDD 총괄

| 섹션 | TDD ID | 건수 |
|------|--------|------|
| Adapter 재시도 | E1-01 ~ E1-05 | 5건 |
| 핸드오프 자동화 | E1-06 ~ E1-11, E1-26 ~ E1-27 | 8건 |
| 프로세스 통합 | E1-12 ~ E1-16 | 5건 |
| Shell Injection 방어 | E1-17 ~ E1-21 | 5건 |
| API Auth | E1-22 ~ E1-25, E1-28 ~ E1-30 | 7건 |
| **합계** | | **30건** |

---

## 9. 불변식

| ID | 규칙 | 검증 TDD |
|----|------|----------|
| INV-E1-1 | adapter 예외 시 block.adapter_failed 이벤트가 발생해야 함 (silent skip 금지) | E1-01, E1-05 |
| INV-E1-2 | adapter 재시도는 지수 백오프(5s, 15s, 45s)를 따라야 함 | E1-02 |
| INV-E1-3 | 재시도 소진 후 워크플로우가 FAILED 되고 알림이 발행돼야 함 | E1-03 |
| INV-E1-4 | 블록 완료 → 다음 블록의 adapter가 자동 호출돼야 함 (수동 개입 0) | E1-06 |
| INV-E1-5 | check_status 파일 미존재 10분 초과 시 failed 반환해야 함 | E1-10 |
| INV-E1-6 | `npm start` 하나로 Express + Python이 동시 기동/종료돼야 함 | E1-12, E1-13 |
| INV-E1-7 | command gate는 allowlist에 없는 명령을 실행하면 안 됨 | E1-18 |
| INV-E1-8 | context 값의 셸 메타문자는 이스케이프돼야 함 | E1-19 |
| INV-E1-9 | BRICK_API_KEY 없는 요청은 401로 거부돼야 함 (개발 모드 예외) | E1-22, E1-24 |
| INV-E1-10 | /api/brick/engine/health는 인증 없이 접근 가능해야 함 | E1-25 |
| INV-E1-11 | stale 10분 초과 시 block.adapter_failed 이벤트가 발행돼야 함 (경고만 금지) | E1-26 |
| INV-E1-12 | parallel 블록의 checkpoint.save()는 asyncio.Lock으로 직렬화돼야 함 | E1-27 |
| INV-E1-13 | 프론트엔드에 API Key가 노출되면 안 됨 (세션 쿠키 + httpOnly) | E1-28 |

---

## 10. 구현 순서 (Phase)

```
Phase A: 보안 (병렬 — Sprint1과 독립)
├── Shell Injection 방어 (concrete.py + command_allowlist.py)
└── API Auth (brick-auth.ts + auth.py + bridge.ts + app.ts)

Phase B: Adapter 재시도 (Sprint1 Phase 1 완료 후)
├── block.adapter_failed 이벤트 (state_machine.py)
├── RetryAdapterCommand + try/except (executor.py)
└── NotifyCommand (executor.py)

Phase C: 핸드오프 자동화 (Sprint2 Step 2 + Phase B 완료 후)
├── _monitor_block 강화 (executor.py)
├── 핸드오프 이벤트 (executor.py)
└── check_status staleness (claude_agent_teams.py)

Phase D: 프로세스 통합 (모든 컴포넌트 완성 후)
├── ProcessManager (process-manager.ts)
├── 서버 bootstrap (index.ts)
└── 엔진 상태 API (engine-status.ts)
```

---

*Design 끝 — Sprint2 보완: Adapter 재시도 + 핸드오프 자동화 + 프로세스 통합 + Shell Injection 방어 + API Auth*
