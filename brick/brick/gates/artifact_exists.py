"""ArtifactExistsGate — check if specified artifacts exist on disk."""

from __future__ import annotations

from pathlib import Path

from brick.models.gate import GateResult


class ArtifactExistsGate:
    """Check if specified artifacts exist on disk."""

    async def check(self, artifacts: list[str], context: dict) -> GateResult:
        missing = [a for a in artifacts if not Path(a).exists()]
        if missing:
            return GateResult(
                passed=False,
                detail=f"Missing: {missing}",
                type="command",
            )
        return GateResult(passed=True, detail="All artifacts exist", type="command")
