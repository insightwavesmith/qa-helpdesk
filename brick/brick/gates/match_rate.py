"""MatchRateGate — check if match rate meets threshold."""

from __future__ import annotations

from brick.models.gate import GateResult


class MatchRateGate:
    """Check if match rate meets threshold."""

    async def check(
        self, threshold: float, actual: float, context: dict
    ) -> GateResult:
        passed = actual >= threshold
        return GateResult(
            passed=passed,
            detail=f"match_rate={actual} vs threshold={threshold}",
            type="command",
        )
