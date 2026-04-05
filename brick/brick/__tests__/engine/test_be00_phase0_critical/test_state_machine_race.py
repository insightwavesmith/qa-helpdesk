"""Phase 0: StateMachine _extra_link_commands 경쟁 조건 수정 TDD (be_01~be_03)."""

from __future__ import annotations

import pytest

from brick.engine.state_machine import StateMachine, LinkResolveResult
from brick.models.block import Block, DoneCondition
from brick.models.events import Command
from brick.models.link import LinkDefinition
from brick.models.workflow import WorkflowDefinition, WorkflowInstance


def test_be01_state_machine_no_extra_link_commands_instance_var():
    """be_01: StateMachine 인스턴스에 _extra_link_commands 속성이 없어야 함."""
    sm = StateMachine()
    assert not hasattr(sm, '_extra_link_commands'), \
        "_extra_link_commands 인스턴스 변수가 아직 존재함 — 제거 필요"


def test_be02_find_next_blocks_returns_tuple():
    """be_02: _find_next_blocks() 반환 타입이 tuple[list, list]여야 함."""
    sm = StateMachine()

    defn = WorkflowDefinition(
        name="test-tuple",
        blocks=[
            Block(id="a", what="task a", done=DoneCondition()),
            Block(id="b", what="task b", done=DoneCondition()),
        ],
        links=[LinkDefinition(from_block="a", to_block="b", type="sequential")],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")

    result = sm._find_next_blocks(wf, "a")
    assert isinstance(result, tuple), f"tuple이어야 하지만 {type(result)} 반환"
    assert len(result) == 2, f"(next_blocks, extra_commands) 2개 요소여야 하지만 {len(result)}개"
    next_ids, extra_cmds = result
    assert isinstance(next_ids, list)
    assert isinstance(extra_cmds, list)


def test_be03_parallel_blocks_commands_not_overwritten():
    """be_03: 병렬 블록 A, B 완료 시 각각의 커맨드가 보존되어야 함."""
    sm = StateMachine()

    defn = WorkflowDefinition(
        name="test-parallel-race",
        blocks=[
            Block(id="start", what="start", done=DoneCondition()),
            Block(id="a", what="task a", done=DoneCondition()),
            Block(id="b", what="task b", done=DoneCondition()),
            Block(id="c", what="task c", done=DoneCondition()),
            Block(id="d", what="task d", done=DoneCondition()),
        ],
        links=[
            LinkDefinition(from_block="start", to_block="a", type="parallel"),
            LinkDefinition(from_block="start", to_block="b", type="parallel"),
            LinkDefinition(from_block="a", to_block="c", type="sequential"),
            LinkDefinition(from_block="b", to_block="d", type="sequential"),
        ],
    )
    wf = WorkflowInstance.from_definition(defn, "test", "test")

    # A 완료 시 C로의 커맨드
    next_a, cmds_a = sm._find_next_blocks(wf, "a")

    # B 완료 시 D로의 커맨드
    next_b, cmds_b = sm._find_next_blocks(wf, "b")

    # A의 결과가 B에 의해 덮어쓰이지 않음
    assert len(next_a) >= 1, "A 완료 후 다음 블록이 있어야 함"
    assert "c" in next_a, "A 다음은 C여야 함"
    assert len(next_b) >= 1, "B 완료 후 다음 블록이 있어야 함"
    assert "d" in next_b, "B 다음은 D여야 함"
