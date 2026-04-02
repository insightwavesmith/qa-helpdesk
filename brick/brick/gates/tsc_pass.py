"""TscPassGate — run tsc --noEmit and check exit code."""

from __future__ import annotations

import asyncio

from brick.models.gate import GateResult


class TscPassGate:
    """Run TypeScript compiler check."""

    async def check(self, context: dict) -> GateResult:
        proc = await asyncio.create_subprocess_exec(
            "npx", "tsc", "--noEmit", "--quiet",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        return GateResult(
            passed=proc.returncode == 0,
            detail=stderr.decode() if proc.returncode != 0 else "tsc passed",
            type="command",
        )
