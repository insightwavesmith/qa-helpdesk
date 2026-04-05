"""TDD for brick-loop-exit: Loop 탈출 조건 + Link 분기 로직.

LE-001 ~ LE-030 (30건)
Design: docs/02-design/features/brick-loop-exit.design.md
"""

import copy
import pytest

from brick.engine.condition_evaluator import evaluate_condition
from brick.engine.state_machine import StateMachine
from brick.models.events import Event, BlockStatus, WorkflowStatus
from brick.models.workflow import WorkflowInstance, WorkflowDefinition, BlockInstance
from brick.models.link import LinkDefinition
from brick.models.block import Block, DoneCondition
from brick.models.gate import GateResult


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_check_workflow(
    match_rate=None,
    extra_context=None,
    loop_max_retries=3,
):
    """check 블록에서 분기 테스트용 워크플로우 생성."""
    defn = WorkflowDefinition(
        name="test-pdca",
        blocks=[
            Block(id="do", what="구현", done=DoneCondition()),
            Block(id="check", what="검증", done=DoneCondition()),
            Block(id="review", what="리뷰", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(
                from_block="check", to_block="do",
                type="loop", condition="match_rate < 90",
                max_retries=loop_max_retries,
            ),
            LinkDefinition(
                from_block="check", to_block="review",
                type="branch", condition="match_rate >= 90",
            ),
        ],
    )
    instance = WorkflowInstance.from_definition(defn, "test-feature", "test-task")
    ctx = {}
    if match_rate is not None:
        ctx["match_rate"] = match_rate
    if extra_context:
        ctx.update(extra_context)
    instance.context = ctx
    return instance


def _make_full_pdca_workflow(match_rate=85):
    """plan→design→do→check→review→learn 전체 PDCA."""
    defn = WorkflowDefinition(
        name="full-pdca",
        blocks=[
            Block(id="plan", what="계획", done=DoneCondition()),
            Block(id="design", what="설계", done=DoneCondition()),
            Block(id="do", what="구현", done=DoneCondition()),
            Block(id="check", what="검증", done=DoneCondition()),
            Block(id="review", what="리뷰", done=DoneCondition()),
            Block(id="learn", what="학습", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(from_block="plan", to_block="design", type="sequential"),
            LinkDefinition(from_block="design", to_block="do", type="sequential"),
            LinkDefinition(from_block="do", to_block="check", type="sequential"),
            LinkDefinition(
                from_block="check", to_block="do",
                type="loop", condition="match_rate < 90",
                max_retries=3,
            ),
            LinkDefinition(
                from_block="check", to_block="review",
                type="branch", condition="match_rate >= 90",
            ),
            LinkDefinition(
                from_block="review", to_block="do",
                type="loop", condition="review_status == 'changes_requested'",
                max_retries=3,
            ),
            LinkDefinition(
                from_block="review", to_block="learn",
                type="branch", condition="review_status == 'approved'",
            ),
        ],
    )
    instance = WorkflowInstance.from_definition(defn, "test-feature", "test-task")
    instance.context = {"match_rate": match_rate}
    return instance


# ===========================================================================
# §5.1 ConditionEvaluator 단위 테스트 (LE-001 ~ LE-010)
# ===========================================================================


def test_le01_str_less_than_true():
    """str 조건: match_rate < 90, 값=85 → True."""
    assert evaluate_condition("match_rate < 90", {"match_rate": 85}) is True


def test_le02_str_less_than_false():
    """str 조건: match_rate < 90, 값=95 → False."""
    assert evaluate_condition("match_rate < 90", {"match_rate": 95}) is False


def test_le03_str_gte_true():
    """str 조건: match_rate >= 90, 값=90 (경계값) → True."""
    assert evaluate_condition("match_rate >= 90", {"match_rate": 90}) is True


def test_le04_str_eq_string():
    """str 조건: review_status == 'approved' → True."""
    assert evaluate_condition(
        "review_status == 'approved'", {"review_status": "approved"}
    ) is True


def test_le05_str_eq_string_false():
    """str 조건: review_status == 'approved', 값=changes_requested → False."""
    assert evaluate_condition(
        "review_status == 'approved'", {"review_status": "changes_requested"}
    ) is False


def test_le06_empty_condition():
    """빈 문자열 condition → True (무조건 통과)."""
    assert evaluate_condition("", {"match_rate": 50}) is True


def test_le07_missing_variable():
    """context에 변수 없음 → False."""
    assert evaluate_condition("match_rate < 90", {}) is False


def test_le08_dict_condition():
    """dict 형태 condition: {"match_rate": {"gte": 90}} → True (값=95)."""
    assert evaluate_condition(
        {"match_rate": {"gte": 90}}, {"match_rate": 95}
    ) is True


def test_le09_invalid_pattern():
    """파싱 불가 문자열 → False (차단 기본값)."""
    assert evaluate_condition("not a valid condition", {"x": 1}) is False


def test_le10_none_condition():
    """None condition → True."""
    assert evaluate_condition(None, {"match_rate": 50}) is True


# ===========================================================================
# §5.2 StateMachine _find_next_blocks 통합 테스트 (LE-011 ~ LE-020)
# ===========================================================================


def test_le11_loop_activated_on_low_rate():
    """match_rate=85: loop(check→do) 활성, branch(check→review) 비활성."""
    sm = StateMachine()
    wf = _make_check_workflow(match_rate=85)
    next_blocks, _ = sm._find_next_blocks(wf, "check")
    assert "do" in next_blocks
    assert "review" not in next_blocks


def test_le12_branch_activated_on_high_rate():
    """match_rate=95: branch(check→review) 활성, loop(check→do) 비활성."""
    sm = StateMachine()
    wf = _make_check_workflow(match_rate=95)
    next_blocks, _ = sm._find_next_blocks(wf, "check")
    assert "review" in next_blocks
    assert "do" not in next_blocks


def test_le13_no_double_activation():
    """match_rate=95: do와 review가 동시 활성화되면 안 됨."""
    sm = StateMachine()
    wf = _make_check_workflow(match_rate=95)
    next_blocks, _ = sm._find_next_blocks(wf, "check")
    assert next_blocks == ["review"]


def test_le14_sequential_always_active():
    """sequential link은 항상 진행."""
    sm = StateMachine()
    wf = _make_full_pdca_workflow()
    next_blocks, _ = sm._find_next_blocks(wf, "plan")
    assert "design" in next_blocks


def test_le15_loop_max_iterations():
    """loop 3회 소진 후 → 4회째 빈 리스트 (강제 탈출)."""
    sm = StateMachine()
    wf = _make_check_workflow(match_rate=85)
    wf.context["_loop_check_do"] = 3  # max_retries=3 도달
    next_blocks, _ = sm._find_next_blocks(wf, "check")
    assert "do" not in next_blocks


def test_le16_loop_counter_increments():
    """loop 1회 실행 시 카운터 증가."""
    sm = StateMachine()
    wf = _make_check_workflow(match_rate=85)
    sm._find_next_blocks(wf, "check")
    assert wf.context.get("_loop_check_do") == 1


def test_le17_parallel_ignores_condition():
    """parallel link는 condition 무시, 항상 활성."""
    defn = WorkflowDefinition(
        name="test",
        blocks=[
            Block(id="a", what="A", done=DoneCondition()),
            Block(id="b", what="B", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(
                from_block="a", to_block="b",
                type="parallel", condition="some_var == 'x'",
            ),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "f", "t")
    wf.context = {}
    sm = StateMachine()
    next_blocks, _ = sm._find_next_blocks(wf, "a")
    assert "b" in next_blocks


def test_le18_cron_excluded():
    """cron link는 _find_next_blocks에서 무시."""
    defn = WorkflowDefinition(
        name="test",
        blocks=[
            Block(id="a", what="A", done=DoneCondition()),
            Block(id="b", what="B", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(from_block="a", to_block="b", type="cron", schedule="0 * * * *"),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "f", "t")
    sm = StateMachine()
    next_blocks, _ = sm._find_next_blocks(wf, "a")
    assert next_blocks == []


def test_le19_multiple_branches():
    """3개 branch 중 1개만 condition True → 1개만 반환."""
    defn = WorkflowDefinition(
        name="test",
        blocks=[
            Block(id="check", what="검증", done=DoneCondition()),
            Block(id="a", what="A", done=DoneCondition()),
            Block(id="b", what="B", done=DoneCondition()),
            Block(id="c", what="C", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(from_block="check", to_block="a", type="branch", condition="x == 1"),
            LinkDefinition(from_block="check", to_block="b", type="branch", condition="x == 2"),
            LinkDefinition(from_block="check", to_block="c", type="branch", condition="x == 3"),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "f", "t")
    wf.context = {"x": 2}
    sm = StateMachine()
    next_blocks, _ = sm._find_next_blocks(wf, "check")
    assert next_blocks == ["b"]


def test_le20_no_links_from_block():
    """마지막 블록 (outgoing links 없음) → 빈 리스트."""
    sm = StateMachine()
    wf = _make_check_workflow(match_rate=95)
    next_blocks, _ = sm._find_next_blocks(wf, "review")
    assert next_blocks == []


# ===========================================================================
# §5.3 워크플로우 E2E 시나리오 (LE-021 ~ LE-030)
# ===========================================================================


def test_le21_pdca_loop_then_exit():
    """check(85)→do(loop) → check(95)→review(branch)."""
    sm = StateMachine()
    wf = _make_full_pdca_workflow(match_rate=85)

    # 1차: match_rate=85 → do로 loop
    next1, _ = sm._find_next_blocks(wf, "check")
    assert "do" in next1

    # 2차: match_rate=95로 업데이트 → review로 분기
    wf.context["match_rate"] = 95
    next2, _ = sm._find_next_blocks(wf, "check")
    assert "review" in next2
    assert "do" not in next2


def test_le22_pdca_direct_pass():
    """match_rate=95로 시작 → check에서 바로 review."""
    sm = StateMachine()
    wf = _make_full_pdca_workflow(match_rate=95)
    next_blocks, _ = sm._find_next_blocks(wf, "check")
    assert next_blocks == ["review"]


def test_le23_review_loop_back():
    """review(changes_requested) → do 루프백."""
    sm = StateMachine()
    wf = _make_full_pdca_workflow()
    wf.context["review_status"] = "changes_requested"
    next_blocks, _ = sm._find_next_blocks(wf, "review")
    assert "do" in next_blocks
    assert "learn" not in next_blocks


def test_le24_review_approve_forward():
    """review(approved) → learn 진행."""
    sm = StateMachine()
    wf = _make_full_pdca_workflow()
    wf.context["review_status"] = "approved"
    next_blocks, _ = sm._find_next_blocks(wf, "review")
    assert "learn" in next_blocks
    assert "do" not in next_blocks


def test_le25_max_loop_forced_exit():
    """check 3회 연속 실패 → 4회째 loop 탈출."""
    sm = StateMachine()
    wf = _make_check_workflow(match_rate=85, loop_max_retries=3)

    for i in range(3):
        result, _ = sm._find_next_blocks(wf, "check")
        assert "do" in result, f"Iteration {i+1} should loop back"

    # 4회째: max_retries=3 도달 → do 미포함
    result, _ = sm._find_next_blocks(wf, "check")
    assert "do" not in result


def test_le26_workflow_completes():
    """전체 PDCA 사이클 → WorkflowStatus.COMPLETED."""
    sm = StateMachine()
    wf = _make_full_pdca_workflow(match_rate=95)
    wf.status = WorkflowStatus.RUNNING

    # plan → design → do → check 순서로 완료 시뮬레이션
    for block_id in ["plan", "design", "do"]:
        bi = wf.blocks[block_id]
        bi.status = BlockStatus.RUNNING
        event = Event(type="block.completed", data={"block_id": block_id})
        wf, _ = sm.transition(wf, event)
        gate_event = Event(type="block.gate_passed", data={"block_id": block_id})
        wf, _ = sm.transition(wf, gate_event)

    # check 완료 → match_rate=95이므로 review로 분기
    wf.blocks["check"].status = BlockStatus.RUNNING
    event = Event(type="block.completed", data={"block_id": "check"})
    wf, _ = sm.transition(wf, event)
    gate_event = Event(type="block.gate_passed", data={"block_id": "check"})
    wf, cmds = sm.transition(wf, gate_event)

    assert wf.blocks["review"].status == BlockStatus.QUEUED

    # review 완료 → approved → learn으로
    wf.context["review_status"] = "approved"
    wf.blocks["review"].status = BlockStatus.RUNNING
    event = Event(type="block.completed", data={"block_id": "review"})
    wf, _ = sm.transition(wf, event)
    gate_event = Event(type="block.gate_passed", data={"block_id": "review"})
    wf, _ = sm.transition(wf, gate_event)

    assert wf.blocks["learn"].status == BlockStatus.QUEUED

    # learn 완료 → 워크플로우 완료
    wf.blocks["learn"].status = BlockStatus.RUNNING
    event = Event(type="block.completed", data={"block_id": "learn"})
    wf, _ = sm.transition(wf, event)
    gate_event = Event(type="block.gate_passed", data={"block_id": "learn"})
    wf, _ = sm.transition(wf, gate_event)

    assert wf.status == WorkflowStatus.COMPLETED


def test_le27_context_persisted_through_loop():
    """loop 중 context 값이 유지되는지 확인."""
    sm = StateMachine()
    wf = _make_check_workflow(match_rate=85, extra_context={"extra_key": "preserved"})

    sm._find_next_blocks(wf, "check")

    assert wf.context["match_rate"] == 85
    assert wf.context["extra_key"] == "preserved"
    assert wf.context["_loop_check_do"] == 1


def test_le28_gate_metrics_to_context():
    """GateResult.metrics가 context에 반영되는지 확인."""
    gate_result = GateResult(passed=True, metrics={"match_rate": 95})
    assert gate_result.metrics == {"match_rate": 95}

    context = {}
    if gate_result.metrics:
        context.update(gate_result.metrics)
    assert context["match_rate"] == 95


def test_le29_resume_preserves_loop_counter():
    """checkpoint 저장 → resume 시 _loop_* 카운터 유지."""
    wf = _make_check_workflow(match_rate=85)
    wf.context["_loop_check_do"] = 2

    data = wf.to_dict()
    restored = WorkflowInstance.from_dict(data)

    assert restored.context["_loop_check_do"] == 2
    assert restored.context["match_rate"] == 85


def test_le30_compete_link_always_active():
    """compete link는 항상 활성화."""
    defn = WorkflowDefinition(
        name="test",
        blocks=[
            Block(id="a", what="A", done=DoneCondition()),
            Block(id="b", what="B", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(from_block="a", to_block="b", type="compete"),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "f", "t")
    sm = StateMachine()
    next_blocks, _ = sm._find_next_blocks(wf, "a")
    assert "b" in next_blocks
