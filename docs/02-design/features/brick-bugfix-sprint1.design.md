# Brick Bugfix Sprint 1 Design

> **피처**: brick-bugfix-sprint1 (6팀 QA 결과 통합 버그 수정)
> **레벨**: L1~L2 (엔진 코어 버그 포함)
> **작성**: PM | 2026-04-03
> **참조**: PM QA, CTO-1 QA(111건), CTO-2 통합(11건), CTO-1 추가(158건), 코덱스 코드리뷰(14건)

---

## 0. 프로젝트 제약 조건

| 항목 | 값 |
|------|-----|
| **DB** | SQLite (better-sqlite3 + drizzle-orm) — `dashboard/server/db/create-schema.ts` |
| **Express 포트** | 3200 |
| **Python 엔진 포트** | 3202 |
| **프론트 dev 포트** | 3201 |
| **기존 불변식** | INV-EB-1~11 (engine-bridge). 이 Design은 기존 INV를 변경하지 않음 |
| **BlockStatus** | 9가지: pending, queued, running, gate_checking, waiting_approval, completed, failed, rejected, suspended |
| **유효 linkType** | 6종: sequential, parallel, compete, loop, cron, branch |

---

## 1. 버그 목록 총괄

### 1.1 엔진 코어 (Python) — 코덱스 발견

| # | 심각도 | 버그 | 파일 |
|---|--------|------|------|
| BRK-QA-001 | **CRITICAL** | GateExecutor(base) 사용 → 모든 gate NotImplementedError | `engine_bridge.py:15,64` |
| BRK-QA-002 | **CRITICAL** | adapter_pool 미주입 → 블록 시작 no-op | `engine_bridge.py:68-75` |
| BRK-QA-003 | HIGH | WAITING_APPROVAL 상태 전환 없음 | `executor.py:293`, `state_machine.py:119` |
| BRK-QA-004 | HIGH | check→do 루프백 미동작 (조건 형식 + 라우팅) | `state_machine.py:124`, `condition_evaluator.py:62` |
| BRK-QA-011 | HIGH | Command gate Shell Injection 취약점 | `concrete.py:27-35` |

### 1.2 Express API — CTO/코덱스 발견

| # | 심각도 | 버그 | 파일 |
|---|--------|------|------|
| BUG-1 | HIGH | `DELETE /projects/:id` 미구현 | `projects.ts` |
| BUG-2 | MEDIUM | `js-yaml` 미설치 → YAML 파싱 불가 | `presets.ts:8-18` |
| BUG-3 | MEDIUM | `review.ts` FK constraint → 500 | `review.ts:10,30` |
| BUG-4 | MEDIUM | `GET /projects/:id/invariants` 미구현 | `projects.ts` |
| BUG-5 | HIGH | CEO 승인 → engine 자동 전이 미연결 | `approvals.ts:50-98` |
| BUG-6 | HIGH | resume/cancel 상태 가드 + bridge 미호출 | `workflows.ts` |
| BUG-7 | MEDIUM | linkType 유효성 검증 없음 | `links.ts:63,99` |
| BRK-QA-006 | HIGH | 승인/리뷰/override 인증 없이 DB 수정 | `approvals.ts`, `review.ts`, `gates.ts` |
| BRK-QA-007 | MEDIUM | `POST /presets/:id/apply` 실행 생성 안 함 | `presets.ts:188` |
| BRK-QA-008 | MEDIUM | loop 링크도 DAG cycle로 거부 | `links.ts:17-41` |

### 1.3 참고 (이번 스프린트 대상 아님)

| # | 심각도 | 내용 | 비고 |
|---|--------|------|------|
| BUG-8 | LOW | Gate 실패 3회 경계값 테스트 없음 | 로직 있음, 테스트만 부재 |
| BUG-9 | LOW | cancel bridge 미호출 | BUG-6 수정으로 해결 |
| BUG-10 | LOW | custom Link 미구현 (7종 중 6종) | 별도 Design 필요 |
| BRK-QA-009 | LOW | execution status DB 제약 없음 | 라우트 가드로 보완 |
| BRK-QA-010 | LOW | system invariants placeholder | 기능 영향 없음 |
| BRK-QA-012 | LOW | 어댑터 대부분 스텁 | 별도 스프린트 |
| BRK-QA-013 | LOW | 프리셋 스키마 검증 없음 | 별도 스프린트 |
| BRK-QA-014 | NOTE | 이중 gate/link 구현 (BuildPassGate 등) | 데드코드 정리 |

---

## 2. 수정 순서 (의존성 기반)

```
Phase 1: 엔진 부트스트랩 (다른 모든 버그의 전제조건)
├── BRK-QA-001  GateExecutor → ConcreteGateExecutor 교체
├── BRK-QA-002  adapter_pool 구성 + 주입
└── BRK-QA-011  Command gate Shell Injection 수정

Phase 2: 엔진 상태 전환 (승인/루프 플로우 전제조건)
├── BRK-QA-003  WAITING_APPROVAL 상태 전환 추가
└── BRK-QA-004  루프백 라우팅 + 조건 형식 호환

Phase 3: Express API 엔진 연동
├── BUG-5       CEO 승인 → engine 연동
├── BUG-6       resume/cancel 가드 + bridge 호출
└── BRK-QA-006  승인/리뷰/override 인증 가드

Phase 4: Express API 독립 수정 (병렬 가능)
├── BUG-1       DELETE /projects/:id
├── BUG-2       js-yaml → yaml 패키지 교체
├── BUG-3       review FK → 404
├── BUG-4       GET /projects/:id/invariants
├── BUG-7       linkType 유효성 검증
├── BRK-QA-007  apply 동작 명확화
└── BRK-QA-008  loop 링크 cycle 면제
```

**이유**: Phase 1이 안 되면 gate/adapter가 전부 미동작이라 Phase 2/3 검증 불가. Phase 2가 안 되면 BUG-5의 승인 전이가 엔진에서 처리 불가. Phase 4는 독립적이라 병렬 가능.

---

## 3. BRK-QA-001: GateExecutor → ConcreteGateExecutor 미연결

### 3.1 원인 분석

**파일**: `brick/brick/dashboard/routes/engine_bridge.py`

```python
# line 15 — base class import
from brick.gates.base import GateExecutor

# line 64 — base class 인스턴스 생성
ge = GateExecutor()
```

`GateExecutor`(base)의 모든 `_run_*` 메서드가 `NotImplementedError` 발생:
- `_run_command` (base.py:75), `_run_http` (:78), `_run_prompt` (:81), `_run_agent` (:84), `_run_review` (:87), `_run_metric` (:90), `_run_approval` (:93)

`ConcreteGateExecutor`(concrete.py)가 7가지를 모두 구현했지만 연결되지 않음.

### 3.2 수정 코드

`brick/brick/dashboard/routes/engine_bridge.py`:

```python
# line 15 교체
# AS-IS
from brick.gates.base import GateExecutor
# TO-BE
from brick.gates.concrete import ConcreteGateExecutor

# line 64 교체
# AS-IS
ge = GateExecutor()
# TO-BE
ge = ConcreteGateExecutor()
```

### 3.3 영향 범위

| 영향 | 내용 |
|------|------|
| 모든 gate | NotImplementedError → 실제 실행 (command, http, metric, approval 등) |
| BUG-5 | 이 수정이 선행돼야 CEO 승인 gate가 동작 |
| BRK-QA-003 | 이 수정이 선행돼야 WAITING_APPROVAL 플로우 가능 |

### 3.4 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| BF-01 | `test_bf01_gate_executor_is_concrete` | init_engine 후 gate_executor 타입 | ConcreteGateExecutor |
| BF-02 | `test_bf02_command_gate_executes` | command gate handler 실행 | NotImplementedError 아닌 실제 결과 |
| BF-03 | `test_bf03_metric_gate_executes` | metric gate handler 실행 | GateResult 반환 |

---

## 4. BRK-QA-002: adapter_pool 미주입

### 4.1 원인 분석

**파일**: `brick/brick/dashboard/routes/engine_bridge.py` line 68~75

```python
we = WorkflowExecutor(
    state_machine=sm,
    event_bus=eb,
    checkpoint=cs,
    gate_executor=ge,
    preset_loader=pl,
    validator=val,
    # adapter_pool 누락
)
```

`executor.py` line 224: `self.adapter_pool = adapter_pool or {}` → 항상 빈 dict.
`executor.py` line 325: `adapter = self.adapter_pool.get(cmd.adapter)` → 항상 None → `start_block()` 스킵 → 블록 QUEUED에서 멈춤.

### 4.2 수정 코드

`brick/brick/dashboard/routes/engine_bridge.py` — `init_engine()` 수정:

```python
from brick.adapters.human import HumanAdapter
from brick.adapters.claude_code import SingleClaudeCodeAdapter
from brick.adapters.claude_agent_teams import ClaudeAgentTeamsAdapter
from brick.adapters.webhook import WebhookAdapter
from brick.adapters.codex import CodexAdapter
from brick.adapters.human_management import HumanManagementAdapter

def init_engine(root: str = ".bkit/") -> None:
    global executor, preset_loader, checkpoint_store, state_machine

    root_path = Path(root)
    sm = StateMachine()
    eb = EventBus()
    cs = CheckpointStore(base_dir=root_path / "runtime" / "workflows")
    ge = ConcreteGateExecutor()
    val = Validator()
    pl = PresetLoader(presets_dir=root_path / "presets")

    # 어댑터 풀 구성
    adapter_pool = {
        "human": HumanAdapter(),
        "human_management": HumanManagementAdapter(),
        "claude_code": SingleClaudeCodeAdapter(),
        "claude_agent_teams": ClaudeAgentTeamsAdapter(),
        "webhook": WebhookAdapter(),
        "codex": CodexAdapter(),
    }

    we = WorkflowExecutor(
        state_machine=sm,
        event_bus=eb,
        checkpoint=cs,
        gate_executor=ge,
        preset_loader=pl,
        validator=val,
        adapter_pool=adapter_pool,
    )

    executor = we
    preset_loader = pl
    checkpoint_store = cs
    state_machine = sm
```

### 4.3 영향 범위

| 영향 | 내용 |
|------|------|
| 블록 시작 | QUEUED → adapter.start_block() 호출 → RUNNING 전환 |
| resume | adapter.check_status() 호출 가능 |
| 어댑터 스텁 | BRK-QA-012 (어댑터 스텁)는 별도 스프린트. 연결만 수정 |

### 4.4 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| BF-04 | `test_bf04_adapter_pool_injected` | init_engine 후 adapter_pool 크기 | >= 6 |
| BF-05 | `test_bf05_start_block_calls_adapter` | StartBlockCommand 실행 | adapter.start_block 호출됨 |
| BF-06 | `test_bf06_human_adapter_in_pool` | adapter_pool["human"] | HumanAdapter 인스턴스 |

---

## 5. BRK-QA-011: Command Gate Shell Injection

### 5.1 원인 분석

**파일**: `brick/brick/gates/concrete.py` line 27~39

```python
async def _run_command(self, handler: GateHandler, context: dict) -> GateResult:
    cmd = handler.command or ""
    if context:
        try:
            cmd = cmd.format(**context)  # ← 미검증 context 주입
        except KeyError:
            pass
    proc = await asyncio.create_subprocess_shell(cmd, ...)  # ← shell=True
```

`context`에 `; rm -rf /` 같은 값이 들어오면 Shell Injection.

### 5.2 수정 코드

```python
import shlex

async def _run_command(self, handler: GateHandler, context: dict) -> GateResult:
    cmd = handler.command or ""
    if context:
        try:
            # context 값을 shell-safe하게 이스케이프
            safe_context = {k: shlex.quote(str(v)) for k, v in context.items()}
            cmd = cmd.format(**safe_context)
        except KeyError:
            pass

    # shell=True 대신 exec 사용
    args = shlex.split(cmd)
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
```

### 5.3 영향 범위

| 영향 | 내용 |
|------|------|
| command gate | 셸 메타문자(`; && | $()`) 이스케이프됨 |
| 기존 프리셋 | `tsc --noEmit`, `npm run build` 등 단순 명령은 정상 |
| 파이프/리다이렉션 | `create_subprocess_exec`에서 불가 → 필요 시 `sh -c "..."` 명시 사용 |

### 5.4 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| BF-07 | `test_bf07_command_gate_no_injection` | context에 `; echo hacked` 포함 | 이스케이프됨, 단일 명령 실행 |
| BF-08 | `test_bf08_command_gate_normal_cmd` | `tsc --noEmit` 실행 | 정상 실행 |
| BF-09 | `test_bf09_command_gate_context_format` | `{project_dir}/build.sh` 포맷 | 정상 치환 |

---

## 6. BRK-QA-003: WAITING_APPROVAL 상태 전환 없음

### 6.1 원인 분석

`BlockStatus.WAITING_APPROVAL`이 모델에 정의됨(`events.py:22`)이나 사용되지 않음.

**executor.py line 293**: gate 결과가 `passed=False`이면 무조건 `block.gate_failed` 이벤트 발행. 승인 대기(`metadata.status="waiting"`)와 실제 실패를 구분하지 않음.

**state_machine.py line 119~150**: `block.gate_failed` 핸들러가 `on_fail=retry/skip/fail` 3가지만 처리. `wait` 옵션 없음 → 승인 대기가 gate 실패로 처리 → 워크플로우 FAILED.

### 6.2 수정 코드

**6.2.1 executor.py** — `complete_block()` gate 결과 분기 추가 (line 293):

```python
# AS-IS
event_type = "block.gate_passed" if gate_result.passed else "block.gate_failed"

# TO-BE
if gate_result.passed:
    event_type = "block.gate_passed"
elif gate_result.metadata and gate_result.metadata.get("status") == "waiting":
    event_type = "block.gate_waiting"
else:
    event_type = "block.gate_failed"
```

**6.2.2 state_machine.py** — `block.gate_waiting` 핸들러 추가 (line 119 앞):

```python
elif event.type == "block.gate_waiting":
    if block_inst.status == BlockStatus.GATE_CHECKING:
        block_inst.status = BlockStatus.WAITING_APPROVAL
        # 워크플로우는 RUNNING 유지 (FAILED로 빠지지 않음)
        commands.append(SaveCheckpointCommand())
```

### 6.3 영향 범위

| 영향 | 내용 |
|------|------|
| approval gate | 대기 상태 정상 진입 (GATE_CHECKING → WAITING_APPROVAL) |
| 워크플로우 | 승인 대기 중 FAILED로 안 빠짐 |
| BUG-5 | 이 수정 후 approve→completeBlock이 WAITING_APPROVAL에서 재시작 가능 |

### 6.4 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| BF-10 | `test_bf10_approval_gate_waiting_state` | approval gate 실행 후 블록 상태 | WAITING_APPROVAL |
| BF-11 | `test_bf11_workflow_not_failed_on_waiting` | 승인 대기 중 워크플로우 상태 | RUNNING (FAILED 아님) |
| BF-12 | `test_bf12_approve_after_waiting` | WAITING_APPROVAL → approve → completeBlock | 다음 블록 전이 |

---

## 7. BRK-QA-004: 루프백 미동작

### 7.1 원인 분석

**문제 1**: 프리셋 condition `{match_rate_below: 90}` 형식을 evaluator가 미지원.
- `condition_evaluator.py:64`: `context.get("match_rate_below")` → None → False
- 지원 형식: `{"match_rate": {"lt": 90}}` 또는 `"match_rate < 90"`
- `LoopLink` 클래스(`links/loop.py:27`)가 이 형식 지원하지만 state_machine에서 미호출

**문제 2**: gate 실패 시 루프 라우팅 없음.
- `state_machine.py:119~150`: `block.gate_failed` → `on_fail=retry`는 같은 블록 재실행. 다른 블록으로 라우팅하는 경로 없음.
- `LinkDefinition.on_fail` 필드(`link.py:19`)가 파싱되지만 사용되지 않음.

### 7.2 수정 코드

**7.2.1 condition_evaluator.py** — `_below`/`_above` 접미사 호환 추가:

```python
def _evaluate_dict_condition(condition: dict, context: dict) -> bool:
    """dict condition 평가. 예: {"match_rate": {"gte": 90}}, {"match_rate_below": 90}"""
    for var_name, checks in condition.items():
        # _below / _above 접미사 호환 (프리셋 YAML 형식)
        if var_name.endswith("_below"):
            actual_var = var_name[:-6]  # "match_rate_below" → "match_rate"
            actual = context.get(actual_var)
            if actual is None:
                return False
            if not (actual < checks):
                return False
            continue
        if var_name.endswith("_above"):
            actual_var = var_name[:-6]  # "match_rate_above" → "match_rate"
            actual = context.get(actual_var)
            if actual is None:
                return False
            if not (actual > checks):
                return False
            continue

        actual = context.get(var_name)
        if actual is None:
            return False
        if isinstance(checks, dict):
            for op_key, expected in checks.items():
                op_map = {"gte": ">=", "lte": "<=", "gt": ">", "lt": "<", "eq": "==", "ne": "!="}
                op_str = op_map.get(op_key, "==")
                if not _OPERATORS[op_str](actual, expected):
                    return False
        else:
            if actual != checks:
                return False
    return True
```

**7.2.2 state_machine.py** — gate 실패 시 루프백 라우팅 추가:

```python
elif event.type == "block.gate_failed":
    gate_config = block_inst.block.gate
    on_fail = gate_config.on_fail if gate_config else "fail"
    max_retries = gate_config.max_retries if gate_config else 0

    if on_fail == "retry" and block_inst.retry_count < max_retries:
        block_inst.retry_count += 1
        block_inst.status = BlockStatus.RUNNING
        commands.append(StartBlockCommand(
            block_id=block_id,
            adapter=block_inst.adapter,
        ))
    elif on_fail == "skip":
        block_inst.status = BlockStatus.COMPLETED
        block_inst.completed_at = time.time()
        next_blocks = self._find_next_blocks(wf, block_id)
        if next_blocks:
            for next_id in next_blocks:
                wf.blocks[next_id].status = BlockStatus.QUEUED
                wf.current_block_id = next_id
                commands.append(StartBlockCommand(
                    block_id=next_id,
                    adapter=wf.blocks[next_id].adapter,
                ))
        elif self._all_blocks_completed(wf):
            wf.status = WorkflowStatus.COMPLETED
    elif on_fail == "route":
        # 링크의 on_fail 타겟으로 라우팅 (루프백)
        routed = False
        for link in wf.definition.links:
            if link.from_block == block_id and link.on_fail:
                target = link.on_fail
                if target in wf.blocks:
                    # 타겟 블록을 PENDING으로 리셋 후 QUEUED
                    target_block = wf.blocks[target]
                    target_block.status = BlockStatus.QUEUED
                    target_block.retry_count = 0
                    wf.current_block_id = target
                    commands.append(StartBlockCommand(
                        block_id=target,
                        adapter=target_block.adapter,
                    ))
                    routed = True
                    break
        if not routed:
            block_inst.status = BlockStatus.FAILED
            block_inst.error = event.data.get("error", "Gate check failed")
            wf.status = WorkflowStatus.FAILED
    else:
        block_inst.status = BlockStatus.FAILED
        block_inst.error = event.data.get("error", "Gate check failed")
        wf.status = WorkflowStatus.FAILED

    commands.append(SaveCheckpointCommand())
```

### 7.3 영향 범위

| 영향 | 내용 |
|------|------|
| `{match_rate_below: 90}` | 정상 평가 (context["match_rate"] < 90 → True) |
| gate 실패 → 루프백 | `on_fail: route` + link.on_fail 타겟으로 라우팅 |
| 기존 retry/skip/fail | 변경 없음 |
| 프리셋 | gate config에 `on_fail: route` 추가 필요 |

### 7.4 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| BF-13 | `test_bf13_match_rate_below_condition` | `{match_rate_below: 90}`, context `match_rate=80` | True |
| BF-14 | `test_bf14_match_rate_below_false` | `{match_rate_below: 90}`, context `match_rate=95` | False |
| BF-15 | `test_bf15_gate_fail_route_loopback` | on_fail=route, link.on_fail="do" | do 블록 QUEUED |
| BF-16 | `test_bf16_gate_fail_no_route_target` | on_fail=route, 타겟 없음 | FAILED |
| BF-17 | `test_bf17_loop_link_condition_eval` | loop check→do, match_rate=80 | do 블록으로 이동 |

---

## 8. BUG-5: CEO 승인 → engine 자동 전이 미연결

### 8.1 원인 분석

**파일**: `dashboard/server/routes/brick/approvals.ts` line 50~98

approve/reject 핸들러가 `brickApprovals` DB만 UPDATE하고 끝남. `EngineBridge` import/호출 없음.

```
POST /approve/:executionId → DB UPDATE → res.json → 끝 (엔진 통보 없음)
```

### 8.2 수정 코드

**import + bridge 인스턴스** 추가:
```typescript
import { brickApprovals, brickExecutions, brickGateResults } from '../../db/schema/brick.js';
import { EngineBridge } from '../../brick/engine/bridge.js';

export function registerApprovalRoutes(app: Application, db: BetterSQLite3Database) {
  const bridge = new EngineBridge();
```

**approve 핸들러** (line 50~71 → `async` 변환 + bridge 호출):
```typescript
app.post('/api/brick/approve/:executionId', async (req, res) => {
  try {
    const { executionId } = req.params;
    const { approver, comment } = req.body;
    const now = new Date().toISOString();

    const updated = db.update(brickApprovals)
      .set({ status: 'approved', comment: comment || null, resolvedAt: now, updatedAt: now })
      .where(eq(brickApprovals.executionId, Number(executionId)))
      .run();
    if (updated.changes === 0) {
      return res.status(404).json({ error: '승인 요청을 찾을 수 없습니다' });
    }

    // 엔진 연동
    const execution = db.select().from(brickExecutions)
      .where(eq(brickExecutions.id, Number(executionId))).get();
    if (execution?.engineWorkflowId && execution.currentBlock) {
      const result = await bridge.completeBlock(
        execution.engineWorkflowId,
        execution.currentBlock,
        { approval_action: 'approve', approver: approver || 'ceo' },
      );
      if (result.ok && result.data) {
        const allCompleted = Object.values(result.data.blocks_state).every(
          (b: { status: string }) => b.status === 'completed'
        );
        db.update(brickExecutions).set({
          blocksState: JSON.stringify(result.data.blocks_state),
          currentBlock: result.data.next_blocks[0] || execution.currentBlock,
          status: allCompleted ? 'completed' : 'running',
        }).where(eq(brickExecutions.id, Number(executionId))).run();
      }
    }
    res.json({ status: 'approved' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
```

**reject 핸들러** — 동일 패턴, `approval_action: 'reject'`:
```typescript
app.post('/api/brick/reject/:executionId', async (req, res) => {
  // ... DB UPDATE ...
  if (execution?.engineWorkflowId && execution.currentBlock) {
    const result = await bridge.completeBlock(
      execution.engineWorkflowId,
      execution.currentBlock,
      { approval_action: 'reject', reject_reason: reason, approver: approver || 'ceo' },
    );
    // ... DB 동기화 (executions.ts 패턴 동일) ...
  }
  res.json({ status: 'rejected', reason });
});
```

### 8.3 영향 범위

| 영향 | 내용 |
|------|------|
| approve | DB + 엔진 전이 (Do 블록 자동 시작) |
| reject | DB + 엔진 전이 (Design 회귀 또는 FAILED) |
| 엔진 미기동 | bridge 호출 스킵, DB만 업데이트 (안전) |
| 선행 조건 | BRK-QA-001/002/003 수정 필요 |

### 8.4 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| BF-18 | `test_bf18_approve_triggers_engine` | approve 후 blocksState | 다음 블록 running |
| BF-19 | `test_bf19_reject_triggers_engine` | reject 후 상태 | Design 회귀 또는 failed |
| BF-20 | `test_bf20_approve_no_engine_id` | engineWorkflowId 없는 실행 | DB만 업데이트 |
| BF-21 | `test_bf21_approve_not_found` | 없는 executionId | 404 |

---

## 9. BUG-6: resume/cancel 상태 가드 + bridge 미호출

### 9.1 원인 분석

**파일**: `dashboard/server/routes/brick/workflows.ts`

1. **조회 기준 오류** (line 14): `eq(brickExecutions.presetId, ...)` → 다중 실행 시 잘못된 행 반환
2. **상태 가드 없음** (line 21): completed도 resume 가능
3. **bridge 미호출**: DB만 변경, Python 엔진 미통보 (INV-EB-1 위반)

### 9.2 수정 코드

전체 교체 (`workflows.ts`):

```typescript
import { EngineBridge } from '../../brick/engine/bridge.js';

const RESUMABLE = ['paused', 'cancelled', 'suspended'];
const CANCELLABLE = ['pending', 'running', 'paused', 'suspended'];

export function registerWorkflowRoutes(app: Application, db: BetterSQLite3Database) {
  const bridge = new EngineBridge();

  app.post('/api/brick/workflows/:workflowId/resume', async (req, res) => {
    try {
      const execution = db.select().from(brickExecutions)
        .where(eq(brickExecutions.id, Number(req.params.workflowId))).get();
      if (!execution) return res.status(404).json({ error: '실행 없음' });

      if (!RESUMABLE.includes(execution.status)) {
        return res.status(409).json({ error: `재개 불가: 현재 '${execution.status}'` });
      }

      if (execution.engineWorkflowId) {
        await bridge.resumeWorkflow(execution.engineWorkflowId);
      }

      const updated = db.update(brickExecutions)
        .set({ status: 'running' })
        .where(eq(brickExecutions.id, execution.id)).returning().get();

      db.insert(brickExecutionLogs).values({
        executionId: execution.id,
        eventType: 'execution.resumed',
        data: JSON.stringify({ resumedAt: new Date().toISOString() }),
      }).run();

      res.json(updated);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post('/api/brick/workflows/:workflowId/cancel', async (req, res) => {
    try {
      const execution = db.select().from(brickExecutions)
        .where(eq(brickExecutions.id, Number(req.params.workflowId))).get();
      if (!execution) return res.status(404).json({ error: '실행 없음' });

      if (!CANCELLABLE.includes(execution.status)) {
        return res.status(409).json({ error: `취소 불가: 현재 '${execution.status}'` });
      }

      if (execution.engineWorkflowId) {
        await bridge.cancelWorkflow(execution.engineWorkflowId);
      }

      const updated = db.update(brickExecutions)
        .set({ status: 'cancelled', completedAt: new Date().toISOString() })
        .where(eq(brickExecutions.id, execution.id)).returning().get();

      db.insert(brickExecutionLogs).values({
        executionId: execution.id,
        eventType: 'execution.cancelled',
        data: JSON.stringify({ cancelledAt: new Date().toISOString() }),
      }).run();

      res.json(updated);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });
}
```

### 9.3 변경 요약

| 위치 | 변경 | 이유 |
|------|------|------|
| 조회 기준 | presetId → execution id | 다중 실행 안전 |
| 상태 가드 | resume: paused/cancelled/suspended만 | completed→running 방지 |
| 상태 가드 | cancel: pending/running/paused/suspended만 | completed→cancelled 방지 |
| bridge 호출 | resumeWorkflow / cancelWorkflow | INV-EB-1 준수 |
| BUG-9 | **이 수정으로 동시 해결** | cancel bridge 호출 포함 |

### 9.4 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| BF-22 | `test_bf22_resume_paused` | paused → resume | 200, running |
| BF-23 | `test_bf23_resume_completed_blocked` | completed → resume | 409 |
| BF-24 | `test_bf24_cancel_running` | running → cancel | 200, cancelled |
| BF-25 | `test_bf25_cancel_completed_blocked` | completed → cancel | 409 |
| BF-26 | `test_bf26_resume_bridge_called` | resume 시 bridge 호출 | 엔진 로그 확인 |

---

## 10. BRK-QA-006: 승인/리뷰/override 인증 없이 DB 수정

### 10.1 원인 분석

`approvals.ts`, `review.ts`, `gates.ts` — 인증/인가 미들웨어 없음. 누구나 approve/reject/override 가능.

- `POST /approve/:executionId` (approvals.ts:50): `approver` 파라미터가 req.body에서 받지만 검증 없음
- `POST /review/:exec/:block/approve` (review.ts:9): `reviewer` 파라미터 검증 없음 — `|| 'unknown'`
- `POST /gates/:id/override` (gates.ts:27): 아무런 인증 없이 gate 강제 pass

### 10.2 수정 코드

Express 미들웨어로 인증 가드 추가. 기존 `registerBrickRoutes` 호출부에 미들웨어 적용:

```typescript
// dashboard/server/middleware/brick-auth.ts (신규)
import type { Request, Response, NextFunction } from 'express';

/**
 * Brick 거버넌스 API 인증 미들웨어.
 * 최소 보안: approver/reviewer 필드 필수 + 빈 문자열 차단.
 * 향후: session/token 기반 인증으로 교체.
 */
export function requireApprover(req: Request, res: Response, next: NextFunction) {
  const { approver, reviewer } = req.body;
  const identity = approver || reviewer;
  if (!identity || typeof identity !== 'string' || identity.trim() === '') {
    return res.status(401).json({ error: '승인자/리뷰어 식별 필수 (approver 또는 reviewer 파라미터)' });
  }
  next();
}
```

**적용**:
- `approvals.ts`: approve/reject 핸들러에 `requireApprover` 미들웨어 적용
- `review.ts`: approve/reject 핸들러에 동일 적용
- `gates.ts`: override 핸들러에 `requireApprover` 적용 + `overrider` 필수

### 10.3 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| BF-27 | `test_bf27_approve_no_approver` | approve body에 approver 없음 | 401 |
| BF-28 | `test_bf28_review_no_reviewer` | review approve body에 reviewer 없음 | 401 |
| BF-29 | `test_bf29_override_no_identity` | override body 빈 값 | 401 |
| BF-30 | `test_bf30_approve_with_approver` | 정상 approver 포함 | 200 |

---

## 11. BUG-1: DELETE /projects/:id 미구현

### 11.1 원인 분석

`dashboard/server/routes/brick/projects.ts` — 6개 핸들러 중 DELETE 없음.

FK 의존관계: `brick_invariant_history` → `brick_invariants` → `brick_projects` ← `brick_executions`. CASCADE 없음.

### 11.2 수정 코드

```typescript
app.delete('/api/brick/projects/:id', (req, res) => {
  try {
    const project = db.select({ id: brickProjects.id }).from(brickProjects)
      .where(eq(brickProjects.id, req.params.id)).get();
    if (!project) return res.status(404).json({ error: '프로젝트 없음' });

    db.transaction((tx) => {
      // 1. invariant_history 삭제
      const invIds = tx.select({ id: brickInvariants.id }).from(brickInvariants)
        .where(eq(brickInvariants.projectId, req.params.id)).all();
      for (const inv of invIds) {
        tx.delete(brickInvariantHistory)
          .where(and(
            eq(brickInvariantHistory.invariantId, inv.id),
            eq(brickInvariantHistory.projectId, req.params.id),
          )).run();
      }
      // 2. invariants 삭제
      tx.delete(brickInvariants).where(eq(brickInvariants.projectId, req.params.id)).run();
      // 3. executions.project_id → NULL (이력 보존)
      tx.update(brickExecutions).set({ projectId: null })
        .where(eq(brickExecutions.projectId, req.params.id)).run();
      // 4. 프로젝트 삭제
      tx.delete(brickProjects).where(eq(brickProjects.id, req.params.id)).run();
    });

    res.status(204).end();
  } catch (e) { res.status(500).json({ error: String(e) }); }
});
```

### 11.3 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| BF-31 | `test_bf31_delete_project_success` | 정상 삭제 | 204 |
| BF-32 | `test_bf32_delete_project_not_found` | 없는 id | 404 |
| BF-33 | `test_bf33_delete_cascades_invariants` | 삭제 후 invariants | 0건 |
| BF-34 | `test_bf34_delete_preserves_executions` | executions.project_id | NULL |

---

## 12. BUG-2: js-yaml → yaml 패키지 교체

### 12.1 수정 코드

`dashboard/server/routes/brick/presets.ts` line 7~18 교체:

```typescript
// AS-IS
function parseYaml(raw: string): unknown {
  try {
    const yaml = require('js-yaml');
    return yaml.load(raw);
  } catch {
    return JSON.parse(raw);
  }
}

// TO-BE
import { parse as yamlParse } from 'yaml';  // 이미 설치된 패키지

function parseYaml(raw: string): unknown {
  try {
    return yamlParse(raw);
  } catch {
    return JSON.parse(raw);
  }
}
```

### 12.2 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| BF-35 | `test_bf35_import_yaml_preset` | YAML 문자열 import | 201 |
| BF-36 | `test_bf36_import_json_still_works` | JSON import | 201 |

---

## 13. BUG-3: review.ts FK → 404

### 13.1 수정 코드

`review.ts` — 두 핸들러에 존재 확인 추가:

```typescript
import { brickExecutions } from '../../db/schema/brick.js';

// approve, reject 핸들러 INSERT 전:
const execution = db.select({ id: brickExecutions.id }).from(brickExecutions)
  .where(eq(brickExecutions.id, Number(executionId))).get();
if (!execution) return res.status(404).json({ error: '실행 없음' });
```

### 13.2 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| BF-37 | `test_bf37_review_approve_invalid_exec` | 없는 executionId | 404 (기존 500) |
| BF-38 | `test_bf38_review_reject_invalid_exec` | 없는 executionId | 404 |

---

## 14. BUG-4: GET /projects/:id/invariants

### 14.1 수정 코드

`projects.ts` — dashboard 핸들러 앞에 추가:

```typescript
app.get('/api/brick/projects/:id/invariants', (req, res) => {
  try {
    const project = db.select({ id: brickProjects.id }).from(brickProjects)
      .where(eq(brickProjects.id, req.params.id)).get();
    if (!project) return res.status(404).json({ error: '프로젝트 없음' });

    const status = req.query.status as string | undefined;
    let results;
    if (status) {
      results = db.select().from(brickInvariants)
        .where(and(eq(brickInvariants.projectId, req.params.id), eq(brickInvariants.status, status))).all();
    } else {
      results = db.select().from(brickInvariants)
        .where(eq(brickInvariants.projectId, req.params.id)).all();
    }
    res.json({ invariants: results });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});
```

### 14.2 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| BF-39 | `test_bf39_get_project_invariants` | bscamp 불변식 조회 | 200, 11건 |
| BF-40 | `test_bf40_project_invariants_not_found` | 없는 프로젝트 | 404 |

---

## 15. BUG-7: linkType 유효성 검증

### 15.1 수정 코드

`links.ts` — POST/PUT 핸들러에 검증 추가:

```typescript
const VALID_LINK_TYPE_NAMES = LINK_TYPES.map(t => t.name);

// POST — 필수 필드 검증 후:
if (linkType && !VALID_LINK_TYPE_NAMES.includes(linkType)) {
  return res.status(400).json({ error: `잘못된 linkType: '${linkType}'`, validTypes: VALID_LINK_TYPE_NAMES });
}

// PUT — set 구성 전:
if (linkType !== undefined && !VALID_LINK_TYPE_NAMES.includes(linkType)) {
  return res.status(400).json({ error: `잘못된 linkType: '${linkType}'`, validTypes: VALID_LINK_TYPE_NAMES });
}
```

### 15.2 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| BF-41 | `test_bf41_create_link_invalid_type` | linkType: 'foo' | 400 |
| BF-42 | `test_bf42_create_link_valid_type` | linkType: 'branch' | 201 |

---

## 16. BRK-QA-007: apply 동작 명확화

### 16.1 원인 분석

`POST /presets/:id/apply` (presets.ts:188~227) — YAML→nodes/edges 변환만 수행. 실행(execution) 생성 안 함.

기획서에서 "apply"가 "실행 시작"이면 현재 구현이 잘못됨. 하지만 프론트엔드 캔버스가 이 응답(nodes/edges)을 사용하므로 **기존 동작 유지 + 엔드포인트명 명확화**.

### 16.2 수정 코드

코드 변경 없음. API 문서에 동작 명시:

```typescript
// presets.ts line 188 — 주석 추가
/**
 * POST /api/brick/presets/:presetId/apply
 * 프리셋 YAML → React Flow nodes/edges 변환 (캔버스 렌더링용).
 * 워크플로우 실행 시작은 POST /api/brick/executions 사용.
 */
```

### 16.3 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| BF-43 | `test_bf43_apply_returns_nodes_edges` | apply 응답 | { presetId, nodes, edges } |

---

## 17. BRK-QA-008: loop 링크 cycle 면제

### 17.1 원인 분석

`links.ts` `hasCycle()` (line 17~41) — 모든 링크를 DAG 순환으로 검사. loop 타입 링크(check→do)도 cycle로 거부.

### 17.2 수정 코드

`hasCycle` 호출 전 loop 타입 면제:

```typescript
// links.ts POST 핸들러 — cycle 검사 전:
if (linkType !== 'loop' && hasCycle(db, Number(workflowId), fromBlock, toBlock)) {
  return res.status(400).json({ error: 'DAG 순환 감지' });
}
```

`hasCycle` 함수 내부에서 기존 loop 링크도 제외:

```typescript
function hasCycle(db, workflowId, fromBlock, toBlock): boolean {
  const links = db.select().from(brickLinks)
    .where(eq(brickLinks.workflowId, workflowId)).all();
  const adj = new Map<string, string[]>();
  for (const link of links) {
    if (link.linkType === 'loop') continue;  // loop 링크는 DAG 검사 제외
    if (!adj.has(link.fromBlock)) adj.set(link.fromBlock, []);
    adj.get(link.fromBlock)!.push(link.toBlock);
  }
  // ... 이하 동일
}
```

### 17.3 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| BF-44 | `test_bf44_loop_link_allowed` | loop 타입 check→do 생성 | 201 (기존 400) |
| BF-45 | `test_bf45_sequential_cycle_blocked` | sequential A→B→A | 400 (기존대로) |

---

## 18. 파일 변경 목록

| 파일 | 변경 유형 | BUG | 내용 |
|------|----------|-----|------|
| `brick/brick/dashboard/routes/engine_bridge.py` | 수정 | BRK-001,002 | ConcreteGateExecutor + adapter_pool 주입 |
| `brick/brick/gates/concrete.py` | 수정 | BRK-011 | Shell Injection 수정 |
| `brick/brick/engine/executor.py` | 수정 | BRK-003 | gate_waiting 이벤트 분기 |
| `brick/brick/engine/state_machine.py` | 수정 | BRK-003,004 | WAITING_APPROVAL + on_fail route |
| `brick/brick/engine/condition_evaluator.py` | 수정 | BRK-004 | _below/_above 접미사 호환 |
| `dashboard/server/routes/brick/approvals.ts` | 수정 | BUG-5,BRK-006 | bridge 연동 + 인증 |
| `dashboard/server/routes/brick/workflows.ts` | 수정 | BUG-6 | 상태 가드 + bridge + id 조회 |
| `dashboard/server/routes/brick/projects.ts` | 수정 | BUG-1,4 | DELETE + invariants 라우트 |
| `dashboard/server/routes/brick/presets.ts` | 수정 | BUG-2,BRK-007 | yaml 패키지 + 주석 |
| `dashboard/server/routes/brick/review.ts` | 수정 | BUG-3,BRK-006 | FK 확인 + 인증 |
| `dashboard/server/routes/brick/links.ts` | 수정 | BUG-7,BRK-008 | linkType 검증 + loop 면제 |
| `dashboard/server/middleware/brick-auth.ts` | 신규 | BRK-006 | requireApprover 미들웨어 |
| `dashboard/__tests__/brick/bugfix-sprint1.test.ts` | 신규 | 전체 | TDD 45건 |

---

## 19. TDD 총괄

| 버그 | TDD ID | 건수 |
|------|--------|------|
| BRK-QA-001 | BF-01 ~ BF-03 | 3건 |
| BRK-QA-002 | BF-04 ~ BF-06 | 3건 |
| BRK-QA-011 | BF-07 ~ BF-09 | 3건 |
| BRK-QA-003 | BF-10 ~ BF-12 | 3건 |
| BRK-QA-004 | BF-13 ~ BF-17 | 5건 |
| BUG-5 | BF-18 ~ BF-21 | 4건 |
| BUG-6 | BF-22 ~ BF-26 | 5건 |
| BRK-QA-006 | BF-27 ~ BF-30 | 4건 |
| BUG-1 | BF-31 ~ BF-34 | 4건 |
| BUG-2 | BF-35 ~ BF-36 | 2건 |
| BUG-3 | BF-37 ~ BF-38 | 2건 |
| BUG-4 | BF-39 ~ BF-40 | 2건 |
| BUG-7 | BF-41 ~ BF-42 | 2건 |
| BRK-QA-007 | BF-43 | 1건 |
| BRK-QA-008 | BF-44 ~ BF-45 | 2건 |
| **합계** | | **45건** |

---

## 20. 불변식 (Invariant)

| ID | 규칙 | 검증 |
|----|------|------|
| INV-BF-1 | init_engine은 ConcreteGateExecutor를 사용해야 함 | BF-01 |
| INV-BF-2 | init_engine은 adapter_pool을 구성하여 주입해야 함 | BF-04 |
| INV-BF-3 | Command gate는 context 값을 shell-escape 후 사용해야 함 | BF-07 |
| INV-BF-4 | approval gate 대기는 WAITING_APPROVAL 상태로 표현해야 함 | BF-10 |
| INV-BF-5 | gate 실패 시 on_fail=route면 link.on_fail 타겟으로 라우팅해야 함 | BF-15 |
| INV-BF-6 | CEO 승인/반려 후 Python 엔진에 approval_action 전달해야 함 | BF-18 |
| INV-BF-7 | resume는 paused/cancelled/suspended에서만, cancel은 pending/running/paused/suspended에서만 허용 | BF-22~25 |
| INV-BF-8 | resume/cancel은 반드시 EngineBridge를 경유해야 함 (INV-EB-1) | BF-26 |
| INV-BF-9 | 승인/리뷰/override는 인증된 사용자만 가능해야 함 | BF-27 |
| INV-BF-10 | DELETE /projects는 FK 의존 데이터를 트랜잭션으로 정리해야 함 | BF-31 |
| INV-BF-11 | YAML 파싱은 `yaml` 패키지 사용, `js-yaml` 미사용 | BF-35 |
| INV-BF-12 | FK 참조 실패는 500이 아닌 404 반환해야 함 | BF-37 |
| INV-BF-13 | linkType은 6종 허용 목록 외 값 저장 불가 | BF-41 |
| INV-BF-14 | loop 타입 링크는 DAG cycle 검사에서 면제해야 함 | BF-44 |

---

*Design 끝 — 15건 버그 (엔진 5 + API 10) × 원인/수정/TDD + 참고 8건 + 4-Phase 수정 순서*
