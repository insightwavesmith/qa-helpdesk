"""Phase 0 리팩토링 TDD 테스트 — 브릭 엔진 v2.1.

4건:
1. state_machine.py _extra_link_commands 튜플 반환 (BD-P0-01~03)
2. workflow.py BlockInstance 직렬화 input+gate (BD-P0-04~06)
3. command_allowlist.py 보안 강화 (BD-P0-07~10)
4. codex allowlist (BD-P0-11~12)
"""

from __future__ import annotations

import pytest

from brick.engine.state_machine import StateMachine
from brick.models.block import (
    Block, DoneCondition, GateConfig, GateHandler, InputConfig,
)
from brick.models.events import (
    Event, WorkflowStatus, BlockStatus,
    CompeteStartCommand,
)
from brick.models.link import LinkDefinition
from brick.models.team import TeamDefinition
from brick.models.workflow import BlockInstance, WorkflowDefinition, WorkflowInstance
from brick.gates.command_allowlist import validate_command, ALLOWED_COMMANDS


# ── 1. StateMachine _extra_link_commands → 튜플 반환 ──────────────


class TestStateMachineExtraLinkCommandsTuple:
    """BD-P0-01~03: _find_next_blocks가 튜플 (next_ids, commands) 반환."""

    def setup_method(self):
        self.sm = StateMachine()

    def _make_workflow(self, links, blocks=None, teams=None):
        blks = blocks or [
            Block(id="a", what="A", done=DoneCondition()),
            Block(id="b", what="B", done=DoneCondition()),
        ]
        defn = WorkflowDefinition(
            name="test",
            blocks=blks,
            links=links,
            teams=teams or {
                "a": TeamDefinition(block_id="a", adapter="mock"),
                "b": TeamDefinition(block_id="b", adapter="mock"),
            },
        )
        return WorkflowInstance.from_definition(defn, feature="test", task="test")

    def test_bd_p0_01_find_next_blocks_returns_tuple(self):
        """BD-P0-01: _find_next_blocks는 (next_ids, extra_commands) 튜플 반환."""
        wf = self._make_workflow(links=[
            LinkDefinition(from_block="a", to_block="b", type="sequential"),
        ])
        result = self.sm._find_next_blocks(wf, "a")
        assert isinstance(result, tuple), "_find_next_blocks must return a tuple"
        assert len(result) == 2, "tuple must have (next_ids, extra_commands)"
        next_ids, extra_cmds = result
        assert isinstance(next_ids, list)
        assert isinstance(extra_cmds, list)

    def test_bd_p0_02_no_instance_state_mutation(self):
        """BD-P0-02: _find_next_blocks 호출 후 self._extra_link_commands 미사용."""
        wf = self._make_workflow(links=[
            LinkDefinition(from_block="a", to_block="b", type="sequential"),
        ])
        self.sm._find_next_blocks(wf, "a")
        assert not hasattr(self.sm, '_extra_link_commands') or self.sm._extra_link_commands == []

    def test_bd_p0_03_compete_link_returns_commands_in_tuple(self):
        """BD-P0-03: compete 링크의 CompeteStartCommand가 튜플 두 번째 요소로 반환."""
        blocks = [
            Block(id="a", what="A", done=DoneCondition()),
            Block(id="b", what="B", done=DoneCondition()),
        ]
        links = [
            LinkDefinition(
                from_block="a", to_block="b", type="compete",
                teams=["team1", "team2"],
            ),
        ]
        wf = self._make_workflow(links=links, blocks=blocks)
        next_ids, extra_cmds = self.sm._find_next_blocks(wf, "a")
        assert next_ids == []
        assert any(isinstance(c, CompeteStartCommand) for c in extra_cmds)

    def test_bd_p0_03b_gate_passed_uses_tuple_correctly(self):
        """BD-P0-03b: block.gate_passed 이벤트 처리 시 튜플 반환값 사용."""
        wf = self._make_workflow(links=[
            LinkDefinition(from_block="a", to_block="b", type="sequential"),
        ])
        wf, _ = self.sm.transition(wf, Event(type="workflow.start"))
        wf, _ = self.sm.transition(wf, Event(type="block.started", data={"block_id": "a"}))
        wf, _ = self.sm.transition(wf, Event(type="block.completed", data={"block_id": "a"}))
        wf, cmds = self.sm.transition(wf, Event(type="block.gate_passed", data={"block_id": "a"}))

        assert wf.blocks["a"].status == BlockStatus.COMPLETED
        assert wf.blocks["b"].status == BlockStatus.QUEUED
        cmd_types = [c.type for c in cmds]
        assert "start_block" in cmd_types


# ── 2. BlockInstance 직렬화 input+gate ──────────────────────────


class TestBlockInstanceSerialization:
    """BD-P0-04~06: BlockInstance.to_dict/from_dict에 input+gate 포함."""

    def test_bd_p0_04_to_dict_includes_gate(self):
        """BD-P0-04: to_dict()에 block.gate 직렬화."""
        block = Block(
            id="review",
            what="Code review",
            done=DoneCondition(artifacts=["review.md"]),
            gate=GateConfig(
                handlers=[GateHandler(type="command", command="npm test")],
                on_fail="retry",
                max_retries=2,
            ),
        )
        inst = BlockInstance(block=block, adapter="claude_code")
        d = inst.to_dict()

        assert "gate" in d["block"], "block dict must have gate key"
        gate_data = d["block"]["gate"]
        assert gate_data is not None
        assert gate_data["on_fail"] == "retry"
        assert gate_data["max_retries"] == 2
        assert len(gate_data["handlers"]) == 1
        assert gate_data["handlers"][0]["type"] == "command"

    def test_bd_p0_05_to_dict_includes_input(self):
        """BD-P0-05: to_dict()에 block.input 직렬화."""
        block = Block(
            id="implement",
            what="Write code",
            done=DoneCondition(),
            input=InputConfig(from_block="plan", artifacts=["plan.md"]),
        )
        inst = BlockInstance(block=block, adapter="claude_agent_teams")
        d = inst.to_dict()

        assert "input" in d["block"], "block dict must have input key"
        input_data = d["block"]["input"]
        assert input_data is not None
        assert input_data["from_block"] == "plan"
        assert input_data["artifacts"] == ["plan.md"]

    def test_bd_p0_06_from_dict_restores_gate_and_input(self):
        """BD-P0-06: from_dict()가 gate+input을 올바르게 복원."""
        block = Block(
            id="review",
            what="Code review",
            done=DoneCondition(artifacts=["review.md"]),
            gate=GateConfig(
                handlers=[GateHandler(type="command", command="npm test")],
                on_fail="retry",
                max_retries=2,
            ),
            input=InputConfig(from_block="implement", artifacts=["src/"]),
        )
        inst = BlockInstance(block=block, adapter="claude_code")

        d = inst.to_dict()
        restored = BlockInstance.from_dict(d)

        assert restored.block.gate is not None
        assert restored.block.gate.on_fail == "retry"
        assert restored.block.gate.max_retries == 2
        assert len(restored.block.gate.handlers) == 1
        assert restored.block.gate.handlers[0].type == "command"
        assert restored.block.gate.handlers[0].command == "npm test"

        assert restored.block.input is not None
        assert restored.block.input.from_block == "implement"
        assert restored.block.input.artifacts == ["src/"]

    def test_bd_p0_06b_from_dict_none_gate_and_input(self):
        """BD-P0-06b: gate/input이 None일 때 from_dict 정상 처리."""
        block = Block(id="simple", what="Simple", done=DoneCondition())
        inst = BlockInstance(block=block, adapter="mock")

        d = inst.to_dict()
        restored = BlockInstance.from_dict(d)

        assert restored.block.gate is None
        assert restored.block.input is None


# ── 3. command_allowlist.py 보안 강화 ────────────────────────────


class TestCommandAllowlistSecurity:
    """BD-P0-07~10: command_allowlist 보안 강화."""

    def test_bd_p0_07_block_command_substitution_dollar_paren(self):
        """BD-P0-07: dollar-paren 명령 치환 차단."""
        allowed, reason = validate_command(["echo", "$(whoami)"])
        assert not allowed
        assert "차단" in reason

    def test_bd_p0_08_block_semicolon_chaining(self):
        """BD-P0-08: 세미콜론 명령 체이닝 차단."""
        allowed, reason = validate_command(["echo", "hello;", "whoami"])
        assert not allowed
        assert "차단" in reason

    def test_bd_p0_09_block_and_chaining(self):
        """BD-P0-09: && 명령 체이닝 차단."""
        allowed, reason = validate_command(["echo", "hello", "&&", "whoami"])
        assert not allowed
        assert "차단" in reason

    def test_bd_p0_10_block_or_chaining(self):
        """BD-P0-10: || 명령 체이닝 차단."""
        allowed, reason = validate_command(["echo", "hello", "||", "whoami"])
        assert not allowed
        assert "차단" in reason

    def test_bd_p0_10b_valid_command_still_passes(self):
        """BD-P0-10b: 정상 명령은 여전히 통과."""
        allowed, reason = validate_command(["npm", "test"])
        assert allowed
        assert reason == ""

    def test_bd_p0_10c_block_process_substitution(self):
        """BD-P0-10c: process substitution 차단."""
        allowed, reason = validate_command(["cat", "<(echo", "secret)"])
        assert not allowed
        assert "차단" in reason


# ── 4. codex allowlist ───────────────────────────────────────────


class TestCodexAllowlist:
    """BD-P0-11~12: codex CLI를 ALLOWED_COMMANDS에 추가."""

    def test_bd_p0_11_codex_in_allowed(self):
        """BD-P0-11: codex 명령이 allowlist에 포함."""
        assert "codex" in ALLOWED_COMMANDS

    def test_bd_p0_12_codex_validate_passes(self):
        """BD-P0-12: codex 실행이 validate_command 통과."""
        allowed, reason = validate_command(["codex", "run", "--task", "review"])
        assert allowed
        assert reason == ""

    def test_bd_p0_12b_codex_blocked_args_still_blocked(self):
        """BD-P0-12b: codex라도 차단 인자 패턴은 여전히 거부."""
        allowed, reason = validate_command(["codex", "run", "|", "sh"])
        assert not allowed
