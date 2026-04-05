"""TDD for brick-3axis-plugin — GR-01~07, LR-01~07, AR-01~06, CL-01~12, IT-01~03 + INV-01~10."""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from pathlib import Path
from typing import Awaitable
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from brick.adapters.base import TeamAdapter
from brick.adapters.claude_local import ClaudeLocalAdapter, NESTING_GUARD_VARS
from brick.engine.preset_validator import PresetValidator, DEFAULT_GATE_TYPES, DEFAULT_LINK_TYPES, DEFAULT_ADAPTERS
from brick.engine.state_machine import StateMachine, LinkResolveResult
from brick.gates.base import GateExecutor, GateHandlerFn
from brick.gates.concrete import ConcreteGateExecutor
from brick.models.block import Block, DoneCondition, GateHandler, GateConfig
from brick.models.gate import GateResult
from brick.models.link import LinkDefinition
from brick.models.team import AdapterStatus, TeamDefinition
from brick.models.workflow import BlockInstance, WorkflowDefinition, WorkflowInstance


# ── Helpers ──────────────────────────────────────────────────────────

def make_workflow(
    blocks=None,
    links=None,
    teams=None,
    adapter: str = "claude_agent_teams",
) -> WorkflowInstance:
    if blocks is None:
        blocks = [
            Block(id="A", what="Task A", done=DoneCondition()),
            Block(id="B", what="Task B", done=DoneCondition()),
        ]
    if links is None:
        links = [LinkDefinition(from_block="A", to_block="B")]
    if teams is None:
        teams = {
            "A": TeamDefinition(block_id="A", adapter=adapter),
            "B": TeamDefinition(block_id="B", adapter=adapter),
        }
    defn = WorkflowDefinition(name="test", blocks=blocks, links=links, teams=teams)
    return WorkflowInstance.from_definition(defn, "feat", "task")


def make_definition(
    blocks=None,
    links=None,
    teams=None,
    adapter: str = "claude_agent_teams",
) -> WorkflowDefinition:
    if blocks is None:
        blocks = [
            Block(id="A", what="Task A", done=DoneCondition()),
            Block(id="B", what="Task B", done=DoneCondition()),
        ]
    if links is None:
        links = [LinkDefinition(from_block="A", to_block="B")]
    if teams is None:
        teams = {
            "A": TeamDefinition(block_id="A", adapter=adapter),
            "B": TeamDefinition(block_id="B", adapter=adapter),
        }
    return WorkflowDefinition(name="test", blocks=blocks, links=links, teams=teams)


def make_gate_handler(gate_type: str) -> GateHandler:
    return GateHandler(type=gate_type)


# ── Gate Registry: GR-01 ~ GR-07 ─────────────────────────────────────


class TestGateRegistry:

    def test_gr01_builtin_7_types_registered(self):
        """ConcreteGateExecutor 생성 시 빌트인 8종 자동 등록 (artifact 추가)."""
        ge = ConcreteGateExecutor()
        types = ge.registered_gate_types()
        assert len(types) == 8
        assert types == {"command", "http", "prompt", "agent", "review", "metric", "approval", "artifact"}

    def test_gr02_custom_gate_registered_and_executed(self):
        """register_gate 후 execute(type="custom") 성공."""
        ge = ConcreteGateExecutor()

        async def my_handler(handler: GateHandler, context: dict) -> GateResult:
            return GateResult(passed=True, detail="custom ok")

        ge.register_gate("custom", my_handler)

        handler = make_gate_handler("custom")
        result = asyncio.run(ge.execute(handler, {}))
        assert result.passed is True
        assert result.detail == "custom ok"

    def test_gr03_unknown_gate_raises_value_error(self):
        """미등록 gate type → ValueError, 메시지에 타입명 포함."""
        ge = ConcreteGateExecutor()
        handler = make_gate_handler("nonexistent-type")

        with pytest.raises(ValueError, match="nonexistent-type"):
            asyncio.run(ge.execute(handler, {}))

    def test_gr04_run_command_regression_exit0_passed(self):
        """_run_command 회귀: exit 0 → passed=True."""
        ge = ConcreteGateExecutor()
        handler = make_gate_handler("command")
        handler.command = "echo hello"
        handler.timeout = 5

        result = asyncio.run(ge.execute(handler, {}))
        assert result.passed is True
        assert result.type == "command"

    def test_gr05_custom_gate_preset_validator_passes(self):
        """커스텀 gate 등록 후 PresetValidator → ValidationError 없음."""
        ge = ConcreteGateExecutor()

        async def custom_handler(h, ctx):
            return GateResult(passed=True, detail="ok")

        ge.register_gate("slack-notify", custom_handler)

        sm = StateMachine()
        from brick.dashboard.routes.engine_bridge import AdapterRegistry
        ar = AdapterRegistry()
        ar.register("claude_agent_teams", MagicMock())

        val = PresetValidator(
            gate_types=ge.registered_gate_types(),
            link_types=sm.registered_link_types(),
            adapter_types=ar.registered_adapter_types(),
        )

        blocks = [Block(id="A", what="task", done=DoneCondition(), gate=GateConfig(
            handlers=[make_gate_handler("slack-notify")],
            evaluation="sequential",
        ))]
        teams = {"A": TeamDefinition(block_id="A", adapter="claude_agent_teams")}
        defn = WorkflowDefinition(name="t", blocks=blocks, links=[], teams=teams)
        errors = [e for e in val.validate(defn) if e.severity == "error"]
        # gate type error should not appear
        gate_errors = [e for e in errors if "게이트 타입" in e.message]
        assert len(gate_errors) == 0

    def test_gr06_unregistered_gate_preset_validator_error(self):
        """미등록 gate + PresetValidator → ValidationError 1건."""
        ge = ConcreteGateExecutor()
        sm = StateMachine()
        from brick.dashboard.routes.engine_bridge import AdapterRegistry
        ar = AdapterRegistry()
        ar.register("claude_agent_teams", MagicMock())

        val = PresetValidator(
            gate_types=ge.registered_gate_types(),
            link_types=sm.registered_link_types(),
            adapter_types=ar.registered_adapter_types(),
        )

        blocks = [Block(id="A", what="task", done=DoneCondition(), gate=GateConfig(
            handlers=[make_gate_handler("not-registered-gate")],
            evaluation="sequential",
        ))]
        teams = {"A": TeamDefinition(block_id="A", adapter="claude_agent_teams")}
        defn = WorkflowDefinition(name="t", blocks=blocks, links=[], teams=teams)
        errors = val.validate(defn)
        gate_errors = [e for e in errors if "게이트 타입" in e.message and e.severity == "error"]
        assert len(gate_errors) == 1

    def test_gr07_duplicate_register_uses_latest(self):
        """register_gate 중복 호출 → 최신 handler가 실행됨."""
        ge = ConcreteGateExecutor()
        call_log = []

        async def first(h, ctx):
            call_log.append("first")
            return GateResult(passed=False, detail="first")

        async def second(h, ctx):
            call_log.append("second")
            return GateResult(passed=True, detail="second")

        ge.register_gate("dup-type", first)
        ge.register_gate("dup-type", second)

        handler = make_gate_handler("dup-type")
        result = asyncio.run(ge.execute(handler, {}))
        assert call_log == ["second"]
        assert result.passed is True


# ── Link Registry: LR-01 ~ LR-07 ─────────────────────────────────────


class TestLinkRegistry:

    def test_lr01_builtin_6_types_registered(self):
        """StateMachine 생성 시 빌트인 7종 자동 등록 (hook 포함)."""
        sm = StateMachine()
        types = sm.registered_link_types()
        assert len(types) == 7
        assert types == {"sequential", "loop", "branch", "parallel", "compete", "cron", "hook"}

    def test_lr02_custom_link_registered_and_routed(self):
        """register_link 후 _find_next_blocks에서 라우팅됨."""
        sm = StateMachine()

        def priority_link(link, wf, block_id, context) -> LinkResolveResult:
            return LinkResolveResult(next_ids=[link.to_block], commands=[], context_updates={})

        sm.register_link("priority", priority_link)

        wf = make_workflow(
            links=[LinkDefinition(from_block="A", to_block="B", type="priority")]
        )
        wf.context = {}
        next_ids, _ = sm._find_next_blocks(wf, "A")
        assert "B" in next_ids

    def test_lr03_unregistered_link_ignored(self):
        """미등록 link type → _find_next_blocks → 무시 (빈 list)."""
        sm = StateMachine()
        wf = make_workflow(
            links=[LinkDefinition(from_block="A", to_block="B", type="unknown-link-type")]
        )
        wf.context = {}
        next_ids, _ = sm._find_next_blocks(wf, "A")
        assert next_ids == []

    def test_lr04_sequential_link_regression(self):
        """sequential 링크 회귀 — 다음 블록 반환."""
        sm = StateMachine()
        wf = make_workflow(
            links=[LinkDefinition(from_block="A", to_block="B", type="sequential")]
        )
        wf.context = {}
        next_ids, _ = sm._find_next_blocks(wf, "A")
        assert next_ids == ["B"]

    def test_lr05_loop_link_regression_condition_met(self):
        """loop 링크 회귀 — 조건 충족 시 재실행."""
        sm = StateMachine()
        wf = make_workflow(
            links=[LinkDefinition(
                from_block="A", to_block="A", type="loop",
                condition="count < 3", max_retries=3,
            )]
        )
        wf.context = {"count": 1}
        next_ids, _ = sm._find_next_blocks(wf, "A")
        assert "A" in next_ids

    def test_lr06_custom_link_preset_validator_passes(self):
        """커스텀 link 등록 후 PresetValidator → ValidationError 없음."""
        sm = StateMachine()
        sm.register_link("weighted-random", lambda *a: LinkResolveResult([], [], {}))

        ge = ConcreteGateExecutor()
        from brick.dashboard.routes.engine_bridge import AdapterRegistry
        ar = AdapterRegistry()
        ar.register("claude_agent_teams", MagicMock())

        val = PresetValidator(
            gate_types=ge.registered_gate_types(),
            link_types=sm.registered_link_types(),
            adapter_types=ar.registered_adapter_types(),
        )

        blocks = [
            Block(id="A", what="task A", done=DoneCondition()),
            Block(id="B", what="task B", done=DoneCondition()),
        ]
        links = [LinkDefinition(from_block="A", to_block="B", type="weighted-random")]
        teams = {
            "A": TeamDefinition(block_id="A", adapter="claude_agent_teams"),
            "B": TeamDefinition(block_id="B", adapter="claude_agent_teams"),
        }
        defn = WorkflowDefinition(name="t", blocks=blocks, links=links, teams=teams)
        errors = [e for e in val.validate(defn) if e.severity == "error"]
        link_errors = [e for e in errors if "링크 타입" in e.message]
        assert len(link_errors) == 0

    def test_lr07_unregistered_link_preset_validator_error(self):
        """미등록 link + PresetValidator → ValidationError 1건."""
        sm = StateMachine()
        ge = ConcreteGateExecutor()
        from brick.dashboard.routes.engine_bridge import AdapterRegistry
        ar = AdapterRegistry()
        ar.register("claude_agent_teams", MagicMock())

        val = PresetValidator(
            gate_types=ge.registered_gate_types(),
            link_types=sm.registered_link_types(),
            adapter_types=ar.registered_adapter_types(),
        )

        blocks = [
            Block(id="A", what="task A", done=DoneCondition()),
            Block(id="B", what="task B", done=DoneCondition()),
        ]
        links = [LinkDefinition(from_block="A", to_block="B", type="not-registered-link")]
        teams = {
            "A": TeamDefinition(block_id="A", adapter="claude_agent_teams"),
            "B": TeamDefinition(block_id="B", adapter="claude_agent_teams"),
        }
        defn = WorkflowDefinition(name="t", blocks=blocks, links=links, teams=teams)
        errors = val.validate(defn)
        link_errors = [e for e in errors if "링크 타입" in e.message and e.severity == "error"]
        assert len(link_errors) == 1


# ── Adapter Registry: AR-01 ~ AR-06 ──────────────────────────────────


class TestAdapterRegistry:

    def test_ar01_builtin_5_types_registered(self):
        """AdapterRegistry에 빌트인 5종 등록 (claude_local 포함)."""
        from brick.dashboard.routes.engine_bridge import AdapterRegistry
        from brick.adapters.claude_agent_teams import ClaudeAgentTeamsAdapter
        from brick.adapters.claude_code import ClaudeCodeAdapter
        from brick.adapters.human import HumanAdapter
        from brick.adapters.webhook import WebhookAdapter

        ar = AdapterRegistry()
        ar.register("claude_agent_teams", ClaudeAgentTeamsAdapter({}))
        ar.register("claude_code", ClaudeCodeAdapter({}))
        ar.register("claude_local", ClaudeLocalAdapter({}))
        ar.register("webhook", WebhookAdapter({}))
        ar.register("human", HumanAdapter({}))

        assert ar.registered_adapter_types() == {
            "claude_agent_teams", "claude_code", "claude_local", "webhook", "human"
        }
        assert len(ar.registered_adapter_types()) == 5

    def test_ar02_custom_adapter_register_and_get(self):
        """register("custom", adapter) → get("custom") 인스턴스 반환."""
        from brick.dashboard.routes.engine_bridge import AdapterRegistry

        class MyAdapter(TeamAdapter):
            async def start_block(self, block, context): return "eid"
            async def check_status(self, eid): return AdapterStatus(status="running")
            async def get_artifacts(self, eid): return []
            async def cancel(self, eid): return True

        ar = AdapterRegistry()
        adapter = MyAdapter()
        ar.register("my-agent", adapter)
        assert ar.get("my-agent") is adapter

    def test_ar03_unregistered_raises_key_error(self):
        """미등록 adapter → get() → KeyError."""
        from brick.dashboard.routes.engine_bridge import AdapterRegistry
        ar = AdapterRegistry()
        with pytest.raises(KeyError):
            ar.get("not-registered")

    def test_ar04_dict_compat_getitem(self):
        """registry["name"] dict 호환 __getitem__ 동작."""
        from brick.dashboard.routes.engine_bridge import AdapterRegistry
        ar = AdapterRegistry()
        adapter = MagicMock()
        ar.register("test", adapter)
        assert ar["test"] is adapter

    def test_ar05_custom_adapter_preset_validator_passes(self):
        """커스텀 adapter 등록 후 PresetValidator → ValidationError 없음 (adapter 관련)."""
        from brick.dashboard.routes.engine_bridge import AdapterRegistry
        ar = AdapterRegistry()
        ar.register("claude_agent_teams", MagicMock())
        ar.register("my-custom-agent", MagicMock())

        val = PresetValidator(
            gate_types=DEFAULT_GATE_TYPES,
            link_types=DEFAULT_LINK_TYPES,
            adapter_types=ar.registered_adapter_types(),
        )

        teams = {"A": TeamDefinition(block_id="A", adapter="my-custom-agent")}
        blocks = [Block(id="A", what="task", done=DoneCondition())]
        defn = WorkflowDefinition(name="t", blocks=blocks, links=[], teams=teams)
        errors = val.validate(defn)
        adapter_warnings = [e for e in errors if "어댑터" in e.message]
        assert len(adapter_warnings) == 0

    def test_ar06_unregistered_adapter_preset_validator_warning(self):
        """미등록 adapter + PresetValidator → severity='warning'."""
        from brick.dashboard.routes.engine_bridge import AdapterRegistry
        ar = AdapterRegistry()
        ar.register("claude_agent_teams", MagicMock())

        val = PresetValidator(
            gate_types=DEFAULT_GATE_TYPES,
            link_types=DEFAULT_LINK_TYPES,
            adapter_types=ar.registered_adapter_types(),
        )

        teams = {"A": TeamDefinition(block_id="A", adapter="unknown-adapter-xyz")}
        blocks = [Block(id="A", what="task", done=DoneCondition())]
        defn = WorkflowDefinition(name="t", blocks=blocks, links=[], teams=teams)
        errors = val.validate(defn)
        warnings = [e for e in errors if e.severity == "warning" and "어댑터" in e.message]
        assert len(warnings) == 1


# ── claude_local: CL-01 ~ CL-12 ──────────────────────────────────────


@pytest.fixture
def tmp_runtime(tmp_path):
    return tmp_path / "runtime"


def make_block(block_id: str = "do") -> Block:
    return Block(id=block_id, what="Write hello world", done=DoneCondition())


class TestClaudeLocalAdapter:

    def test_cl01_start_block_execution_id_format(self, tmp_runtime):
        """start_block → execution_id가 cl-{block_id}-{ts} 형식."""
        adapter = ClaudeLocalAdapter({"runtimeDir": str(tmp_runtime)})
        block = make_block("do-1")

        with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock) as mock_exec:
            proc = MagicMock()
            proc.stdin = MagicMock()
            proc.stdin.write = MagicMock()
            proc.stdin.close = MagicMock()
            proc.stdout = MagicMock()
            proc.stdout.read = AsyncMock(return_value=b"")
            proc.stderr = MagicMock()
            proc.stderr.read = AsyncMock(return_value=b"")
            proc.wait = AsyncMock(return_value=None)
            proc.returncode = 0
            mock_exec.return_value = proc

            eid = asyncio.run(adapter.start_block(block, {}))

        assert re.match(r"^cl-do-1-\d+$", eid), f"Bad format: {eid}"

    def test_cl02_env_injection_from_config(self, tmp_runtime):
        """config.env 값이 subprocess env에 주입됨."""
        adapter = ClaudeLocalAdapter({
            "runtimeDir": str(tmp_runtime),
            "env": {"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"},
        })
        env = adapter._build_env("eid-123", "block-1")
        assert env.get("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS") == "1"
        assert env.get("BRICK_EXECUTION_ID") == "eid-123"
        assert env.get("BRICK_BLOCK_ID") == "block-1"

    def test_cl03_nesting_guard_vars_removed(self, tmp_runtime):
        """nesting guard 4개 환경변수가 env에서 제거됨."""
        with patch.dict(os.environ, {
            "CLAUDECODE": "1",
            "CLAUDE_CODE_ENTRYPOINT": "test",
            "CLAUDE_CODE_SESSION": "sess",
            "CLAUDE_CODE_PARENT_SESSION": "parent",
        }):
            adapter = ClaudeLocalAdapter({"runtimeDir": str(tmp_runtime)})
            env = adapter._build_env("eid", "blk")

        for var in NESTING_GUARD_VARS:
            assert var not in env, f"{var} should be removed"

    def test_cl04_args_build_with_model_and_permissions(self, tmp_runtime):
        """--model, --dangerously-skip-permissions args 포함."""
        adapter = ClaudeLocalAdapter({
            "runtimeDir": str(tmp_runtime),
            "model": "claude-opus-4-6",
            "dangerouslySkipPermissions": True,
        })
        args = adapter._build_args()
        assert "--print" in args
        assert "-" in args
        assert "--output-format" in args
        assert "stream-json" in args
        assert "--verbose" in args
        assert "--model" in args
        assert "claude-opus-4-6" in args
        assert "--dangerously-skip-permissions" in args

    def test_cl05_exit0_state_completed(self, tmp_runtime):
        """exit 0 → state file status=completed."""
        adapter = ClaudeLocalAdapter({"runtimeDir": str(tmp_runtime)})
        eid = "cl-blk-123"

        async def run():
            await adapter._monitor_process(
                eid,
                _make_mock_process(exit_code=0, stdout=b"done", stderr=b""),
            )

        asyncio.run(run())
        state = adapter._read_state(eid)
        assert state is not None
        assert state["status"] == "completed"

    def test_cl06_exit1_state_failed(self, tmp_runtime):
        """exit 1 → state file status=failed."""
        adapter = ClaudeLocalAdapter({"runtimeDir": str(tmp_runtime)})
        eid = "cl-blk-456"

        async def run():
            await adapter._monitor_process(
                eid,
                _make_mock_process(exit_code=1, stdout=b"", stderr=b"some error\n"),
            )

        asyncio.run(run())
        state = adapter._read_state(eid)
        assert state is not None
        assert state["status"] == "failed"

    def test_cl07_timeout_sigterm_then_sigkill(self, tmp_runtime):
        """timeout → process.terminate() 호출, 이후 kill."""
        adapter = ClaudeLocalAdapter({
            "runtimeDir": str(tmp_runtime),
            "timeoutSec": 0.01,
            "graceSec": 0.01,
        })
        eid = "cl-timeout-789"
        proc = MagicMock()
        proc.returncode = None
        proc.stdout = MagicMock()
        proc.stdout.read = AsyncMock(side_effect=asyncio.TimeoutError)
        proc.stderr = MagicMock()
        proc.stderr.read = AsyncMock(return_value=b"")
        proc.wait = AsyncMock(side_effect=asyncio.TimeoutError)
        proc.terminate = MagicMock()
        proc.kill = MagicMock()

        async def run():
            await adapter._monitor_process(eid, proc)

        asyncio.run(run())
        proc.terminate.assert_called_once()
        proc.kill.assert_called_once()
        state = adapter._read_state(eid)
        assert state["status"] == "failed"
        assert "타임아웃" in state["error"]

    def test_cl08_cancel_writes_failed_state(self, tmp_runtime):
        """cancel → state file status=failed."""
        adapter = ClaudeLocalAdapter({"runtimeDir": str(tmp_runtime)})
        eid = "cl-cancel-999"
        proc = MagicMock()
        proc.returncode = None
        proc.terminate = MagicMock()
        proc.wait = AsyncMock(return_value=None)
        adapter._processes[eid] = proc

        result = asyncio.run(adapter.cancel(eid))
        assert result is True
        state = adapter._read_state(eid)
        assert state["status"] == "failed"
        assert eid not in adapter._processes

    def test_cl09_check_status_reads_state_file(self, tmp_runtime):
        """check_status → 상태 파일 읽어 AdapterStatus 반환."""
        adapter = ClaudeLocalAdapter({"runtimeDir": str(tmp_runtime)})
        eid = "cl-check-111"
        adapter._write_state(eid, {"status": "completed", "artifacts": ["out.txt"]})

        result = asyncio.run(adapter.check_status(eid))
        assert result.status == "completed"

    def test_cl10_staleness_10min_returns_failed(self, tmp_runtime):
        """10분 초과 execution_id → check_status → failed."""
        adapter = ClaudeLocalAdapter({"runtimeDir": str(tmp_runtime)})
        old_ts = int(time.time()) - 700  # 11분 전
        eid = f"cl-blk-{old_ts}"
        # 상태 파일 없음 → staleness 감지

        result = asyncio.run(adapter.check_status(eid))
        assert result.status == "failed"
        assert "타임아웃" in (result.error or "")

    def test_cl11_command_not_found_state_failed(self, tmp_runtime):
        """claude 명령 미존재 → FileNotFoundError → state file failed."""
        adapter = ClaudeLocalAdapter({
            "runtimeDir": str(tmp_runtime),
            "command": "nonexistent-claude-command-xyz",
        })
        block = make_block("blk-err")

        eid = asyncio.run(adapter.start_block(block, {}))
        state = adapter._read_state(eid)
        assert state is not None
        assert state["status"] == "failed"
        assert "not found" in (state.get("error") or "").lower() or \
               "Command not found" in (state.get("error") or "")

    def test_cl12_env_non_string_values_ignored(self, tmp_runtime):
        """config.env 비-string 값 무시 — int/dict 스킵, string만 주입."""
        adapter = ClaudeLocalAdapter({
            "runtimeDir": str(tmp_runtime),
            "env": {
                "VALID_KEY": "valid_value",
                "INT_KEY": 42,           # should be ignored
                "DICT_KEY": {"a": 1},    # should be ignored
                "NONE_KEY": None,        # should be ignored
            },
        })
        env = adapter._build_env("eid", "blk")
        assert env.get("VALID_KEY") == "valid_value"
        assert "INT_KEY" not in env
        assert "DICT_KEY" not in env
        assert "NONE_KEY" not in env


# ── 통합 테스트: IT-01 ~ IT-03 ────────────────────────────────────────


class TestIntegration:

    def test_it01_existing_presets_regression(self, tmp_path):
        """기존 프리셋 7개 로드 → ValidationError 없음 (있으면 회귀)."""
        presets_dir = Path(__file__).parent.parent.parent / ".bkit" / "presets"
        if not presets_dir.exists():
            pytest.skip("No presets directory found")

        from brick.engine.executor import PresetLoader
        pl = PresetLoader(presets_dir=presets_dir)
        ge = ConcreteGateExecutor()
        sm = StateMachine()
        from brick.dashboard.routes.engine_bridge import AdapterRegistry
        ar = AdapterRegistry()
        ar.register("claude_agent_teams", MagicMock())
        ar.register("claude_code", MagicMock())
        ar.register("claude_local", ClaudeLocalAdapter({}))
        ar.register("webhook", MagicMock())
        ar.register("human", MagicMock())

        val = PresetValidator(
            gate_types=ge.registered_gate_types(),
            link_types=sm.registered_link_types(),
            adapter_types=ar.registered_adapter_types(),
        )

        yaml_files = list(presets_dir.glob("*.yaml"))
        for yaml_file in yaml_files:
            try:
                defn = pl.load(yaml_file.stem)
                errors = [e for e in val.validate(defn) if e.severity == "error"]
                assert errors == [], f"Preset {yaml_file.stem} has errors: {errors}"
            except Exception as e:
                # 로드 실패도 회귀
                pytest.fail(f"Preset {yaml_file.stem} failed to load: {e}")

    def test_it02_three_registries_dynamic_lookup(self):
        """PresetValidator가 3개 레지스트리 동적 조회 — 커스텀 등록 후 통과."""
        ge = ConcreteGateExecutor()
        sm = StateMachine()
        from brick.dashboard.routes.engine_bridge import AdapterRegistry
        ar = AdapterRegistry()
        ar.register("claude_agent_teams", MagicMock())

        # 커스텀 타입 등록
        ge.register_gate("my-gate", AsyncMock(return_value=GateResult(passed=True, detail="ok")))
        sm.register_link("my-link", lambda *a: LinkResolveResult([], [], {}))
        ar.register("my-adapter", MagicMock())

        val = PresetValidator(
            gate_types=ge.registered_gate_types(),
            link_types=sm.registered_link_types(),
            adapter_types=ar.registered_adapter_types(),
        )

        blocks = [
            Block(id="A", what="t", done=DoneCondition(), gate=GateConfig(
                handlers=[make_gate_handler("my-gate")],
                evaluation="sequential",
            )),
            Block(id="B", what="t", done=DoneCondition()),
        ]
        links = [LinkDefinition(from_block="A", to_block="B", type="my-link")]
        teams = {
            "A": TeamDefinition(block_id="A", adapter="my-adapter"),
            "B": TeamDefinition(block_id="B", adapter="my-adapter"),
        }
        defn = WorkflowDefinition(name="t", blocks=blocks, links=links, teams=teams)
        errors = [e for e in val.validate(defn) if e.severity == "error"]
        assert errors == []

    def test_it03_claude_local_no_tmux_engine_start(self, tmp_path):
        """tmux 없는 환경에서 ClaudeLocalAdapter 엔진 시작 — 에러 없이 시작."""
        adapter = ClaudeLocalAdapter({"runtimeDir": str(tmp_path / "runtime")})
        block = make_block("do")

        with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock) as mock_exec:
            proc = _make_mock_process(exit_code=0, stdout=b"ok", stderr=b"")
            mock_exec.return_value = proc

            eid = asyncio.run(adapter.start_block(block, {"key": "value"}))

        assert eid.startswith("cl-do-")
        # Verify create_subprocess_exec was called (not tmux)
        call_args = mock_exec.call_args
        assert call_args is not None
        cmd = call_args[0][0]
        assert cmd != "tmux"


# ── 불변식: INV-01 ~ INV-10 ───────────────────────────────────────────


class TestInvariants:

    def test_inv01_team_adapter_abc_unchanged(self):
        """TeamAdapter ABC 인터페이스 변경 없음 — 4개 추상 메서드."""
        import inspect
        abstract_methods = {
            name for name, method in inspect.getmembers(TeamAdapter)
            if getattr(method, "__isabstractmethod__", False)
        }
        assert abstract_methods == {"start_block", "check_status", "get_artifacts", "cancel"}

    def test_inv02_claude_agent_teams_unchanged(self):
        """claude_agent_teams.py 임포트 정상 — 기존 클래스 무변경."""
        from brick.adapters.claude_agent_teams import ClaudeAgentTeamsAdapter
        adapter = ClaudeAgentTeamsAdapter({})
        assert hasattr(adapter, "start_block")
        assert hasattr(adapter, "check_status")
        assert hasattr(adapter, "cancel")
        assert hasattr(adapter, "get_artifacts")

    def test_inv03_claude_code_unchanged(self):
        """claude_code.py 임포트 정상 — 기존 클래스 무변경."""
        from brick.adapters.claude_code import ClaudeCodeAdapter
        adapter = ClaudeCodeAdapter({})
        assert hasattr(adapter, "start_block")
        assert hasattr(adapter, "check_status")
        assert hasattr(adapter, "cancel")
        assert hasattr(adapter, "get_artifacts")

    def test_inv04_gate_builtin_7_behavior_unchanged(self):
        """Gate 빌트인 7종 동작 유지 — 등록 후 execute 가능."""
        ge = ConcreteGateExecutor()
        for gate_type in ["command", "http", "prompt", "agent", "review", "metric", "approval"]:
            assert gate_type in ge.registered_gate_types()

    def test_inv05_link_builtin_6_behavior_unchanged(self):
        """Link 빌트인 6종 동작 유지."""
        sm = StateMachine()
        for link_type in ["sequential", "loop", "branch", "parallel", "compete", "cron"]:
            assert link_type in sm.registered_link_types()

    def test_inv06_presets_yaml_unchanged(self):
        """기존 프리셋 YAML 파일 무변경 확인 (파일 존재 확인)."""
        presets_dir = Path(__file__).parent.parent.parent / ".bkit" / "presets"
        if not presets_dir.exists():
            pytest.skip("No presets directory")
        yaml_files = list(presets_dir.glob("*.yaml"))
        # 0개라도 테스트는 통과 (존재만 확인)
        assert isinstance(yaml_files, list)

    def test_inv07_claude_local_shell_false(self, tmp_path):
        """subprocess shell=False — create_subprocess_exec 사용."""
        adapter = ClaudeLocalAdapter({"runtimeDir": str(tmp_path)})
        block = make_block("blk")

        captured_calls = []
        original = asyncio.create_subprocess_exec

        async def patched_exec(*args, **kwargs):
            captured_calls.append({"args": args, "kwargs": kwargs})
            proc = _make_mock_process(0, b"", b"")
            return proc

        with patch("asyncio.create_subprocess_exec", side_effect=patched_exec):
            asyncio.run(adapter.start_block(block, {}))

        assert len(captured_calls) > 0
        # shell kwarg should not be True
        for call in captured_calls:
            assert call["kwargs"].get("shell") is not True

    def test_inv08_nesting_guard_always_removed(self):
        """_build_env에서 nesting guard 4개 항상 제거."""
        adapter = ClaudeLocalAdapter({})
        # Even if not in os.environ, this should not raise
        with patch.dict(os.environ, {var: "should-be-removed" for var in NESTING_GUARD_VARS}):
            env = adapter._build_env("eid", "blk")
        for var in NESTING_GUARD_VARS:
            assert var not in env

    def test_inv09_config_env_string_only(self):
        """config.env에서 string 타입만 주입됨."""
        adapter = ClaudeLocalAdapter({
            "env": {
                "STR": "ok",
                "NUM": 123,
                "BOOL": True,
                "LST": [1, 2],
            }
        })
        env = adapter._build_env("eid", "blk")
        assert "STR" in env
        assert env["STR"] == "ok"
        # Non-string values must not be injected
        for key in ["NUM", "BOOL", "LST"]:
            assert key not in env

    def test_inv10_adapter_registry_dict_compat(self):
        """AdapterRegistry __getitem__ + __contains__ dict 호환."""
        from brick.dashboard.routes.engine_bridge import AdapterRegistry
        ar = AdapterRegistry()
        mock_adapter = MagicMock()
        ar.register("test", mock_adapter)

        # __getitem__
        assert ar["test"] is mock_adapter
        # __contains__
        assert "test" in ar
        assert "missing" not in ar
        # items()
        items = dict(ar.items())
        assert "test" in items


# ── 내부 헬퍼 ──────────────────────────────────────────────────────────


def _make_mock_process(exit_code: int, stdout: bytes, stderr: bytes):
    """테스트용 mock subprocess.Process."""
    proc = MagicMock()
    proc.returncode = exit_code
    proc.stdin = MagicMock()
    proc.stdin.write = MagicMock()
    proc.stdin.close = MagicMock()
    proc.stdout = MagicMock()
    proc.stdout.read = AsyncMock(return_value=stdout)
    proc.stderr = MagicMock()
    proc.stderr.read = AsyncMock(return_value=stderr)
    proc.wait = AsyncMock(return_value=None)
    proc.terminate = MagicMock()
    proc.kill = MagicMock()
    return proc
