"""QA-C: Link 7종 테스트 (C-01 ~ C-16).

StateMachine의 7가지 Link 타입 (sequential, loop, branch, parallel,
compete, cron, hook) + notify 동작을 검증한다.

검증 대상:
- brick/brick/engine/state_machine.py (_find_next_blocks, transition)
- brick/brick/engine/condition_evaluator.py (evaluate_condition)
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from brick.engine.condition_evaluator import evaluate_condition
from brick.engine.state_machine import StateMachine, LinkResolveResult
from brick.models.block import Block, DoneCondition
from brick.models.events import (
    BlockStatus,
    CompeteStartCommand,
    EmitEventCommand,
    Event,
    StartBlockCommand,
    WorkflowStatus,
)
from brick.models.link import LinkDefinition
from brick.models.workflow import BlockInstance, WorkflowDefinition, WorkflowInstance


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_sequential_workflow():
    """A→B→C sequential 워크플로우."""
    defn = WorkflowDefinition(
        name="seq-test",
        blocks=[
            Block(id="A", what="A", done=DoneCondition()),
            Block(id="B", what="B", done=DoneCondition()),
            Block(id="C", what="C", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(from_block="A", to_block="B", type="sequential"),
            LinkDefinition(from_block="B", to_block="C", type="sequential"),
        ],
    )
    return WorkflowInstance.from_definition(defn, "test", "test")


def _run_block_through(sm, wf, block_id):
    """block을 started → completed → gate_passed 까지 전이."""
    wf.blocks[block_id].status = BlockStatus.RUNNING
    wf, _ = sm.transition(wf, Event(type="block.completed", data={"block_id": block_id}))
    wf, cmds = sm.transition(wf, Event(type="block.gate_passed", data={"block_id": block_id}))
    return wf, cmds


# ===========================================================================
# C-01, C-02: Sequential
# ===========================================================================


def test_c01_sequential_abc_order():
    """C-01: A→B→C 순차 링크 — 순서 보장."""
    sm = StateMachine()
    wf = _make_sequential_workflow()

    # A 완료 → B로
    next_from_a = sm._find_next_blocks(wf, "A")
    assert next_from_a == ["B"], f"A 다음은 B여야 함, got {next_from_a}"

    # B 완료 → C로
    next_from_b = sm._find_next_blocks(wf, "B")
    assert next_from_b == ["C"], f"B 다음은 C여야 함, got {next_from_b}"

    # C 완료 → 없음
    next_from_c = sm._find_next_blocks(wf, "C")
    assert next_from_c == [], f"C 다음은 없어야 함, got {next_from_c}"


def test_c02_sequential_mid_fail_stops_chain():
    """C-02: 중간 블록(B) 실패 → 체인 중단, C 미실행."""
    sm = StateMachine()
    wf = _make_sequential_workflow()
    wf.status = WorkflowStatus.RUNNING

    # A 정상 완료
    wf, _ = _run_block_through(sm, wf, "A")
    assert wf.blocks["B"].status == BlockStatus.QUEUED

    # B 실행 시작 후 실패
    wf.blocks["B"].status = BlockStatus.RUNNING
    wf, _ = sm.transition(wf, Event(type="block.failed", data={"block_id": "B", "error": "test error"}))

    assert wf.blocks["B"].status == BlockStatus.FAILED
    assert wf.status == WorkflowStatus.FAILED
    # C는 여전히 PENDING (시작 안 됨)
    assert wf.blocks["C"].status == BlockStatus.PENDING


# ===========================================================================
# C-03, C-04, C-05: Loop
# ===========================================================================


def test_c03_loop_gate_fail_returns():
    """C-03: Gate fail 조건 충족 → loop로 되돌아감."""
    defn = WorkflowDefinition(
        name="loop-test",
        blocks=[
            Block(id="do", what="do", done=DoneCondition()),
            Block(id="check", what="check", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(from_block="do", to_block="check", type="sequential"),
            LinkDefinition(
                from_block="check", to_block="do",
                type="loop", condition="score < 90", max_retries=3,
            ),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")
    wf.context = {"score": 50}  # 조건 충족 → loop 발동

    sm = StateMachine()
    next_blocks = sm._find_next_blocks(wf, "check")
    assert "do" in next_blocks, "score < 90이면 do로 되돌아가야 함"


def test_c04_loop_max_retries_exit():
    """C-04: max_retries 도달 후 loop 탈출 — 무한 루프 방지."""
    defn = WorkflowDefinition(
        name="loop-max-test",
        blocks=[
            Block(id="do", what="do", done=DoneCondition()),
            Block(id="check", what="check", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(
                from_block="check", to_block="do",
                type="loop", condition="score < 90", max_retries=2,
            ),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")
    wf.context = {"score": 50}

    sm = StateMachine()

    # 1회: loop 발동
    r1 = sm._find_next_blocks(wf, "check")
    assert "do" in r1
    assert wf.context["_loop_check_do"] == 1

    # 2회: loop 발동 (max=2이므로 마지막)
    r2 = sm._find_next_blocks(wf, "check")
    assert "do" in r2
    assert wf.context["_loop_check_do"] == 2

    # 3회: max 도달 → 탈출
    r3 = sm._find_next_blocks(wf, "check")
    assert "do" not in r3, "max_retries 초과 시 loop 탈출해야 함"


def test_c05_loop_condition_matching():
    """C-05: loop 조건 평가 — 조건 미충족 시 loop 미발동."""
    defn = WorkflowDefinition(
        name="loop-cond-test",
        blocks=[
            Block(id="do", what="do", done=DoneCondition()),
            Block(id="check", what="check", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(
                from_block="check", to_block="do",
                type="loop", condition="score < 90", max_retries=5,
            ),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")

    sm = StateMachine()

    # 조건 충족 (score=50 < 90)
    wf.context = {"score": 50}
    assert "do" in sm._find_next_blocks(wf, "check")

    # 조건 미충족 (score=95 >= 90)
    wf2 = WorkflowInstance.from_definition(defn, "test", "test")
    wf2.context = {"score": 95}
    assert "do" not in sm._find_next_blocks(wf2, "check")


# ===========================================================================
# C-06, C-07, C-08: Branch
# ===========================================================================


def test_c06_branch_condition_true_goes_b():
    """C-06: 조건 true → B 분기."""
    defn = WorkflowDefinition(
        name="branch-test",
        blocks=[
            Block(id="A", what="A", done=DoneCondition()),
            Block(id="B", what="B-true", done=DoneCondition()),
            Block(id="C", what="C-false", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(from_block="A", to_block="B", type="branch", condition="status == 'approved'"),
            LinkDefinition(from_block="A", to_block="C", type="branch", condition="status == 'rejected'"),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")
    wf.context = {"status": "approved"}

    sm = StateMachine()
    next_blocks = sm._find_next_blocks(wf, "A")
    assert "B" in next_blocks, "status=approved이면 B로 가야 함"
    assert "C" not in next_blocks


def test_c07_branch_condition_false_goes_c():
    """C-07: 조건 false → C 분기 (반대 경로)."""
    defn = WorkflowDefinition(
        name="branch-test",
        blocks=[
            Block(id="A", what="A", done=DoneCondition()),
            Block(id="B", what="B-true", done=DoneCondition()),
            Block(id="C", what="C-false", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(from_block="A", to_block="B", type="branch", condition="status == 'approved'"),
            LinkDefinition(from_block="A", to_block="C", type="branch", condition="status == 'rejected'"),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")
    wf.context = {"status": "rejected"}

    sm = StateMachine()
    next_blocks = sm._find_next_blocks(wf, "A")
    assert "C" in next_blocks, "status=rejected이면 C로 가야 함"
    assert "B" not in next_blocks


def test_c08_branch_no_match_default():
    """C-08: 어떤 branch 조건도 미매칭 → default(sequential) 경로."""
    defn = WorkflowDefinition(
        name="branch-default-test",
        blocks=[
            Block(id="A", what="A", done=DoneCondition()),
            Block(id="B", what="B-branch", done=DoneCondition()),
            Block(id="C", what="C-branch", done=DoneCondition()),
            Block(id="D", what="D-default", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(from_block="A", to_block="B", type="branch", condition="x == 1"),
            LinkDefinition(from_block="A", to_block="C", type="branch", condition="x == 2"),
            # default: sequential (조건 없음 → 항상 진행)
            LinkDefinition(from_block="A", to_block="D", type="sequential"),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")
    wf.context = {"x": 999}  # 어떤 branch 조건도 안 맞음

    sm = StateMachine()
    next_blocks = sm._find_next_blocks(wf, "A")
    assert "B" not in next_blocks
    assert "C" not in next_blocks
    assert "D" in next_blocks, "branch 미매칭 시 sequential default로 가야 함"


# ===========================================================================
# C-09, C-10, C-11: Parallel
# ===========================================================================


def test_c09_parallel_ab_simultaneous():
    """C-09: A 완료 → B, C 동시 시작 (parallel)."""
    defn = WorkflowDefinition(
        name="parallel-test",
        blocks=[
            Block(id="A", what="A", done=DoneCondition()),
            Block(id="B", what="B", done=DoneCondition()),
            Block(id="C", what="C", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(from_block="A", to_block="B", type="parallel"),
            LinkDefinition(from_block="A", to_block="C", type="parallel"),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")

    sm = StateMachine()
    next_blocks = sm._find_next_blocks(wf, "A")
    assert "B" in next_blocks, "B가 병렬 시작되어야 함"
    assert "C" in next_blocks, "C가 병렬 시작되어야 함"
    assert len(next_blocks) == 2


def test_c10_parallel_both_complete_then_next():
    """C-10: 병렬 B, C 둘 다 완료 → 다음(D)으로 진행 (join)."""
    defn = WorkflowDefinition(
        name="parallel-join-test",
        blocks=[
            Block(id="A", what="A", done=DoneCondition()),
            Block(id="B", what="B", done=DoneCondition()),
            Block(id="C", what="C", done=DoneCondition()),
            Block(id="D", what="D-join", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(from_block="A", to_block="B", type="parallel"),
            LinkDefinition(from_block="A", to_block="C", type="parallel"),
            LinkDefinition(from_block="B", to_block="D", type="sequential"),
            LinkDefinition(from_block="C", to_block="D", type="sequential"),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")
    wf.status = WorkflowStatus.RUNNING

    sm = StateMachine()

    # A 완료 → B, C 동시 시작
    wf, _ = _run_block_through(sm, wf, "A")
    assert wf.blocks["B"].status == BlockStatus.QUEUED
    assert wf.blocks["C"].status == BlockStatus.QUEUED

    # B 완료 → D QUEUED
    wf, _ = _run_block_through(sm, wf, "B")

    # C 완료 → D도 이미 QUEUED
    wf, _ = _run_block_through(sm, wf, "C")

    # D 완료 → workflow COMPLETED
    wf, _ = _run_block_through(sm, wf, "D")
    assert wf.status == WorkflowStatus.COMPLETED


def test_c11_parallel_one_fail_whole_fails():
    """C-11: 병렬 블록 중 하나 실패 → 전체 워크플로우 실패."""
    defn = WorkflowDefinition(
        name="parallel-fail-test",
        blocks=[
            Block(id="A", what="A", done=DoneCondition()),
            Block(id="B", what="B", done=DoneCondition()),
            Block(id="C", what="C", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(from_block="A", to_block="B", type="parallel"),
            LinkDefinition(from_block="A", to_block="C", type="parallel"),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")
    wf.status = WorkflowStatus.RUNNING

    sm = StateMachine()

    # A 완료 → B, C 시작
    wf, _ = _run_block_through(sm, wf, "A")

    # B 실패
    wf.blocks["B"].status = BlockStatus.RUNNING
    wf, _ = sm.transition(wf, Event(type="block.failed", data={"block_id": "B", "error": "B crashed"}))

    assert wf.blocks["B"].status == BlockStatus.FAILED
    assert wf.status == WorkflowStatus.FAILED


# ===========================================================================
# C-12, C-13: Compete
# ===========================================================================


def test_c12_compete_winner_adopted():
    """C-12: compete link — teams 지정 시 CompeteStartCommand 발행."""
    defn = WorkflowDefinition(
        name="compete-test",
        blocks=[
            Block(id="A", what="A", done=DoneCondition()),
            Block(id="B", what="B-compete", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(
                from_block="A", to_block="B", type="compete",
                teams=["team-alpha", "team-beta"],
                judge={"criteria": "speed"},
            ),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")

    sm = StateMachine()
    next_blocks = sm._find_next_blocks(wf, "A")

    # teams 있으면 next_ids=[] (외부 경쟁 결과 대기)
    assert next_blocks == [], "compete with teams는 next_ids 빈 리스트"

    # CompeteStartCommand 발행 확인
    extra_cmds = sm._extra_link_commands
    compete_cmds = [c for c in extra_cmds if isinstance(c, CompeteStartCommand)]
    assert len(compete_cmds) == 1
    cmd = compete_cmds[0]
    assert cmd.block_id == "B"
    assert cmd.teams == ["team-alpha", "team-beta"]
    assert cmd.judge == {"criteria": "speed"}


def test_c13_compete_fallback_no_teams():
    """C-13: compete link — teams 미지정 시 sequential fallback (패자 취소 불필요)."""
    defn = WorkflowDefinition(
        name="compete-fallback-test",
        blocks=[
            Block(id="A", what="A", done=DoneCondition()),
            Block(id="B", what="B", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(from_block="A", to_block="B", type="compete", teams=[]),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")

    sm = StateMachine()
    next_blocks = sm._find_next_blocks(wf, "A")

    # teams 없으면 sequential과 동일하게 to_block 반환
    assert next_blocks == ["B"], "teams 없으면 sequential fallback"
    compete_cmds = [c for c in sm._extra_link_commands if isinstance(c, CompeteStartCommand)]
    assert len(compete_cmds) == 0, "teams 없으면 CompeteStartCommand 미발행"


# ===========================================================================
# C-14: Cron
# ===========================================================================


def test_c14_cron_schedule_trigger():
    """C-14: cron link — 스케줄러에 등록, next_ids 빈 리스트."""
    defn = WorkflowDefinition(
        name="cron-test",
        blocks=[
            Block(id="A", what="A", done=DoneCondition()),
            Block(id="B", what="B-scheduled", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(
                from_block="A", to_block="B", type="cron",
                schedule="*/5 * * * *", max_retries=10,
            ),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")

    sm = StateMachine()
    # mock cron_scheduler
    mock_scheduler = MagicMock()
    sm.cron_scheduler = mock_scheduler

    next_blocks = sm._find_next_blocks(wf, "A")

    # cron은 next_ids=[] (스케줄러가 나중에 트리거)
    assert next_blocks == [], "cron link는 즉시 다음 블록 시작 안 함"

    # 스케줄러 register 호출 확인
    assert mock_scheduler.register.called, "cron_scheduler.register 호출 필수"
    registered_job = mock_scheduler.register.call_args[0][0]
    assert registered_job.workflow_id == wf.id
    assert registered_job.to_block_id == "B"
    assert registered_job.schedule == "*/5 * * * *"
    assert registered_job.max_runs == 10


# ===========================================================================
# C-15: Hook
# ===========================================================================


def test_c15_hook_api_trigger():
    """C-15: hook link — 외부 API 트리거 대기, next_ids 빈 리스트."""
    defn = WorkflowDefinition(
        name="hook-test",
        blocks=[
            Block(id="A", what="A", done=DoneCondition()),
            Block(id="B", what="B-hook", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(from_block="A", to_block="B", type="hook"),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")

    sm = StateMachine()
    next_blocks = sm._find_next_blocks(wf, "A")

    # hook은 next_ids=[] (외부 POST /engine/hook/... 대기)
    assert next_blocks == [], "hook link는 외부 트리거 전까지 대기"


# ===========================================================================
# C-16: Notify
# ===========================================================================


def test_c16_notify_link_events():
    """C-16: notify 필드 설정 시 link.started / link.completed 이벤트 발행."""
    defn = WorkflowDefinition(
        name="notify-test",
        blocks=[
            Block(id="A", what="A", done=DoneCondition()),
            Block(id="B", what="B", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(
                from_block="A", to_block="B", type="sequential",
                notify={"on_start": "slack", "on_complete": "slack"},
            ),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")

    sm = StateMachine()
    sm._find_next_blocks(wf, "A")

    extra_cmds = sm._extra_link_commands
    emit_cmds = [c for c in extra_cmds if isinstance(c, EmitEventCommand)]

    # on_start → link.started 이벤트
    started_events = [c for c in emit_cmds if c.event and c.event.type == "link.started"]
    assert len(started_events) == 1, "on_start 설정 시 link.started 이벤트 1건"
    assert started_events[0].event.data["channel"] == "slack"
    assert started_events[0].event.data["from_block"] == "A"
    assert started_events[0].event.data["to_block"] == "B"

    # on_complete → link.completed 이벤트 (sequential이므로 next_ids 있음)
    completed_events = [c for c in emit_cmds if c.event and c.event.type == "link.completed"]
    assert len(completed_events) == 1, "on_complete 설정 시 link.completed 이벤트 1건"
    assert completed_events[0].event.data["channel"] == "slack"
