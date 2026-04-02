"""AgentEvalGate — agent-based evaluation."""

from __future__ import annotations

from brick.models.gate import GateResult


class AgentEvalGate:
    """Agent-based evaluation gate."""

    def __init__(self, agent_runner=None):
        self.agent_runner = agent_runner

    async def evaluate(
        self,
        prompt: str,
        tools: list[str] | None = None,
        timeout: int = 30,
    ) -> GateResult:
        if not self.agent_runner:
            return GateResult(
                passed=False,
                detail="No agent runner configured",
                type="agent",
            )
        result = await self.agent_runner.run(
            prompt=prompt, tools=tools or [], timeout=timeout
        )
        return GateResult(
            passed=result.get("verdict") == "pass",
            detail=result.get("analysis", ""),
            type="agent",
            confidence=result.get("confidence", 0.5),
        )
