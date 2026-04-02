"""PromptEvalGate — LLM prompt-based evaluation."""

from __future__ import annotations

from brick.models.gate import GateResult


class PromptEvalGate:
    """LLM prompt evaluation with configurable client."""

    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    async def evaluate(
        self,
        prompt: str,
        model: str = "haiku",
        confidence_threshold: float = 0.8,
        retries: int = 1,
    ) -> GateResult:
        if not self.llm_client:
            return GateResult(
                passed=False,
                detail="No LLM client configured",
                type="prompt",
            )

        results = []
        for _ in range(retries):
            response = await self.llm_client.evaluate(prompt, model)
            results.append(response)

        passed_count = sum(1 for r in results if r.get("decision") == "yes")
        avg_confidence = sum(r.get("confidence", 0.5) for r in results) / len(results)

        if avg_confidence < confidence_threshold:
            return GateResult(
                passed=False,
                detail="Low confidence → review escalation",
                type="prompt",
                confidence=avg_confidence,
            )

        passed = passed_count > len(results) / 2
        return GateResult(
            passed=passed,
            detail=f"Vote: {passed_count}/{len(results)}",
            type="prompt",
            confidence=avg_confidence,
        )
