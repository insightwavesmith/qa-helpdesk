"""BD-01~BD-04: Phase 0 브릭 엔진 v2.1 리팩토링 TDD 테스트."""

from __future__ import annotations

import pytest

from brick.engine.state_machine import StateMachine
from brick.models.block import (
    Block, DoneCondition, GateConfig, GateHandler, InputConfig,
)
from brick.models.events import (
    Event, WorkflowStatus, BlockStatus,
    Command, EmitEventCommand,
)
from brick.models.workflow import (
    BlockInstance, WorkflowDefinition, WorkflowInstance,
)
from brick.models.link import LinkDefinition
from brick.models.team import TeamDefinition
from brick.gates.command_allowlist import validate_command, ALLOWED_COMMANDS, BLOCKED_ARGS


# ── BD-01: _find_next_blocks 튜플 반환 (사이드이펙트 제거) ──────────


class TestBD01FindNextBlocksTupleReturn:
    """BD-01: _find_next_blocks가 (next_ids, extra_commands) 튜플을 반환한다."""

    def setup_method(self):
        self.sm = StateMachine()

    def _make_workflow(self, links: list[LinkDefinition]) -> WorkflowInstance:
        blocks = [
            Block(id="a", what="A", done=DoneCondition()),
            Block(id="b", what="B", done=DoneCondition()),
        ]
        teams = {
            "a": TeamDefinition(block_id="a", adapter="test"),
            "b": TeamDefinition(block_id="b", adapter="test"),
        }
        defn = WorkflowDefinition(name="test", blocks=blocks, links=links, teams=teams)
        return WorkflowInstance.from_definition(defn, feature="t", task="t")

    def test_bd01_find_next_blocks_returns_tuple(self):
        """BD-01a: _find_next_blocks는 (next_ids, commands) 튜플을 반환해야 한다."""
        wf = self._make_workflow([
            LinkDefinition(from_block="a", to_block="b", type="sequential"),
        ])
        result = self.sm._find_next_blocks(wf, "a")
        assert isinstance(result, tuple), "_find_next_blocks must return a tuple"
        assert len(result) == 2, "tuple must have exactly 2 elements"
        next_ids, commands = result
        assert isinstance(next_ids, list)
        assert isinstance(commands, list)

    def test_bd01_no_side_effect_on_instance(self):
        """BD-01b: _find_next_blocks 호출 후 self._extra_link_commands가 존재하지 않아야 한다."""
        wf = self._make_workflow([
            LinkDefinition(from_block="a", to_block="b", type="sequential",
                           notify={"on_start": "slack", "on_complete": "slack"}),
        ])
        self.sm._find_next_blocks(wf, "a")
        assert not hasattr(self.sm, "_extra_link_commands") or self.sm._extra_link_commands == []

    def test_bd01_extra_commands_in_return(self):
        """BD-01c: notify 설정된 링크의 EmitEvent commands가 반환 튜플에 포함된다."""
        wf = self._make_workflow([
            LinkDefinition(from_block="a", to_block="b", type="sequential",
                           notify={"on_start": "slack", "on_complete": "slack"}),
        ])
        next_ids, commands = self.sm._find_next_blocks(wf, "a")
        assert "b" in next_ids
        emit_cmds = [c for c in commands if c.type == "emit_event"]
        # on_start + on_complete = 2 EmitEventCommands
        assert len(emit_cmds) == 2

    def test_bd01_gate_passed_uses_returned_commands(self):
        """BD-01d: block.gate_passed 전이에서 반환된 extra_commands가 커맨드에 포함된다."""
        wf = self._make_workflow([
            LinkDefinition(from_block="a", to_block="b", type="sequential",
                           notify={"on_start": "slack"}),
        ])
        wf.status = WorkflowStatus.RUNNING
        wf.blocks["a"].status = BlockStatus.GATE_CHECKING
        wf.current_block_id = "a"

        event = Event(type="block.gate_passed", data={"block_id": "a"})
        new_wf, commands = self.sm.transition(wf, event)

        # Should contain emit_event from notify
        emit_cmds = [c for c in commands if c.type == "emit_event"]
        assert len(emit_cmds) >= 1


# ── BD-02: BlockInstance 직렬화 input + gate ──────────────────────


class TestBD02BlockInstanceSerialization:
    """BD-02: BlockInstance.to_dict/from_dict가 input과 gate를 포함한다."""

    def test_bd02_to_dict_includes_input(self):
        """BD-02a: to_dict 결과에 input 필드가 포함된다."""
        block = Block(
            id="test",
            what="test",
            done=DoneCondition(),
            input=InputConfig(from_block="prev", artifacts=["plan.md"]),
        )
        bi = BlockInstance(block=block, adapter="test")
        d = bi.to_dict()
        assert "input" in d["block"]
        assert d["block"]["input"]["from_block"] == "prev"
        assert d["block"]["input"]["artifacts"] == ["plan.md"]

    def test_bd02_to_dict_includes_gate(self):
        """BD-02b: to_dict 결과에 gate 필드가 포함된다."""
        gate = GateConfig(
            handlers=[GateHandler(type="command", command="npm run build")],
            on_fail="retry",
            max_retries=2,
        )
        block = Block(id="test", what="test", done=DoneCondition(), gate=gate)
        bi = BlockInstance(block=block, adapter="test")
        d = bi.to_dict()
        assert "gate" in d["block"]
        assert d["block"]["gate"]["on_fail"] == "retry"
        assert d["block"]["gate"]["max_retries"] == 2
        assert len(d["block"]["gate"]["handlers"]) == 1
        assert d["block"]["gate"]["handlers"][0]["type"] == "command"

    def test_bd02_from_dict_restores_input(self):
        """BD-02c: from_dict가 input을 복원한다."""
        block = Block(
            id="test", what="test", done=DoneCondition(),
            input=InputConfig(from_block="prev", artifacts=["a.md"]),
        )
        bi = BlockInstance(block=block, adapter="test")
        d = bi.to_dict()
        restored = BlockInstance.from_dict(d)
        assert restored.block.input is not None
        assert restored.block.input.from_block == "prev"
        assert restored.block.input.artifacts == ["a.md"]

    def test_bd02_from_dict_restores_gate(self):
        """BD-02d: from_dict가 gate를 복원한다."""
        gate = GateConfig(
            handlers=[GateHandler(type="metric", metric="match_rate", threshold=0.9)],
            on_fail="skip",
            max_retries=5,
        )
        block = Block(id="test", what="test", done=DoneCondition(), gate=gate)
        bi = BlockInstance(block=block, adapter="test")
        d = bi.to_dict()
        restored = BlockInstance.from_dict(d)
        assert restored.block.gate is not None
        assert restored.block.gate.on_fail == "skip"
        assert restored.block.gate.max_retries == 5
        assert restored.block.gate.handlers[0].metric == "match_rate"
        assert restored.block.gate.handlers[0].threshold == 0.9

    def test_bd02_none_input_gate_roundtrip(self):
        """BD-02e: input/gate가 None인 경우 직렬화/역직렬화 정상 동작."""
        block = Block(id="test", what="test", done=DoneCondition())
        bi = BlockInstance(block=block, adapter="test")
        d = bi.to_dict()
        restored = BlockInstance.from_dict(d)
        assert restored.block.input is None
        assert restored.block.gate is None


# ── BD-03: command_allowlist 보안 강화 ────────────────────────────


class TestBD03CommandAllowlistSecurity:
    """BD-03: command_allowlist 보안 강화 — 셸 메타문자 인젝션 방지."""

    def test_bd03_blocks_pipe_injection(self):
        """BD-03a: 파이프(|) 인젝션 차단."""
        ok, reason = validate_command(["npm", "run", "build", "|", "curl", "evil.com"])
        assert not ok
        assert "차단" in reason or "허용되지 않은" in reason

    def test_bd03_blocks_semicolon_injection(self):
        """BD-03b: 세미콜론(;) 명령 체이닝 차단."""
        ok, reason = validate_command(["npm", "run", "build;rm", "-rf", "/"])
        assert not ok

    def test_bd03_blocks_ampersand_injection(self):
        """BD-03c: &&, & 명령 체이닝 차단."""
        ok, reason = validate_command(["npm", "run", "build", "&&", "curl", "evil.com"])
        assert not ok

    def test_bd03_blocks_subshell_injection(self):
        """BD-03d: $() 서브셸 인젝션 차단."""
        ok, reason = validate_command(["echo", "$(cat /etc/passwd)"])
        assert not ok

    def test_bd03_blocks_redirect_injection(self):
        """BD-03e: 리다이렉트(>, >>) 차단."""
        ok, reason = validate_command(["echo", "data", ">", "/etc/hosts"])
        assert not ok

    def test_bd03_blocks_env_override(self):
        """BD-03f: 환경변수 오버라이드 차단 (VAR=val cmd)."""
        ok, reason = validate_command(["PATH=/tmp", "npm", "run", "build"])
        assert not ok

    def test_bd03_allows_normal_commands(self):
        """BD-03g: 정상 명령은 통과."""
        ok, _ = validate_command(["npm", "run", "build"])
        assert ok
        ok, _ = validate_command(["python", "-m", "pytest", "tests/"])
        assert ok
        ok, _ = validate_command(["git", "status"])
        assert ok

    def test_bd03_blocks_backtick(self):
        """BD-03h: 백틱 명령 치환 차단."""
        ok, reason = validate_command(["echo", "`whoami`"])
        assert not ok

    def test_bd03_blocks_newline_injection(self):
        """BD-03i: 개행문자 인젝션 차단."""
        ok, reason = validate_command(["echo", "hello\nrm -rf /"])
        assert not ok


# ── BD-04: codex_allowlist ─────────────────────────────────────


class TestBD04CodexAllowlist:
    """BD-04: codex/AI 전용 명령 allowlist."""

    def test_bd04_codex_allowlist_exists(self):
        """BD-04a: codex_allowlist 모듈이 존재한다."""
        from brick.gates.codex_allowlist import CODEX_ALLOWED_COMMANDS, validate_codex_command
        assert isinstance(CODEX_ALLOWED_COMMANDS, set)
        assert len(CODEX_ALLOWED_COMMANDS) > 0

    def test_bd04_codex_allows_ai_tools(self):
        """BD-04b: AI 관련 도구가 허용된다."""
        from brick.gates.codex_allowlist import validate_codex_command
        ok, _ = validate_codex_command(["claude", "code", "--help"])
        assert ok

    def test_bd04_codex_blocks_dangerous(self):
        """BD-04c: 위험한 명령은 차단된다."""
        from brick.gates.codex_allowlist import validate_codex_command
        ok, _ = validate_codex_command(["rm", "-rf", "/"])
        assert not ok

    def test_bd04_codex_inherits_blocked_args(self):
        """BD-04d: BLOCKED_ARGS 패턴은 codex에서도 적용된다."""
        from brick.gates.codex_allowlist import validate_codex_command
        ok, _ = validate_codex_command(["claude", "code", "| sh"])
        assert not ok

    def test_bd04_codex_validate_empty(self):
        """BD-04e: 빈 명령 거부."""
        from brick.gates.codex_allowlist import validate_codex_command
        ok, reason = validate_codex_command([])
        assert not ok
        assert "빈 명령" in reason
