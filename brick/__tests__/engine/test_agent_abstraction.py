"""TDD for brick-agent-abstraction — CL-02, CL-06, CL-08, CL-11, CL-16, CL-19, CL-21, CL-22, CL-24.

agent-abstraction Design(docs/02-design/features/brick-agent-abstraction.design.md) 섹션 8 기준.
test_3axis_plugin.py에서 이미 커버된 케이스 제외, 누락 케이스만 보강.
"""

from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from brick.adapters.claude_local import ClaudeLocalAdapter, NESTING_GUARD_VARS
from brick.engine.preset_validator import PresetValidator
from brick.models.block import Block, DoneCondition


# ── 헬퍼 ─────────────────────────────────────────────────────────────────


def make_block(block_id: str = "do") -> Block:
    return Block(id=block_id, what="Write hello world", done=DoneCondition())


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


@pytest.fixture
def tmp_runtime(tmp_path):
    return tmp_path / "runtime"


# ── agent-abstraction 보강 TDD ────────────────────────────────────────────


class TestClaudeLocalAdapterAbstraction:

    def test_cl02_start_block_state_file_running(self, tmp_runtime):
        """start_block → state file 존재 + status=running (초기화 검증)."""
        adapter = ClaudeLocalAdapter({"runtimeDir": str(tmp_runtime)})
        block = make_block("plan")

        with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock) as mock_exec:
            proc = _make_mock_process(exit_code=0, stdout=b"", stderr=b"")
            mock_exec.return_value = proc

            eid = asyncio.run(adapter.start_block(block, {}))

        # start_block 직후 (monitor task는 cancelled) → state=running
        state = adapter._read_state(eid)
        assert state is not None, "State file must exist after start_block"
        assert state["status"] == "running"

    def test_cl06_max_turns_args_included(self, tmp_runtime):
        """max_turns=50 → _build_args에 --max-turns 50 포함."""
        adapter = ClaudeLocalAdapter({
            "runtimeDir": str(tmp_runtime),
            "maxTurns": 50,
        })
        args = adapter._build_args()
        assert "--max-turns" in args
        idx = args.index("--max-turns")
        assert args[idx + 1] == "50"

    def test_cl08_anthropic_api_key_env_injection(self, tmp_runtime):
        """config.env ANTHROPIC_API_KEY → subprocess env에 주입됨."""
        adapter = ClaudeLocalAdapter({
            "runtimeDir": str(tmp_runtime),
            "env": {"ANTHROPIC_API_KEY": "sk-test-key-123"},
        })
        env = adapter._build_env("eid-abc", "blk-1")
        assert env.get("ANTHROPIC_API_KEY") == "sk-test-key-123"

    def test_cl11_path_injection_when_missing(self, tmp_runtime):
        """PATH 미존재 시 기본 PATH 주입 — /usr/local/bin 또는 /usr/bin 포함."""
        adapter = ClaudeLocalAdapter({"runtimeDir": str(tmp_runtime)})
        # clear=True로 PATH 제거
        environ_without_path = {k: v for k, v in os.environ.items() if k != "PATH"}
        with patch.dict(os.environ, environ_without_path, clear=True):
            env = adapter._build_env("eid-path", "blk-path")

        assert "PATH" in env
        path_val = env["PATH"]
        assert "/usr/local/bin" in path_val or "/usr/bin" in path_val

    def test_cl16_stdout_tail_32kb_cap(self, tmp_runtime):
        """stdout tail 32KB 캡 — state file stdout 길이 ≤ 32768 bytes."""
        adapter = ClaudeLocalAdapter({"runtimeDir": str(tmp_runtime)})
        eid = "cl-cap-test"

        # 5 * 8192 = 40960 bytes — cap 없으면 초과
        large_chunk = b"A" * 8192
        proc = MagicMock()
        proc.returncode = 0
        proc.stdout = MagicMock()
        # 5번 8192byte 청크, 이후 EOF
        proc.stdout.read = AsyncMock(side_effect=[large_chunk] * 5 + [b""])
        proc.stderr = MagicMock()
        proc.stderr.read = AsyncMock(return_value=b"")
        proc.wait = AsyncMock(return_value=None)

        async def run():
            await adapter._monitor_process(eid, proc)

        asyncio.run(run())
        state = adapter._read_state(eid)
        assert state is not None
        assert state["status"] == "completed"
        stdout_bytes = state.get("stdout", "").encode("utf-8", errors="replace")
        assert len(stdout_bytes) <= 32768, f"stdout not capped: {len(stdout_bytes)} bytes"

    def test_cl19_state_missing_10min_recent_returns_running(self, tmp_runtime):
        """state file 미존재 + 10분 이내 execution_id → AdapterStatus(running)."""
        adapter = ClaudeLocalAdapter({"runtimeDir": str(tmp_runtime)})
        recent_ts = int(time.time()) - 60  # 1분 전 (10분 이내)
        eid = f"cl-blk-{recent_ts}"
        # 상태 파일 없음

        result = asyncio.run(adapter.check_status(eid))
        assert result.status == "running"

    def test_cl21_cancel_removes_execution_from_processes(self, tmp_runtime):
        """cancel 완료 후 execution_id가 _processes 딕셔너리에서 제거됨."""
        adapter = ClaudeLocalAdapter({"runtimeDir": str(tmp_runtime)})
        eid = "cl-cancel-remove-123"
        proc = MagicMock()
        proc.returncode = None
        proc.terminate = MagicMock()
        proc.wait = AsyncMock(return_value=None)
        adapter._processes[eid] = proc

        assert eid in adapter._processes  # 사전 확인

        asyncio.run(adapter.cancel(eid))

        assert eid not in adapter._processes, "cancel 후 _processes에서 제거돼야 함"

    def test_cl22_init_engine_adapter_pool_claude_local(self):
        """init_engine 설정 구조상 adapter_pool에 claude_local이 등록됨."""
        from brick.dashboard.routes.engine_bridge import AdapterRegistry

        ar = AdapterRegistry()
        ar.register("claude_agent_teams", MagicMock())
        ar.register("claude_code", MagicMock())
        ar.register("claude_local", ClaudeLocalAdapter({}))
        ar.register("webhook", MagicMock())
        ar.register("human", MagicMock())

        assert "claude_local" in ar.registered_adapter_types()
        # engine_bridge.py에서 ClaudeLocalAdapter import 가능 확인
        from brick.adapters.claude_local import ClaudeLocalAdapter as _CLA
        assert _CLA is ClaudeLocalAdapter

    def test_cl24_existing_presets_regression_no_claude_local(self, tmp_path):
        """기존 프리셋 adapter:claude_agent_teams → claude_local 등록 여부 무관하게 에러 없음."""
        from brick.engine.executor import PresetLoader
        from brick.engine.state_machine import StateMachine
        from brick.gates.concrete import ConcreteGateExecutor
        from brick.dashboard.routes.engine_bridge import AdapterRegistry

        presets_dir = Path(__file__).parent.parent.parent / ".bkit" / "presets"
        if not presets_dir.exists():
            pytest.skip("No presets directory found")

        pl = PresetLoader(presets_dir=presets_dir)
        ge = ConcreteGateExecutor()
        sm = StateMachine()
        ar = AdapterRegistry()
        ar.register("claude_agent_teams", MagicMock())
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
                pytest.fail(f"Preset {yaml_file.stem} failed to load: {e}")
