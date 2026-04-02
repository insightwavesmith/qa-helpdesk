"""GateExecutor — executes gate handlers to validate block outputs."""

from __future__ import annotations

from brick.models.block import GateHandler, GateConfig
from brick.models.gate import GateResult
from brick.models.workflow import BlockInstance


class GateExecutor:
    """Executes gate handlers (command, http, prompt, agent)."""

    async def execute(self, handler: GateHandler, context: dict) -> GateResult:
        match handler.type:
            case "command":
                return await self._run_command(handler, context)
            case "http":
                return await self._run_http(handler, context)
            case "prompt":
                return await self._run_prompt(handler, context)
            case "agent":
                return await self._run_agent(handler, context)
            case _:
                raise ValueError(f"Unknown gate type: {handler.type}")

    async def run_gates(self, block_instance: BlockInstance, context: dict) -> GateResult:
        gate_config = block_instance.block.gate
        if not gate_config or not gate_config.handlers:
            return GateResult(passed=True, detail="No gates configured")

        if gate_config.evaluation == "sequential":
            return await self._run_sequential(gate_config, context)
        elif gate_config.evaluation == "parallel":
            return await self._run_parallel(gate_config, context)
        elif gate_config.evaluation == "vote":
            return await self._run_vote(gate_config, context)
        else:
            raise ValueError(f"Unknown evaluation mode: {gate_config.evaluation}")

    async def _run_sequential(self, config: GateConfig, context: dict) -> GateResult:
        for handler in config.handlers:
            result = await self.execute(handler, context)
            if not result.passed:
                return result
        return GateResult(passed=True, detail="All gates passed (sequential)")

    async def _run_parallel(self, config: GateConfig, context: dict) -> GateResult:
        import asyncio
        tasks = [self.execute(h, context) for h in config.handlers]
        results = await asyncio.gather(*tasks)
        failed = [r for r in results if not r.passed]
        if failed:
            return failed[0]
        return GateResult(passed=True, detail="All gates passed (parallel)")

    async def _run_vote(self, config: GateConfig, context: dict) -> GateResult:
        import asyncio
        tasks = [self.execute(h, context) for h in config.handlers]
        results = await asyncio.gather(*tasks)
        passed_count = sum(1 for r in results if r.passed)
        total = len(results)
        majority = passed_count > total / 2
        return GateResult(
            passed=majority,
            detail=f"Vote: {passed_count}/{total} passed",
        )

    async def _run_command(self, handler: GateHandler, context: dict) -> GateResult:
        raise NotImplementedError("Command gate not implemented in base")

    async def _run_http(self, handler: GateHandler, context: dict) -> GateResult:
        raise NotImplementedError("HTTP gate not implemented in base")

    async def _run_prompt(self, handler: GateHandler, context: dict) -> GateResult:
        raise NotImplementedError("Prompt gate not implemented in base")

    async def _run_agent(self, handler: GateHandler, context: dict) -> GateResult:
        raise NotImplementedError("Agent gate not implemented in base")
