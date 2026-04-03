# Design: Brick CLI 상태 동기화 버그 수정

> 작성일: 2026-04-03
> 작성자: PM
> 레벨: L2-버그
> 근거: COO 분석 — complete_block() 상태 전이 건너뜀
> 선행 코드: executor.py, state_machine.py, checkpoint.py, events.py

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **버그** | complete_block()이 상태 전이 2단계를 건너뜀 → 블록이 영원히 queued/running |
| **근본 원인** | executor와 state_machine 간 이벤트 계약(contract) 불일치 |
| **영향** | 워크플로우가 완료되지 않음. state.json과 events.jsonl 불일치 |
| **수정 범위** | executor.py 2개 메서드 (complete_block, _execute_command) |
| **TDD** | BS-001 ~ BS-020 (20건) |

---

## 1. 버그 분석

### 1.1 정상 상태 전이 체인

```
BlockStatus:

  PENDING ──workflow.start──→ QUEUED ──block.started──→ RUNNING
     │                                                      │
     │                                              block.completed
     │                                                      │
     │                                                      ▼
     │                                               GATE_CHECKING
     │                                                      │
     │                                    ┌─── gate_passed ─┘─── gate_failed ──┐
     │                                    ▼                                     ▼
     │                               COMPLETED                              FAILED
     │                                                                   (or RETRY)
```

**필수 이벤트 순서**: `workflow.start` → `block.started` → `block.completed` → `block.gate_passed`

### 1.2 실제 동작 (버그)

```python
# executor.py:178 — complete_block()
async def complete_block(self, workflow_id, block_id):
    instance = self.checkpoint.load(workflow_id)
    block_inst = instance.blocks.get(block_id)

    # 문제 1: block.completed 이벤트 없이 바로 Gate 실행
    gate_result = await self.gate_executor.run_gates(block_inst, instance.context)

    # 문제 2: block.gate_passed 이벤트 발행 — 그러나 status가 GATE_CHECKING이 아님
    event_type = "block.gate_passed" if gate_result.passed else "block.gate_failed"
    event = Event(type=event_type, data={"block_id": block_id})

    instance, commands = self.state_machine.transition(instance, event)
    # state_machine.py:95 → if block_inst.status == GATE_CHECKING: → False
    # → 전이 무시 → status 그대로 QUEUED 또는 RUNNING
```

### 1.3 이벤트 누락 2건

| # | 누락 이벤트 | 위치 | 결과 |
|---|-----------|------|------|
| **1** | `block.started` → state_machine 미전달 | executor.py:228-229 | QUEUED→RUNNING 전이 안 됨 |
| **2** | `block.completed` 이벤트 자체 미발행 | executor.py:187 직전 | RUNNING→GATE_CHECKING 전이 안 됨 |

#### 누락 1: block.started가 state_machine에 전달되지 않음

```python
# executor.py:217-234 — _execute_command()
async def _execute_command(self, instance, cmd):
    if isinstance(cmd, StartBlockCommand):
        ...
        # event_bus에만 publish — 외부 구독자용
        self.event_bus.publish(Event("block.started", {"block_id": cmd.block_id}))
        # ❌ state_machine.transition() 호출 없음
        # → QUEUED → RUNNING 전이가 일어나지 않음
```

#### 누락 2: complete_block이 block.completed를 건너뜀

```python
# executor.py:178-199
async def complete_block(self, workflow_id, block_id):
    ...
    # ❌ block.completed 이벤트 발행 없음
    # → RUNNING → GATE_CHECKING 전이 없음
    gate_result = await self.gate_executor.run_gates(...)
    event_type = "block.gate_passed"  # GATE_CHECKING 아닌 상태에서 발행
```

### 1.4 state_machine은 정상

state_machine.py의 로직은 정확함:

```python
# state_machine.py:80-84 — block.started 핸들러
if block_inst.status in (BlockStatus.QUEUED, BlockStatus.PENDING):
    block_inst.status = BlockStatus.RUNNING  # ✅ 정상

# state_machine.py:86-92 — block.completed 핸들러
if block_inst.status == BlockStatus.RUNNING:
    block_inst.status = BlockStatus.GATE_CHECKING  # ✅ 정상
    commands.append(CheckGateCommand(block_id=block_id))

# state_machine.py:94-95 — block.gate_passed 핸들러
if block_inst.status == BlockStatus.GATE_CHECKING:
    block_inst.status = BlockStatus.COMPLETED  # ✅ 정상
```

**결론**: state_machine은 계약을 지키고 있음. executor가 계약을 위반.

---

## 2. 수정 옵션 비교

### 옵션 A: executor 수정 (Strict — 추천)

**원칙**: state_machine의 계약을 존중. executor가 올바른 이벤트 순서를 보장.

#### 변경 1: _execute_command에서 block.started를 state_machine에 전달

```python
# executor.py:217-234 수정
async def _execute_command(self, instance, cmd):
    if isinstance(cmd, StartBlockCommand):
        adapter = self.adapter_pool.get(cmd.adapter)
        if adapter:
            block_inst = instance.blocks.get(cmd.block_id)
            if block_inst:
                execution_id = await adapter.start_block(
                    block_inst.block, {"workflow_id": instance.id}
                )
                block_inst.execution_id = execution_id

                # ✅ 수정: state_machine에 block.started 전달
                started_event = Event(
                    type="block.started",
                    data={"block_id": cmd.block_id},
                )
                instance, extra_cmds = self.state_machine.transition(
                    instance, started_event
                )
                self.checkpoint.save(instance.id, instance)
                self.checkpoint.save_event(instance.id, started_event)

                # 외부 구독자에도 전파
                self.event_bus.publish(started_event)
```

#### 변경 2: complete_block에서 block.completed 먼저 발행

```python
# executor.py:178-199 수정
async def complete_block(self, workflow_id, block_id):
    instance = self.checkpoint.load(workflow_id)
    if not instance:
        raise ValueError(f"Workflow {workflow_id} not found")

    block_inst = instance.blocks.get(block_id)
    if not block_inst:
        raise ValueError(f"Block {block_id} not found")

    # ✅ 수정 1: block.completed 이벤트 먼저 발행 → RUNNING→GATE_CHECKING
    completed_event = Event(
        type="block.completed",
        data={"block_id": block_id},
    )
    instance, commands = self.state_machine.transition(instance, completed_event)
    self.checkpoint.save(workflow_id, instance)
    self.checkpoint.save_event(workflow_id, completed_event)
    self.event_bus.publish(completed_event)

    # ✅ 수정 2: GATE_CHECKING 상태에서 Gate 실행
    gate_result = await self.gate_executor.run_gates(block_inst, instance.context)

    event_type = "block.gate_passed" if gate_result.passed else "block.gate_failed"
    gate_event = Event(type=event_type, data={"block_id": block_id})

    instance, commands = self.state_machine.transition(instance, gate_event)
    self.checkpoint.save(workflow_id, instance)
    self.checkpoint.save_event(workflow_id, gate_event)

    for cmd in commands:
        await self._execute_command(instance, cmd)

    return gate_result
```

#### 장단점

| 항목 | 평가 |
|------|------|
| **장점** | state_machine 계약 100% 준수. events.jsonl에 전체 이력 기록. 디버깅 용이 |
| **장점** | GATE_CHECKING 상태가 실제로 존재 → Dashboard에서 "게이트 검증 중" 표시 가능 |
| **장점** | 기존 state_machine.py 수정 0줄 |
| **단점** | complete_block 호출 시 transition 2회 (block.completed + block.gate_passed) |
| **단점** | events.jsonl에 이벤트 2개 추가 (미미) |

---

### 옵션 B: state_machine 완화 (Relaxed)

**원칙**: state_machine이 현실에 맞춰 유연하게 처리.

```python
# state_machine.py:94-95 수정
elif event.type == "block.gate_passed":
    # 기존: if block_inst.status == BlockStatus.GATE_CHECKING:
    # 수정: QUEUED/RUNNING/GATE_CHECKING 모두 허용
    if block_inst.status in (
        BlockStatus.QUEUED,
        BlockStatus.RUNNING,
        BlockStatus.GATE_CHECKING,
    ):
        block_inst.status = BlockStatus.COMPLETED
        block_inst.completed_at = time.time()
        ...
```

#### 장단점

| 항목 | 평가 |
|------|------|
| **장점** | 1줄 변경으로 즉시 동작 |
| **단점** | 상태 전이 체인 파괴 — QUEUED에서 바로 COMPLETED 허용 |
| **단점** | events.jsonl에 block.started/block.completed 기록 없음 → 감사 추적 불가 |
| **단점** | GATE_CHECKING 상태가 사실상 사문화 → Dashboard "게이트 검증 중" 표시 불가 |
| **단점** | 다른 버그가 같은 패턴으로 발생해도 state_machine이 먹어버림 (마스킹) |

---

### 판단: 옵션 A 채택

```
         옵션 A (Strict)              옵션 B (Relaxed)
수정 위치  executor.py만              state_machine.py
수정 크기  ~25줄                      ~3줄
계약 준수  ✅ 완전                     ❌ 파괴
이벤트 로그 ✅ 완전                    ❌ 중간 상태 누락
디버깅     ✅ 전체 추적 가능            ❌ 상태 점프로 추적 어려움
Dashboard  ✅ GATE_CHECKING 표시      ❌ 표시 불가
미래 안전  ✅ 다른 버그 조기 발견       ❌ 마스킹
```

**결정: 옵션 A.** state_machine은 올바르다. executor를 고친다.

> "시스템이 불편하면 시스템을 느슨하게 만들지 말고, 호출자를 고쳐라."

---

## 3. 상세 수정 사양

### 3.1 executor.py 변경 사양

| 메서드 | 변경 내용 | 행 |
|--------|---------|-----|
| `_execute_command` | StartBlockCommand 처리 시 block.started를 state_machine.transition + checkpoint.save_event 추가 | :217-234 |
| `complete_block` | gate 실행 전 block.completed 이벤트 발행 + state_machine.transition 추가 | :178-199 |

### 3.2 이벤트 흐름 (수정 후)

```
executor.start()
  │
  ├─ state_machine.transition(workflow.start)
  │   → block[0].status = QUEUED
  │   → commands: [StartBlockCommand]
  │
  └─ _execute_command(StartBlockCommand)
      ├─ adapter.start_block() → execution_id
      ├─ state_machine.transition(block.started)     ← 신규
      │   → block.status = RUNNING
      ├─ checkpoint.save()                           ← 신규
      ├─ checkpoint.save_event(block.started)        ← 신규
      └─ event_bus.publish(block.started)

  ... (블록 실행 중 — 어댑터가 작업 수행) ...

executor.complete_block()
  │
  ├─ state_machine.transition(block.completed)       ← 신규
  │   → block.status = GATE_CHECKING
  │   → commands: [CheckGateCommand]
  ├─ checkpoint.save()                               ← 신규
  ├─ checkpoint.save_event(block.completed)           ← 신규
  │
  ├─ gate_executor.run_gates()
  │
  ├─ state_machine.transition(block.gate_passed)
  │   → block.status = COMPLETED
  │   → commands: [StartBlockCommand(next)] or [workflow.completed]
  ├─ checkpoint.save()
  └─ checkpoint.save_event(block.gate_passed)
```

### 3.3 events.jsonl 기록 보장

수정 후 모든 상태 전이에 대응하는 이벤트가 events.jsonl에 기록됨:

```jsonl
{"type": "workflow.started", "data": {"workflow_id": "feat-1234"}}
{"type": "block.started", "data": {"block_id": "plan"}}
{"type": "block.completed", "data": {"block_id": "plan"}}
{"type": "block.gate_passed", "data": {"block_id": "plan"}}
{"type": "block.started", "data": {"block_id": "design"}}
...
{"type": "workflow.completed", "data": {"workflow_id": "feat-1234"}}
```

### 3.4 state.json ↔ events.jsonl 일관성 보장

**불변식**: state.json의 각 block status는 events.jsonl의 마지막 관련 이벤트와 일치해야 함.

```python
# 검증 함수 (테스트용)
def verify_consistency(state: dict, events: list[dict]) -> bool:
    for block_id, block in state["blocks"].items():
        last_event = None
        for e in reversed(events):
            if e["data"].get("block_id") == block_id:
                last_event = e
                break
        if last_event:
            expected_status = EVENT_TO_STATUS[last_event["type"]]
            assert block["status"] == expected_status
    return True

EVENT_TO_STATUS = {
    "block.started": "running",
    "block.completed": "gate_checking",
    "block.gate_passed": "completed",
    "block.gate_failed": "failed",  # or "running" (retry)
    "block.failed": "failed",
}
```

---

## 4. 엣지 케이스

### 4.1 Gate 없는 블록

```python
# gate_executor.run_gates() → GateResult(passed=True) 즉시 반환
# 흐름: block.completed → GATE_CHECKING → (gate 즉시 pass) → block.gate_passed → COMPLETED
# GATE_CHECKING 체류 시간 = ~0ms — 정상
```

### 4.2 resume() 중 complete_block 호출

```python
# executor.py:201-215
async def resume(self, workflow_id):
    ...
    if current.status == BlockStatus.RUNNING:
        status = await adapter.check_status(...)
        if status.status == "completed":
            await self.complete_block(workflow_id, current.block.id)
```

resume()에서 호출하는 complete_block도 동일하게 수정됨. block.completed 이벤트 발행 후 gate 실행.

### 4.3 block.started 중복 방지

_execute_command에서 state_machine.transition(block.started)를 호출할 때, state_machine이 이미 `if status in (QUEUED, PENDING):` 가드를 가지고 있으므로 RUNNING 상태에서 중복 호출해도 안전 (무시됨).

### 4.4 gate_failed → retry 시 상태 흐름

```
RUNNING → block.completed → GATE_CHECKING
  → block.gate_failed → state_machine:
    if on_fail == "retry" and retry_count < max_retries:
      status = RUNNING (재실행)
      → StartBlockCommand
    else:
      status = FAILED
```

retry 시 GATE_CHECKING → RUNNING으로 돌아감. 이후 다시 complete_block → block.completed → GATE_CHECKING → gate 재실행. 정상.

---

## 5. 수정하지 않는 것

| 파일 | 이유 |
|------|------|
| `state_machine.py` | 정상. 수정 불필요 |
| `checkpoint.py` | 정상. save/save_event 메서드 활용만 |
| `event_bus.py` | 정상. publish 메서드 활용만 |
| `gates/base.py` | 정상. run_gates 메서드 활용만 |
| `models/*.py` | 정상. 모델 변경 없음 |

---

## 6. TDD 케이스

### 상태 전이 체인 (핵심)

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BS-001 | workflow.start → 첫 블록 status=QUEUED | §1.1 | block.status == QUEUED |
| BS-002 | _execute_command(StartBlockCommand) → status=RUNNING | §3.1 | block.status == RUNNING |
| BS-003 | complete_block → block.completed 이벤트 발행 → status=GATE_CHECKING | §3.2 | block.status == GATE_CHECKING |
| BS-004 | gate pass → block.gate_passed → status=COMPLETED | §3.2 | block.status == COMPLETED |
| BS-005 | 전체 체인: PENDING→QUEUED→RUNNING→GATE_CHECKING→COMPLETED | §1.1 | 4단계 순서 정확 |

### events.jsonl 기록

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BS-006 | _execute_command 후 events.jsonl에 block.started 기록 | §3.3 | event.type == "block.started" |
| BS-007 | complete_block 후 events.jsonl에 block.completed 기록 | §3.3 | event.type == "block.completed" |
| BS-008 | gate pass 후 events.jsonl에 block.gate_passed 기록 | §3.3 | event.type == "block.gate_passed" |
| BS-009 | 전체 실행 후 events.jsonl 순서: started→completed→gate_passed | §3.3 | 3개 이벤트 순서 정확 |

### state.json ↔ events.jsonl 일관성

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BS-010 | block status=RUNNING → 마지막 이벤트=block.started | §3.4 | 일치 |
| BS-011 | block status=GATE_CHECKING → 마지막 이벤트=block.completed | §3.4 | 일치 |
| BS-012 | block status=COMPLETED → 마지막 이벤트=block.gate_passed | §3.4 | 일치 |
| BS-013 | 전체 워크플로우 완료 후 verify_consistency() 통과 | §3.4 | True |

### 엣지 케이스

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BS-014 | Gate 없는 블록 → GATE_CHECKING 거쳐 COMPLETED | §4.1 | 즉시 pass |
| BS-015 | gate_failed + retry → GATE_CHECKING→RUNNING 재전이 | §4.4 | retry_count 증가 |
| BS-016 | gate_failed + retry 후 재완료 → 정상 COMPLETED | §4.4 | 2회차 pass |
| BS-017 | resume() → complete_block → 정상 전이 | §4.2 | status == COMPLETED |
| BS-018 | block.started 중복 호출 → 무시 (이미 RUNNING) | §4.3 | status 변화 없음 |

### 다중 블록 워크플로우

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BS-019 | 2블록 순차: block1 COMPLETED → block2 QUEUED→RUNNING | §3.2 | 다음 블록 시작 |
| BS-020 | 3블록 전체 완료 → workflow.status=COMPLETED | §3.2 | WorkflowStatus.COMPLETED |

### TDD 매핑 요약

| Design 섹션 | TDD 범위 | 케이스 수 |
|------------|---------|----------|
| §1 상태 전이 체인 | BS-001~05 | 5 |
| §3.3 이벤트 기록 | BS-006~09 | 4 |
| §3.4 일관성 | BS-010~13 | 4 |
| §4 엣지 케이스 | BS-014~18 | 5 |
| 다중 블록 | BS-019~20 | 2 |
| **합계** | | **20** |

**Gap 0%**: 모든 상태 전이, 이벤트 기록, 일관성 검증, 엣지 케이스에 대응 TDD 존재.

---

## 7. 파일 구조

```
brick/brick/engine/
├── executor.py              # (수정) complete_block + _execute_command
├── state_machine.py         # (수정 없음)
├── checkpoint.py            # (수정 없음)
└── event_bus.py             # (수정 없음)

brick/tests/engine/
└── test_state_sync.py       # (신규) BS-001~020 TDD
```

---

## 8. 관련 문서

| 문서 | 경로 |
|------|------|
| Brick 원본 설계 | docs/02-design/features/brick-dashboard.design.md |
| Brick 백엔드 API | docs/02-design/features/brick-backend-api.design.md |
| PDCA 프리셋 Design | docs/02-design/features/brick-pdca-preset.design.md |
| 이벤트/상태 모델 | brick/brick/models/events.py |
| 워크플로우 모델 | brick/brick/models/workflow.py |
