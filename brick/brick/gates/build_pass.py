"""BuildPassGate — run npm run build and check exit code."""

from __future__ import annotations

import asyncio

from brick.models.gate import GateResult


class BuildPassGate:
    """Run build command and check exit code."""

    def __init__(self, command: str = "npm run build"):
        self.command = command

    async def check(self, context: dict) -> GateResult:
        proc = await asyncio.create_subprocess_shell(
            self.command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        return GateResult(
            passed=proc.returncode == 0,
            detail=stderr.decode() if proc.returncode != 0 else "build passed",
            type="command",
        )
