"""GateExecutor — executes gate handlers to validate block outputs."""

from __future__ import annotations

from typing import Callable, Awaitable

from brick.models.block import GateHandler, GateConfig
from brick.models.gate import GateResult
from brick.models.workflow import BlockInstance

# Type alias for gate handler functions
GateHandlerFn = Callable[[GateHandler, dict], Awaitable[GateResult]]


class GateExecutor:
    """Executes gate handlers (command, http, prompt, agent)."""

    def __init__(self):
        self._handlers: dict[str, GateHandlerFn] = {}
        self._register_builtins()

    def _register_builtins(self) -> None:
        """Subclasses override to register built-in handlers."""
        pass

    def register_gate(self, type_name: str, handler: GateHandlerFn) -> None:
        """Register external gate handler. Overwrites existing type."""
        self._handlers[type_name] = handler

    def registered_gate_types(self) -> set[str]:
        """Registered gate type names. Used by PresetValidator."""
        return set(self._handlers.keys())

    async def execute(self, handler: GateHandler, context: dict) -> GateResult:
        fn = self._handlers.get(handler.type)
        if fn is None:
            raise ValueError(f"Unknown gate type: {handler.type}")
        return await fn(handler, context)

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
