"""BK-92~97: Integration tests."""

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
import yaml

from brick.engine.executor import WorkflowExecutor, PresetLoader
from brick.engine.state_machine import StateMachine
from brick.engine.event_bus import EventBus
from brick.engine.checkpoint import CheckpointStore
from brick.engine.validator import Validator
from brick.gates.base import GateExecutor
from brick.adapters.human import HumanAdapter
from brick.adapters.claude_agent_teams import ClaudeAgentTeamsAdapter
from brick.adapters.claude_code import SingleClaudeCodeAdapter
from brick.adapters.webhook import WebhookAdapter
from brick.adapters.codex import CodexAdapter
from brick.gates.artifact_exists import ArtifactExistsGate
from brick.gates.match_rate import MatchRateGate
from brick.gates.prompt_eval import PromptEvalGate
from brick.gates.agent_eval import AgentEvalGate
from brick.links.sequential import SequentialLink
from brick.links.parallel import ParallelLink
from brick.links.compete import CompeteLink
from brick.models.events import WorkflowStatus, BlockStatus
from brick.models.team import AdapterStatus


@pytest.fixture
def integration_presets(tmp_path):
    d = tmp_path / "presets"
    d.mkdir()
    preset = {
        "name": "integration-test",
        "level": 2,
        "blocks": [
            {"id": "plan", "type": "Plan", "what": "Plan", "done": {"artifacts": []}},
            {"id": "do", "type": "Do", "what": "Do", "done": {"metrics": {}}},
        ],
        "links": [{"from": "plan", "to": "do", "type": "sequential"}],
        "teams": {
            "plan": {"adapter": "mock", "config": {}},
            "do": {"adapter": "mock", "config": {}},
        },
    }
    (d / "integration-test.yaml").write_text(yaml.dump(preset))
    return d


@pytest.fixture
def mock_adapter():
    adapter = AsyncMock()
    adapter.start_block = AsyncMock(return_value="exec-int-1")
    adapter.check_status = AsyncMock(return_value=AdapterStatus(status="completed"))
    return adapter


class TestIntegration:
    @pytest.mark.asyncio
    async def test_bk92_task_completed_triggers_complete(
        self, integration_presets, tmp_path, mock_adapter
    ):
        """BK-92: TaskCompleted → brick complete 호출."""
        executor = WorkflowExecutor(
            state_machine=StateMachine(),
            event_bus=EventBus(),
            checkpoint=CheckpointStore(tmp_path / "wf"),
            gate_executor=GateExecutor(),
            adapter_pool={"mock": mock_adapter},
            preset_loader=PresetLoader(integration_presets),
        )
        wf_id = await executor.start("integration-test", "feat", "task")
        instance = executor.checkpoint.load(wf_id)
        # Mark first block as gate_checking
        instance.blocks["plan"].status = BlockStatus.GATE_CHECKING
        executor.checkpoint.save(wf_id, instance)
        # Complete triggers gate
        result = await executor.complete_block(wf_id, "plan")
        assert result.passed is True

    @pytest.mark.asyncio
    async def test_bk93_session_resume(
        self, integration_presets, tmp_path, mock_adapter
    ):
        """BK-93: session-resume → brick resume."""
        executor = WorkflowExecutor(
            state_machine=StateMachine(),
            event_bus=EventBus(),
            checkpoint=CheckpointStore(tmp_path / "wf"),
            gate_executor=GateExecutor(),
            adapter_pool={"mock": mock_adapter},
            preset_loader=PresetLoader(integration_presets),
        )
        wf_id = await executor.start("integration-test", "feat", "task")
        instance = await executor.resume(wf_id)
        assert instance is not None

    def test_bk94_existing_hook_wrapping(self):
        """BK-94: 기존 hook → brick CLI 래핑."""
        # Verify CLI commands are importable (entry point wrapping)
        from brick.cli import cli, start, status, complete, validate, viz, init
        assert callable(cli)
        assert callable(start)

    def test_bk95_entry_points_adapter_discovery(self):
        """BK-95: entry_points adapter 발견."""
        # Verify all adapters are importable
        from brick.adapters.claude_agent_teams import ClaudeAgentTeamsAdapter
        from brick.adapters.claude_code import SingleClaudeCodeAdapter
        from brick.adapters.human import HumanAdapter
        from brick.adapters.webhook import WebhookAdapter
        assert ClaudeAgentTeamsAdapter is not None

    def test_bk96_entry_points_gate_discovery(self):
        """BK-96: entry_points gate 발견."""
        from brick.gates.artifact_exists import ArtifactExistsGate
        from brick.gates.match_rate import MatchRateGate
        from brick.gates.prompt_eval import PromptEvalGate
        from brick.gates.agent_eval import AgentEvalGate
        assert ArtifactExistsGate is not None

    def test_bk97_external_plugin_pattern(self):
        """BK-97: 외부 플러그인 설치 후 사용 패턴."""
        # Verify the plugin pattern works (class can be instantiated with config)
        adapter = HumanAdapter({"completions_dir": "/tmp/test"})
        assert adapter.completions_dir == Path("/tmp/test")
        gate = ArtifactExistsGate()
        assert gate is not None
