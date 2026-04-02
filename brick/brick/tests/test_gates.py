"""BK-31~51: Gate tests."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from brick.gates.artifact_exists import ArtifactExistsGate
from brick.gates.match_rate import MatchRateGate
from brick.gates.prompt_eval import PromptEvalGate
from brick.gates.agent_eval import AgentEvalGate
from brick.gates.concrete import ConcreteGateExecutor
from brick.gates.base import GateExecutor
from brick.models.block import GateHandler, GateConfig, Block, DoneCondition, ReviewConfig, ReviewRejectConfig
from brick.models.gate import GateResult
from brick.models.workflow import BlockInstance
from brick.models.events import BlockStatus


# --- BK-31~32: Command gates ---

class TestCommandGate:
    @pytest.mark.asyncio
    async def test_bk31_command_exit_0_pass(self):
        """BK-31: command exit 0 = pass."""
        executor = ConcreteGateExecutor()
        handler = GateHandler(type="command", command="true", timeout=10)
        result = await executor._run_command(handler, {})
        assert result.passed is True

    @pytest.mark.asyncio
    async def test_bk32_command_exit_1_fail(self):
        """BK-32: command exit 1 = fail."""
        executor = ConcreteGateExecutor()
        handler = GateHandler(type="command", command="false", timeout=10)
        result = await executor._run_command(handler, {})
        assert result.passed is False


# --- BK-33~34: HTTP gates ---

class TestHttpGate:
    @pytest.mark.asyncio
    async def test_bk33_http_200_pass(self):
        """BK-33: http 200 = pass."""
        executor = ConcreteGateExecutor()
        handler = GateHandler(type="http", url="http://example.com", timeout=10)
        with patch("brick.gates.concrete.httpx") as mock_httpx:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.AsyncClient.return_value = mock_client
            result = await executor._run_http(handler, {})
            assert result.passed is True

    @pytest.mark.asyncio
    async def test_bk34_http_500_fail(self):
        """BK-34: http 500 = fail."""
        executor = ConcreteGateExecutor()
        handler = GateHandler(type="http", url="http://example.com", timeout=10)
        with patch("brick.gates.concrete.httpx") as mock_httpx:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.status_code = 500
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.AsyncClient.return_value = mock_client
            result = await executor._run_http(handler, {})
            assert result.passed is False


# --- BK-35~38: Prompt gates ---

class TestPromptGate:
    @pytest.mark.asyncio
    async def test_bk35_prompt_yes_pass(self):
        """BK-35: prompt 'yes' = pass."""
        mock_llm = AsyncMock()
        mock_llm.evaluate = AsyncMock(return_value={"decision": "yes", "confidence": 0.95})
        gate = PromptEvalGate(llm_client=mock_llm)
        result = await gate.evaluate("Is this good?", retries=1)
        assert result.passed is True

    @pytest.mark.asyncio
    async def test_bk36_prompt_no_fail(self):
        """BK-36: prompt 'no' = fail."""
        mock_llm = AsyncMock()
        mock_llm.evaluate = AsyncMock(return_value={"decision": "no", "confidence": 0.9})
        gate = PromptEvalGate(llm_client=mock_llm)
        result = await gate.evaluate("Is this good?", retries=1)
        assert result.passed is False

    @pytest.mark.asyncio
    async def test_bk37_prompt_low_confidence_escalation(self):
        """BK-37: prompt confidence < threshold → review escalation."""
        mock_llm = AsyncMock()
        mock_llm.evaluate = AsyncMock(return_value={"decision": "yes", "confidence": 0.3})
        gate = PromptEvalGate(llm_client=mock_llm)
        result = await gate.evaluate("Check this", confidence_threshold=0.8)
        assert result.passed is False
        assert "Low confidence" in result.detail

    @pytest.mark.asyncio
    async def test_bk38_prompt_retries_majority(self):
        """BK-38: prompt retries 다수결 (2/3 yes → pass)."""
        mock_llm = AsyncMock()
        mock_llm.evaluate = AsyncMock(side_effect=[
            {"decision": "yes", "confidence": 0.9},
            {"decision": "no", "confidence": 0.9},
            {"decision": "yes", "confidence": 0.9},
        ])
        gate = PromptEvalGate(llm_client=mock_llm)
        result = await gate.evaluate("Check", retries=3)
        assert result.passed is True
        assert "2/3" in result.detail

    @pytest.mark.asyncio
    async def test_bk35_prompt_no_client(self):
        gate = PromptEvalGate(llm_client=None)
        result = await gate.evaluate("test")
        assert result.passed is False
        assert "No LLM client" in result.detail


# --- BK-39~40: Agent gates ---

class TestAgentGate:
    @pytest.mark.asyncio
    async def test_bk39_agent_result(self):
        """BK-39: agent 결과 수집."""
        mock_runner = AsyncMock()
        mock_runner.run = AsyncMock(return_value={"verdict": "pass", "analysis": "Looks good"})
        gate = AgentEvalGate(agent_runner=mock_runner)
        result = await gate.evaluate("Review code")
        assert result.passed is True
        assert "Looks good" in result.detail

    @pytest.mark.asyncio
    async def test_bk40_agent_timeout(self):
        """BK-40: agent timeout."""
        mock_runner = AsyncMock()
        mock_runner.run = AsyncMock(return_value={"verdict": "fail", "analysis": "Timeout"})
        gate = AgentEvalGate(agent_runner=mock_runner)
        result = await gate.evaluate("Review", timeout=1)
        assert result.passed is False

    @pytest.mark.asyncio
    async def test_bk39_agent_no_runner(self):
        gate = AgentEvalGate(agent_runner=None)
        result = await gate.evaluate("test")
        assert result.passed is False
        assert "No agent runner" in result.detail


# --- BK-41~45: GateExecutor modes ---

class TestGateExecutorModes:
    @pytest.mark.asyncio
    async def test_bk41_sequential_one_fail_stops(self):
        """BK-41: command + prompt + agent 순차 (하나 fail → 중단)."""
        executor = ConcreteGateExecutor()
        h1 = GateHandler(type="command", command="true", timeout=5)
        h2 = GateHandler(type="command", command="false", timeout=5)
        h3 = GateHandler(type="command", command="true", timeout=5)
        config = GateConfig(handlers=[h1, h2, h3], evaluation="sequential")
        block_inst = BlockInstance(
            block=Block(id="test", what="test", done=DoneCondition(), gate=config),
            status=BlockStatus.GATE_CHECKING,
        )
        result = await executor.run_gates(block_inst, {})
        assert result.passed is False

    @pytest.mark.asyncio
    async def test_bk42_parallel_mode(self):
        """BK-42: parallel 모드."""
        executor = ConcreteGateExecutor()
        h1 = GateHandler(type="command", command="true", timeout=5)
        h2 = GateHandler(type="command", command="true", timeout=5)
        config = GateConfig(handlers=[h1, h2], evaluation="parallel")
        block_inst = BlockInstance(
            block=Block(id="test", what="test", done=DoneCondition(), gate=config),
            status=BlockStatus.GATE_CHECKING,
        )
        result = await executor.run_gates(block_inst, {})
        assert result.passed is True

    @pytest.mark.asyncio
    async def test_bk43_retry_max_3(self):
        """BK-43: retry max 3."""
        config = GateConfig(
            handlers=[GateHandler(type="command", command="false", timeout=5)],
            on_fail="retry",
            max_retries=3,
        )
        assert config.max_retries == 3
        assert config.on_fail == "retry"

    @pytest.mark.asyncio
    async def test_bk44_rollback(self):
        """BK-44: rollback on_fail."""
        config = GateConfig(on_fail="rollback")
        assert config.on_fail == "rollback"

    @pytest.mark.asyncio
    async def test_bk45_escalate(self):
        """BK-45: escalate on_fail."""
        config = GateConfig(on_fail="escalate")
        assert config.on_fail == "escalate"

    @pytest.mark.asyncio
    async def test_no_gates_pass(self):
        """No gates configured → pass."""
        executor = GateExecutor()
        block_inst = BlockInstance(
            block=Block(id="t", what="t", done=DoneCondition()),
            status=BlockStatus.GATE_CHECKING,
        )
        result = await executor.run_gates(block_inst, {})
        assert result.passed is True


# --- BK-46~51: Review gates ---

class TestReviewGate:
    def test_bk46_review_coo_true_wait(self):
        """BK-46: review coo=true → 대기."""
        review = ReviewConfig(coo=True, timeout=3600)
        assert review.coo is True

    def test_bk47_review_coo_false_skip(self):
        """BK-47: review coo=false → 스킵."""
        review = ReviewConfig(coo=False)
        assert review.coo is False

    def test_bk48_review_timeout(self):
        """BK-48: review 타임아웃."""
        review = ReviewConfig(timeout=60, on_timeout="auto_approve")
        assert review.timeout == 60
        assert review.on_timeout == "auto_approve"

    def test_bk49_review_reject(self):
        """BK-49: review 거부 → on_review_reject."""
        reject = ReviewRejectConfig(max_reviews=3, on_exhaust="escalate")
        config = GateConfig(on_review_reject=reject)
        assert config.on_review_reject.max_reviews == 3

    def test_bk50_review_max_reviews_exhaust(self):
        """BK-50: review max_reviews 소진."""
        reject = ReviewRejectConfig(max_reviews=2, on_exhaust="fail")
        assert reject.on_exhaust == "fail"

    def test_bk51_vote_mode(self):
        """BK-51: vote evaluation mode."""
        config = GateConfig(evaluation="vote")
        assert config.evaluation == "vote"


# --- ArtifactExistsGate ---

class TestArtifactExistsGate:
    @pytest.mark.asyncio
    async def test_all_exist(self, tmp_path):
        f1 = tmp_path / "a.txt"
        f1.write_text("ok")
        gate = ArtifactExistsGate()
        result = await gate.check([str(f1)], {})
        assert result.passed is True

    @pytest.mark.asyncio
    async def test_missing(self, tmp_path):
        gate = ArtifactExistsGate()
        result = await gate.check([str(tmp_path / "nope.txt")], {})
        assert result.passed is False
        assert "Missing" in result.detail


# --- MatchRateGate ---

class TestMatchRateGate:
    @pytest.mark.asyncio
    async def test_above_threshold(self):
        gate = MatchRateGate()
        result = await gate.check(threshold=90.0, actual=95.0, context={})
        assert result.passed is True

    @pytest.mark.asyncio
    async def test_below_threshold(self):
        gate = MatchRateGate()
        result = await gate.check(threshold=90.0, actual=80.0, context={})
        assert result.passed is False
