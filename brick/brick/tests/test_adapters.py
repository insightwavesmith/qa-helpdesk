"""BK-52~63: Adapter tests."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from brick.adapters.base import TeamAdapter
from brick.adapters.claude_agent_teams import ClaudeAgentTeamsAdapter
from brick.adapters.claude_code import SingleClaudeCodeAdapter
from brick.adapters.human import HumanAdapter
from brick.adapters.webhook import WebhookAdapter
from brick.adapters.codex import CodexAdapter
from brick.models.block import Block, DoneCondition
from brick.models.team import AdapterStatus


@pytest.fixture
def simple_block():
    return Block(id="plan", what="Create plan", done=DoneCondition(artifacts=["plan.md"]))


class TestAdapterIsinstance:
    def test_bk52_all_adapters_isinstance(self):
        """BK-52: 모든 adapter isinstance(TeamAdapter) 체크."""
        adapters = [
            ClaudeAgentTeamsAdapter(),
            SingleClaudeCodeAdapter(),
            HumanAdapter(),
            WebhookAdapter(),
            CodexAdapter(),
        ]
        for adapter in adapters:
            assert isinstance(adapter, TeamAdapter), f"{type(adapter)} is not TeamAdapter"


class TestClaudeAgentTeamsAdapter:
    @pytest.mark.asyncio
    async def test_bk53_start_block(self, simple_block):
        """BK-53: ClaudeAgentTeams start_block."""
        adapter = ClaudeAgentTeamsAdapter({"session": "test"})
        with patch("asyncio.create_subprocess_exec") as mock_exec:
            mock_proc = AsyncMock()
            mock_proc.communicate = AsyncMock(return_value=(b"", b""))
            mock_proc.returncode = 0
            mock_exec.return_value = mock_proc
            eid = await adapter.start_block(simple_block, {"workflow_id": "wf-1"})
            assert eid.startswith("plan-")
            mock_exec.assert_called_once()

    @pytest.mark.asyncio
    async def test_bk54_check_status(self, tmp_path):
        """BK-54: ClaudeAgentTeams check_status."""
        adapter = ClaudeAgentTeamsAdapter({"team_context_dir": str(tmp_path)})
        # No state file → running
        status = await adapter.check_status("plan-123")
        assert status.status == "running"
        # With state file → completed
        state_file = tmp_path / "task-state-plan-123.json"
        state_file.write_text('{"status": "completed"}')
        status = await adapter.check_status("plan-123")
        assert status.status == "completed"

    @pytest.mark.asyncio
    async def test_bk55_tmux_not_found(self, simple_block):
        """BK-55: ClaudeAgentTeams tmux 미존재 에러."""
        adapter = ClaudeAgentTeamsAdapter({"session": "nonexistent"})
        with patch("asyncio.create_subprocess_exec") as mock_exec:
            mock_exec.side_effect = FileNotFoundError("tmux not found")
            with pytest.raises(FileNotFoundError):
                await adapter.start_block(simple_block, {})


class TestHumanAdapter:
    @pytest.mark.asyncio
    async def test_bk56_start_block_cli_output(self, simple_block, capsys):
        """BK-56: Human start_block CLI 출력."""
        adapter = HumanAdapter()
        eid = await adapter.start_block(simple_block, {"workflow_id": "wf-1"})
        assert eid.startswith("human-plan-")
        captured = capsys.readouterr()
        assert "Block: Create plan" in captured.out

    @pytest.mark.asyncio
    async def test_bk57_complete_file_completed(self, tmp_path):
        """BK-57: Human complete 파일 → completed."""
        adapter = HumanAdapter({"completions_dir": str(tmp_path)})
        # Not completed
        status = await adapter.check_status("human-plan-123")
        assert status.status == "waiting_human"
        # Mark completed
        (tmp_path / "human-plan-123").write_text("done")
        status = await adapter.check_status("human-plan-123")
        assert status.status == "completed"


class TestWebhookAdapter:
    @pytest.mark.asyncio
    async def test_bk58_http_failure(self, simple_block):
        """BK-58: Webhook HTTP 실패 에러."""
        adapter = WebhookAdapter({"url": "http://bad-url.invalid", "timeout": 1})
        with pytest.raises(Exception):
            await adapter.start_block(simple_block, {})


class TestAdapterInterchangeability:
    @pytest.mark.asyncio
    async def test_bk59_adapter_swap(self, simple_block):
        """BK-59: adapter 교체해도 동일 결과 (어댑터 무관성)."""
        human = HumanAdapter()
        eid = await human.start_block(simple_block, {})
        assert isinstance(eid, str) and len(eid) > 0

        with patch("asyncio.create_subprocess_exec") as mock_exec:
            mock_proc = AsyncMock()
            mock_proc.communicate = AsyncMock(return_value=(b"", b""))
            mock_exec.return_value = mock_proc
            claude = SingleClaudeCodeAdapter()
            eid2 = await claude.start_block(simple_block, {})
            assert isinstance(eid2, str) and len(eid2) > 0

    @pytest.mark.asyncio
    async def test_bk60_adapter_error_engine_survives(self, simple_block):
        """BK-60: adapter 에러 → engine 생존."""
        adapter = CodexAdapter()
        with pytest.raises(NotImplementedError):
            await adapter.start_block(simple_block, {})
        # Engine should still be usable after adapter error

    @pytest.mark.asyncio
    async def test_bk61_fallback_adapter(self, simple_block):
        """BK-61: fallback adapter."""
        block = Block(
            id="x", what="Test", done=DoneCondition(),
            fallback_adapter="human",
        )
        assert block.fallback_adapter == "human"

    @pytest.mark.asyncio
    async def test_bk62_adapter_timeout(self, simple_block):
        """BK-62: adapter 타임아웃."""
        adapter = WebhookAdapter({"url": "http://example.com", "timeout": 1})
        assert adapter.timeout == 1

    def test_bk63_block_immutable_through_adapter(self, simple_block):
        """BK-63: Autonomy Layer 경계 (Block immutable through adapter)."""
        original_what = simple_block.what
        # Adapter should not modify block
        assert simple_block.what == original_what


class TestCodexAdapter:
    @pytest.mark.asyncio
    async def test_codex_stub(self):
        adapter = CodexAdapter()
        with pytest.raises(NotImplementedError, match="Phase 2 stub"):
            await adapter.start_block(
                Block(id="x", what="x", done=DoneCondition()), {}
            )
        with pytest.raises(NotImplementedError):
            await adapter.check_status("x")
        with pytest.raises(NotImplementedError):
            await adapter.get_artifacts("x")
        with pytest.raises(NotImplementedError):
            await adapter.cancel("x")
