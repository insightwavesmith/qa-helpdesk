# Brick Loop Exit 버그 Design

> **피처**: brick-loop-exit (Loop 탈출 조건 + Link 분기 로직)
> **레벨**: L2 (버그 원인 + 구조 변경)
> **작성**: PM | 2026-04-03
> **선행**: brick-pdca-preset.design.md, brick-cli-state-sync.design.md

---

## 1. 문제 정의

### 1.1 증상

t-pdca-l2.yaml의 check 블록 완료 시:
- `check→do` (loop, condition: `match_rate < 90`)
- `check→review` (branch, condition: `match_rate >= 90`)

Gate 통과 후 **두 Link 모두 활성화** → do가 다시 QUEUED → 워크플로우 영원히 안 끝남.

### 1.2 근본 원인

**파일**: `brick/brick/engine/state_machine.py`
**메서드**: `_find_next_blocks()` (line 160~165)

```python
# 현재 코드 — 버그
def _find_next_blocks(self, wf: WorkflowInstance, block_id: str) -> list[str]:
    next_ids = []
    for link in wf.definition.links:
        if link.from_block == block_id:
            next_ids.append(link.to_block)  # ← 모든 link 무조건 추가
    return next_ids
```

**문제**: link의 `type`, `condition`을 전혀 평가하지 않음.
- sequential → 항상 진행 (맞음)
- loop → condition 충족 시에만 진행해야 함
- branch → condition 충족 시에만 진행해야 함
- 현재: 모든 타입을 sequential처럼 무조건 진행

### 1.3 영향 범위

| 프리셋 | loop link | 현재 동작 | 기대 동작 |
|--------|----------|----------|----------|
| t-pdca-l2 | check→do (loop) | 무조건 do 큐잉 | match_rate < 90일 때만 |
| t-pdca-l2 | review→do (loop) | 무조건 do 큐잉 | changes_requested일 때만 |
| t-pdca-l3 | 동일 구조 | 동일 버그 | - |

### 1.4 무한루프 시나리오

```
check COMPLETED → gate_passed
  → _find_next_blocks("check") = ["do", "review"]  // 둘 다 반환
  → do: QUEUED → RUNNING → COMPLETED → check: QUEUED
  → review: QUEUED → RUNNING → ...
  = check↔do 영원히 반복, review도 중복 실행
```

---

## 2. 수정 방안

### 2.1 설계 원칙

1. **condition 평가 엔진**: link의 condition 문자열을 워크플로우 context로 평가
2. **link type별 분기 로직**: sequential(항상), loop/branch(condition 평가), parallel(항상, 병렬 실행)
3. **loop 안전장치**: `max_iterations` 필드로 무한루프 방지
4. **state_machine 순수 함수 유지**: condition 평가도 side-effect 없이 수행

### 2.2 Link Condition 평가기

새 파일: `brick/brick/engine/condition_evaluator.py`

```python
"""ConditionEvaluator — link condition 문자열을 context dict로 평가."""

import operator
import re
from typing import Any


# 지원 연산자
_OPERATORS = {
    ">=": operator.ge,
    "<=": operator.le,
    ">": operator.gt,
    "<": operator.lt,
    "==": operator.eq,
    "!=": operator.ne,
}

# 패턴: "variable_name operator value"
_PATTERN = re.compile(
    r"^\s*(\w+)\s*(>=|<=|>|<|==|!=)\s*(.+?)\s*$"
)


def evaluate_condition(condition: str | dict, context: dict) -> bool:
    """condition 문자열/dict를 context로 평가. 빈 condition = True."""
    if not condition:
        return True

    if isinstance(condition, dict):
        # dict 형태: {"match_rate": {"gte": 90}}
        return _evaluate_dict_condition(condition, context)

    if isinstance(condition, str):
        return _evaluate_str_condition(condition, context)

    return True


def _evaluate_str_condition(condition: str, context: dict) -> bool:
    """문자열 condition 평가. 예: 'match_rate < 90'"""
    match = _PATTERN.match(condition)
    if not match:
        return True  # 파싱 실패 시 통과 (안전 기본값)

    var_name, op_str, raw_value = match.groups()
    actual = context.get(var_name)
    if actual is None:
        return False  # 변수 없으면 조건 미충족

    # 값 타입 추론
    expected = _parse_value(raw_value)
    op_func = _OPERATORS[op_str]

    try:
        return op_func(actual, expected)
    except TypeError:
        return False


def _evaluate_dict_condition(condition: dict, context: dict) -> bool:
    """dict condition 평가. 예: {"match_rate": {"gte": 90}}"""
    for var_name, checks in condition.items():
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


def _parse_value(raw: str) -> Any:
    """문자열 값을 적절한 타입으로 변환."""
    # 숫자
    try:
        if "." in raw:
            return float(raw)
        return int(raw)
    except ValueError:
        pass

    # 따옴표 제거
    if (raw.startswith("'") and raw.endswith("'")) or \
       (raw.startswith('"') and raw.endswith('"')):
        return raw[1:-1]

    return raw
```

### 2.3 StateMachine `_find_next_blocks` 수정

```python
def _find_next_blocks(
    self, wf: WorkflowInstance, block_id: str
) -> list[str]:
    """link type과 condition을 평가하여 다음 블록 결정."""
    from brick.engine.condition_evaluator import evaluate_condition

    next_ids = []
    context = wf.context  # 워크플로우 실행 컨텍스트 (match_rate 등)

    for link in wf.definition.links:
        if link.from_block != block_id:
            continue

        if link.type == "sequential":
            # 순차: 항상 진행
            next_ids.append(link.to_block)

        elif link.type == "loop":
            # 루프: condition 평가 → True일 때만 되돌아감
            if evaluate_condition(link.condition, context):
                # max_iterations 안전장치
                loop_key = f"_loop_{block_id}_{link.to_block}"
                loop_count = context.get(loop_key, 0)
                max_iter = link.max_retries  # max_retries를 loop 제한으로 재활용
                if loop_count < max_iter:
                    context[loop_key] = loop_count + 1
                    next_ids.append(link.to_block)
                # else: max iterations 도달 → loop 무시 (탈출)

        elif link.type == "branch":
            # 분기: condition 평가 → True일 때만 진행
            if evaluate_condition(link.condition, context):
                next_ids.append(link.to_block)

        elif link.type == "parallel":
            # 병렬: 항상 진행 (merge_strategy는 별도 처리)
            next_ids.append(link.to_block)

        elif link.type == "compete":
            # 경쟁: 항상 진행 (judge는 별도 처리)
            next_ids.append(link.to_block)

        elif link.type == "cron":
            # 크론: 스케줄러가 관리 → _find_next_blocks에서는 무시
            pass

    return next_ids
```

### 2.4 정상 동작 시나리오 (수정 후)

```
# match_rate = 85 (< 90)
check COMPLETED → gate_passed
  → context = {"match_rate": 85}
  → check→do (loop, "match_rate < 90"): evaluate → True → do 큐잉
  → check→review (branch, "match_rate >= 90"): evaluate → False → 스킵
  = do만 큐잉. 정상 loop.

# match_rate = 95 (>= 90)
check COMPLETED → gate_passed
  → context = {"match_rate": 95}
  → check→do (loop, "match_rate < 90"): evaluate → False → 스킵
  → check→review (branch, "match_rate >= 90"): evaluate → True → review 큐잉
  = review만 큐잉. loop 탈출.
```

### 2.5 Gate → Context 연결

현재 `complete_block()`에서 Gate 결과가 context에 반영되지 않는 문제도 있음.
Gate 결과를 context에 저장해야 condition 평가가 가능:

**executor.py `complete_block()` 추가 코드:**

```python
async def complete_block(self, workflow_id: str, block_id: str):
    ...
    # Gate 실행
    gate_result = await self.gate_executor.run_gates(block_inst, instance.context)

    # Gate 결과를 context에 반영 (condition 평가용)
    if gate_result.metrics:
        instance.context.update(gate_result.metrics)
    # 예: gate_result.metrics = {"match_rate": 95}
    ...
```

**GateResult 모델 확장:**

```python
@dataclass
class GateResult:
    passed: bool
    detail: str = ""
    metrics: dict = field(default_factory=dict)  # ← 추가
```

### 2.6 max_iterations 안전장치

| 설정 | 값 | 의미 |
|------|---|------|
| `link.max_retries` (기존 필드) | 기본 3 | loop 최대 반복 횟수 |
| `_loop_{from}_{to}` context 키 | 0~N | 현재 반복 횟수 |
| max 도달 시 | loop 무시 | 강제 탈출 |

t-pdca-l2.yaml의 check→do loop은 `max_retries: 3` → 최대 3회 loop 후 강제 탈출.

---

## 3. 변경 요약

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `brick/brick/engine/condition_evaluator.py` | **신규** | condition 문자열/dict 평가기 |
| `brick/brick/engine/state_machine.py` | 수정 | `_find_next_blocks()` link type별 분기 + condition 평가 |
| `brick/brick/engine/executor.py` | 수정 | `complete_block()` gate_result.metrics → context 반영 |
| `brick/brick/models/gate.py` | 수정 | `GateResult.metrics` 필드 추가 |
| `brick/brick/tests/engine/test_loop_exit.py` | **신규** | TDD 케이스 |

---

## 4. 엣지 케이스

### 4.1 condition 파싱 실패

condition 문자열이 정규식 매치 실패 → `True` 반환 (안전 기본값).
→ sequential과 동일하게 동작. 최소한 워크플로우가 멈추지는 않음.

### 4.2 context에 변수 없음

`context.get(var_name)` = None → `False` 반환.
→ condition 미충족으로 해당 link 비활성. loop은 돌지 않고, branch는 진행하지 않음.
→ 이 경우 어느 link도 활성화되지 않을 수 있음 → `_all_blocks_completed` 체크로 워크플로우 완료 판단.

### 4.3 양방향 condition이 모두 False

check 블록에서:
- `match_rate < 90` → False
- `match_rate >= 90` → False
- 이 상황은 match_rate가 context에 없을 때만 발생

대응: Gate 결과에 metrics 필수 → context에 항상 match_rate 존재.
보험: 모든 link이 비활성 + 블록 미완료 → 워크플로우 RUNNING 유지 → 수동 개입 필요.

### 4.4 loop 카운터 resume 시 보존

`_loop_*` 키는 `wf.context`에 저장 → checkpoint로 영속화.
resume() 시 context가 복원되므로 카운터도 보존됨.

### 4.5 병렬(parallel) link + condition

parallel link는 condition 평가 없이 항상 진행. 이는 의도적 설계:
병렬은 "모두 실행"이 목적. 조건부 병렬이 필요하면 branch로 분기 후 parallel 사용.

---

## 5. TDD

### 테스트 파일: `brick/brick/tests/engine/test_loop_exit.py`

#### 5.1 ConditionEvaluator 단위 테스트

| ID | 테스트명 | 검증 내용 | 기대 결과 |
|----|---------|----------|----------|
| LE-001 | `test_le01_str_less_than_true` | `"match_rate < 90"`, ctx={"match_rate": 85} | True |
| LE-002 | `test_le02_str_less_than_false` | `"match_rate < 90"`, ctx={"match_rate": 95} | False |
| LE-003 | `test_le03_str_gte_true` | `"match_rate >= 90"`, ctx={"match_rate": 90} | True |
| LE-004 | `test_le04_str_eq_string` | `"review_status == 'approved'"`, ctx={"review_status": "approved"} | True |
| LE-005 | `test_le05_str_eq_string_false` | `"review_status == 'approved'"`, ctx={"review_status": "changes_requested"} | False |
| LE-006 | `test_le06_empty_condition` | condition="" | True |
| LE-007 | `test_le07_missing_variable` | `"match_rate < 90"`, ctx={} | False |
| LE-008 | `test_le08_dict_condition` | {"match_rate": {"gte": 90}} | True (match_rate=95) |
| LE-009 | `test_le09_invalid_pattern` | `"not a valid condition"` | True (안전 기본값) |
| LE-010 | `test_le10_none_condition` | condition=None | True |

#### 5.2 StateMachine _find_next_blocks 통합 테스트

| ID | 테스트명 | 검증 내용 | 기대 결과 |
|----|---------|----------|----------|
| LE-011 | `test_le11_loop_activated_on_low_rate` | match_rate=85, check→do loop | ["do"] |
| LE-012 | `test_le12_branch_activated_on_high_rate` | match_rate=95, check→review branch | ["review"] |
| LE-013 | `test_le13_no_double_activation` | match_rate=95 | do 미포함, review만 |
| LE-014 | `test_le14_sequential_always_active` | plan→design sequential | ["design"] |
| LE-015 | `test_le15_loop_max_iterations` | loop 3회 후 | 4회째 빈 리스트 |
| LE-016 | `test_le16_loop_counter_increments` | loop 1회 실행 | context["_loop_check_do"] == 1 |
| LE-017 | `test_le17_parallel_ignores_condition` | parallel link with condition | 항상 포함 |
| LE-018 | `test_le18_cron_excluded` | cron link | 빈 리스트 |
| LE-019 | `test_le19_multiple_branches` | 3개 branch 중 1개만 True | 1개만 반환 |
| LE-020 | `test_le20_no_links_from_block` | 마지막 블록 (links 없음) | 빈 리스트 |

#### 5.3 워크플로우 E2E 시나리오

| ID | 테스트명 | 검증 내용 | 기대 결과 |
|----|---------|----------|----------|
| LE-021 | `test_le21_pdca_loop_then_exit` | check(85)→do→check(95)→review | review QUEUED |
| LE-022 | `test_le22_pdca_direct_pass` | check(95)→review 직행 | do 미실행 |
| LE-023 | `test_le23_review_loop_back` | review(changes_requested)→do | do QUEUED |
| LE-024 | `test_le24_review_approve_forward` | review(approved)→learn | learn QUEUED |
| LE-025 | `test_le25_max_loop_forced_exit` | check 3회 연속 실패 | 4회째 loop 탈출 |
| LE-026 | `test_le26_workflow_completes` | 전체 PDCA 사이클 완료 | WorkflowStatus.COMPLETED |
| LE-027 | `test_le27_context_persisted_through_loop` | loop 중 context 값 유지 | match_rate 값 보존 |
| LE-028 | `test_le28_gate_metrics_to_context` | Gate 실행 → context 반영 | context["match_rate"] 존재 |
| LE-029 | `test_le29_resume_preserves_loop_counter` | checkpoint 저장 → resume | _loop_* 카운터 유지 |
| LE-030 | `test_le30_compete_link_always_active` | compete link | 항상 활성화 |

### 테스트 구현 코드 (핵심)

```python
import pytest
from brick.engine.condition_evaluator import evaluate_condition
from brick.engine.state_machine import StateMachine
from brick.models.events import Event, BlockStatus, WorkflowStatus
from brick.models.workflow import WorkflowInstance, WorkflowDefinition
from brick.models.link import LinkDefinition
from brick.models.block import Block, DoneCondition


# LE-001
def test_le01_str_less_than_true():
    assert evaluate_condition("match_rate < 90", {"match_rate": 85}) is True

# LE-002
def test_le02_str_less_than_false():
    assert evaluate_condition("match_rate < 90", {"match_rate": 95}) is False

# LE-011
def test_le11_loop_activated_on_low_rate():
    sm = StateMachine()
    wf = _make_check_workflow(match_rate=85)
    # check 블록을 COMPLETED로 만들고 _find_next_blocks 호출
    next_blocks = sm._find_next_blocks(wf, "check")
    assert "do" in next_blocks
    assert "review" not in next_blocks

# LE-012
def test_le12_branch_activated_on_high_rate():
    sm = StateMachine()
    wf = _make_check_workflow(match_rate=95)
    next_blocks = sm._find_next_blocks(wf, "check")
    assert "review" in next_blocks
    assert "do" not in next_blocks

# LE-015
def test_le15_loop_max_iterations():
    sm = StateMachine()
    wf = _make_check_workflow(match_rate=85)
    # 3회 loop 소진
    wf.context["_loop_check_do"] = 3
    next_blocks = sm._find_next_blocks(wf, "check")
    assert "do" not in next_blocks  # max_retries=3 도달 → loop 탈출


def _make_check_workflow(match_rate: int) -> WorkflowInstance:
    """check 블록에서 분기 테스트용 워크플로우 생성."""
    defn = WorkflowDefinition(
        name="test",
        blocks=[
            Block(id="do", what="구현", done=DoneCondition()),
            Block(id="check", what="검증", done=DoneCondition()),
            Block(id="review", what="리뷰", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(
                from_block="check", to_block="do",
                type="loop", condition="match_rate < 90",
                max_retries=3,
            ),
            LinkDefinition(
                from_block="check", to_block="review",
                type="branch", condition="match_rate >= 90",
            ),
        ],
    )
    instance = WorkflowInstance.from_definition(defn, "test-feature", "test-task")
    instance.context = {"match_rate": match_rate}
    return instance
```

---

## 6. 불변식 (Invariant)

| ID | 규칙 | 검증 시점 |
|----|------|----------|
| INV-LE-1 | loop/branch link은 condition 평가 없이 활성화되면 안 됨 | LE-011~013 |
| INV-LE-2 | sequential link은 항상 활성화 | LE-014 |
| INV-LE-3 | 동일 from_block의 loop과 branch가 동시 활성화되면 안 됨 (상호 배타 condition 가정) | LE-013 |
| INV-LE-4 | loop 반복 횟수는 max_retries를 초과할 수 없음 | LE-015, LE-025 |
| INV-LE-5 | context는 checkpoint에 영속화되어 resume 시 복원 | LE-029 |
| INV-LE-6 | Gate 결과의 metrics는 반드시 context에 반영 | LE-028 |
