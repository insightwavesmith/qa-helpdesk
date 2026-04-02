"""ConcreteGateExecutor — implements GateExecutor's abstract _run_* methods."""

from __future__ import annotations

import asyncio
import json
import signal

import httpx

from brick.gates.base import GateExecutor
from brick.gates.prompt_eval import PromptEvalGate
from brick.gates.agent_eval import AgentEvalGate
from brick.models.block import GateHandler
from brick.models.gate import GateResult


class ConcreteGateExecutor(GateExecutor):
    """Full gate executor with command/http/prompt/agent/review implementations."""

    def __init__(self, llm_client=None, agent_runner=None):
        self.llm_client = llm_client
        self.agent_runner = agent_runner

    # ── command gate ──────────────────────────────────────────

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
            # SIGTERM first, wait 5s, then SIGKILL
            try:
                proc.terminate()
                await asyncio.sleep(0.1)
            except ProcessLookupError:
                pass
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            return GateResult(
                passed=False,
                detail="Command timed out",
                type="command",
                metadata={"timeout": handler.timeout},
            )

        stdout_str = stdout.decode() if stdout else ""
        stderr_str = stderr.decode() if stderr else ""

        return GateResult(
            passed=proc.returncode == 0,
            detail=stderr_str if proc.returncode != 0 else stdout_str.strip(),
            type="command",
            metadata={
                "stdout": stdout_str.strip(),
                "stderr": stderr_str.strip(),
                "returncode": proc.returncode,
            },
        )

    # ── http gate ─────────────────────────────────────────────

    async def _run_http(self, handler: GateHandler, context: dict) -> GateResult:
        url = handler.url or ""
        if context:
            try:
                url = url.format(**context)
            except KeyError:
                pass

        method = (handler.metadata or {}).get("method", "GET") if hasattr(handler, "metadata") else "GET"
        body = (handler.metadata or {}).get("body") if hasattr(handler, "metadata") else None

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.request(
                    method=method,
                    url=url,
                    headers=handler.headers or {},
                    timeout=handler.timeout,
                    json=body,
                )

                # 2xx range = success
                status = resp.status_code
                passed = 200 <= status < 300
                metadata: dict = {"status_code": status}

                # Auto-parse response body for match_rate, passed, score
                try:
                    body_data = resp.json()
                    for key in ("match_rate", "passed", "score"):
                        if key in body_data:
                            metadata[key] = body_data[key]
                except Exception:
                    pass

                return GateResult(
                    passed=passed,
                    detail=f"HTTP {status}",
                    type="http",
                    metadata=metadata,
                )
        except Exception as e:
            return GateResult(
                passed=False,
                detail=str(e),
                type="http",
                metadata={"error": str(e)},
            )

    # ── prompt gate ───────────────────────────────────────────

    async def _run_prompt(self, handler: GateHandler, context: dict) -> GateResult:
        if not self.llm_client:
            return GateResult(
                passed=False,
                detail="No LLM client configured",
                type="prompt",
            )

        prompt_text = handler.prompt or ""
        if context:
            try:
                prompt_text = prompt_text.format(**context)
            except KeyError:
                pass

        retries = max(handler.retries, 1)
        max_parse_retries = 2
        results = []

        for i in range(retries):
            parse_attempts = 0
            while parse_attempts <= max_parse_retries:
                try:
                    response = await self.llm_client.evaluate(prompt_text, handler.model or "haiku")
                    results.append(response)
                    break
                except (json.JSONDecodeError, ValueError):
                    parse_attempts += 1
                    if parse_attempts > max_parse_retries:
                        return GateResult(
                            passed=False,
                            detail="JSON parse failure after retries",
                            type="prompt",
                            metadata={"parse_retries_exhausted": True},
                        )

        if not results:
            return GateResult(
                passed=False,
                detail="No valid results",
                type="prompt",
            )

        passed_count = sum(1 for r in results if r.get("decision") == "yes")
        avg_confidence = sum(r.get("confidence", 0.5) for r in results) / len(results)

        if avg_confidence < handler.confidence_threshold:
            return GateResult(
                passed=False,
                detail="Low confidence → review escalation",
                type="prompt",
                confidence=avg_confidence,
                metadata={"status": "escalated"},
            )

        passed = passed_count > len(results) / 2
        return GateResult(
            passed=passed,
            detail=f"Vote: {passed_count}/{len(results)}",
            type="prompt",
            confidence=avg_confidence,
        )

    # ── agent gate ────────────────────────────────────────────

    async def _run_agent(self, handler: GateHandler, context: dict) -> GateResult:
        if not self.agent_runner:
            return GateResult(
                passed=False,
                detail="No agent runner configured",
                type="agent",
            )

        prompt_text = handler.agent_prompt or ""
        if context:
            try:
                prompt_text = prompt_text.format(**context)
            except KeyError:
                pass

        # Bash disabled by default — exclude from tools
        default_tools = ["Read", "Grep", "Glob", "Edit", "Write"]
        result = await self.agent_runner.run(
            prompt=prompt_text,
            tools=default_tools,
            timeout=handler.timeout,
        )

        passed = result.get("verdict") == "pass"
        metadata = {
            "turns": result.get("turns", 0),
            "tools_used": result.get("tools_used", []),
            "execution_log": result.get("execution_log", []),
        }

        detail = result.get("analysis", "")
        if result.get("max_turns_exceeded"):
            metadata["max_turns_exceeded"] = True
            metadata["warning"] = "Max turns exceeded — partial result"
            detail = detail or "Max turns exceeded — partial result"

        return GateResult(
            passed=passed,
            detail=detail,
            type="agent",
            confidence=result.get("confidence", 0.5),
            metadata=metadata,
        )

    # ── review gate ───────────────────────────────────────────

    async def _run_review(self, handler: GateHandler, context: dict) -> GateResult:
        action = context.get("review_action", "pending")

        if action == "approve":
            return GateResult(
                passed=True,
                detail="Approved by reviewer",
                type="review",
                metadata={
                    "status": "approved",
                    "reviewed_by": context.get("reviewer", ""),
                },
            )

        if action == "reject":
            return GateResult(
                passed=False,
                detail="Rejected by reviewer",
                type="review",
                metadata={
                    "status": "rejected",
                    "reviewed_by": context.get("reviewer", ""),
                    "reject_reason": context.get("reject_reason", ""),
                },
            )

        if action == "timeout":
            on_fail = handler.on_fail
            if on_fail == "auto_approve":
                return GateResult(
                    passed=True,
                    detail="Auto-approved on timeout",
                    type="review",
                    metadata={"status": "auto_approved"},
                )
            # Default: escalate
            return GateResult(
                passed=False,
                detail="Review timed out — escalated",
                type="review",
                metadata={"status": "escalated"},
            )

        if action == "vote":
            reviews = context.get("reviews", [])
            approve_count = sum(1 for r in reviews if r.get("action") == "approve")
            total = len(reviews)
            passed = approve_count > total / 2
            reviewers = [r.get("reviewer", "") for r in reviews]
            return GateResult(
                passed=passed,
                detail=f"Review vote: {approve_count}/{total} approved",
                type="review",
                metadata={
                    "status": "approved" if passed else "rejected",
                    "reviewers": reviewers,
                    "approve_count": approve_count,
                    "total": total,
                },
            )

        # Default: pending/waiting state
        return GateResult(
            passed=False,
            detail="Waiting for review",
            type="review",
            metadata={"status": "waiting"},
        )
