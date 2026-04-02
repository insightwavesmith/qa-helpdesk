"""ConcreteGateExecutor — implements GateExecutor's abstract _run_* methods."""

from __future__ import annotations

import asyncio

import httpx

from brick.gates.base import GateExecutor
from brick.gates.prompt_eval import PromptEvalGate
from brick.gates.agent_eval import AgentEvalGate
from brick.models.block import GateHandler
from brick.models.gate import GateResult


class ConcreteGateExecutor(GateExecutor):
    """Full gate executor with command/http/prompt/agent implementations."""

    def __init__(self, llm_client=None, agent_runner=None):
        self.llm_client = llm_client
        self.agent_runner = agent_runner

    async def _run_command(self, handler: GateHandler, context: dict) -> GateResult:
        cmd = handler.command or ""
        if context:
            try:
                cmd = cmd.format(**context)
            except KeyError:
                pass
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=handler.timeout
            )
        except asyncio.TimeoutError:
            proc.kill()
            return GateResult(passed=False, detail="Command timed out", type="command")
        return GateResult(
            passed=proc.returncode == 0,
            detail=stderr.decode() if proc.returncode != 0 else "",
            type="command",
        )

    async def _run_http(self, handler: GateHandler, context: dict) -> GateResult:
        import httpx

        url = handler.url or ""
        if context:
            try:
                url = url.format(**context)
            except KeyError:
                pass
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    url,
                    headers=handler.headers or {},
                    timeout=handler.timeout,
                )
                return GateResult(
                    passed=resp.status_code == 200,
                    detail=f"HTTP {resp.status_code}",
                    type="http",
                )
        except httpx.HTTPError as e:
            return GateResult(passed=False, detail=str(e), type="http")

    async def _run_prompt(self, handler: GateHandler, context: dict) -> GateResult:
        gate = PromptEvalGate(llm_client=self.llm_client)
        prompt_text = handler.prompt or ""
        if context:
            try:
                prompt_text = prompt_text.format(**context)
            except KeyError:
                pass
        return await gate.evaluate(
            prompt_text,
            handler.model or "haiku",
            handler.confidence_threshold,
            handler.retries,
        )

    async def _run_agent(self, handler: GateHandler, context: dict) -> GateResult:
        gate = AgentEvalGate(agent_runner=self.agent_runner)
        prompt_text = handler.agent_prompt or ""
        if context:
            try:
                prompt_text = prompt_text.format(**context)
            except KeyError:
                pass
        return await gate.evaluate(prompt_text, timeout=handler.timeout)
