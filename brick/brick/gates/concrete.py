"""ConcreteGateExecutor — implements GateExecutor's abstract _run_* methods."""

from __future__ import annotations

import asyncio
import json
import shlex
import os
import signal
from pathlib import Path

import httpx

from brick.gates.base import GateExecutor
from brick.gates.command_allowlist import validate_command
from brick.gates.prompt_eval import PromptEvalGate
from brick.gates.agent_eval import AgentEvalGate
from brick.models.block import GateHandler
from brick.models.gate import GateResult


class ConcreteGateExecutor(GateExecutor):
    """Full gate executor with command/http/prompt/agent/review implementations."""

    def __init__(self, llm_client=None, agent_runner=None):
        self.llm_client = llm_client
        self.agent_runner = agent_runner
        self._event_bus = None  # 외부에서 주입 가능 (gate.pending 이벤트 발행용)
        super().__init__()  # → _register_builtins() 호출

    def _register_builtins(self) -> None:
        self.register_gate("command", self._run_command)
        self.register_gate("http", self._run_http)
        self.register_gate("prompt", self._run_prompt)
        self.register_gate("agent", self._run_agent)
        self.register_gate("review", self._run_review)
        self.register_gate("metric", self._run_metric)
        self.register_gate("approval", self._run_approval)
        self.register_gate("artifact", self._run_artifact)

    # ── command gate ──────────────────────────────────────────

    async def _run_command(self, handler: GateHandler, context: dict) -> GateResult:
        cmd_template = handler.command or ""

        # 1. context 값 이스케이프 (Shell Injection 방어)
        safe_context = {}
        if context:
            for key, value in context.items():
                safe_context[key] = shlex.quote(str(value))

        try:
            cmd_str = cmd_template.format(**safe_context)
        except KeyError:
            return GateResult(passed=False, detail="명령 템플릿 키 누락", type="command")

        # 2. 명령 파싱 + allowlist 검증
        try:
            cmd_parts = shlex.split(cmd_str)
        except ValueError as e:
            return GateResult(passed=False, detail=f"명령 파싱 실패: {e}", type="command")

        allowed, reason = validate_command(cmd_parts)
        if not allowed:
            return GateResult(passed=False, detail=f"명령 거부: {reason}", type="command")

        # 3. subprocess_exec로 실행 (shell=False)
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd_parts,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=handler.timeout or 60,
            )
        except asyncio.TimeoutError:
            proc.kill()
            return GateResult(
                passed=False,
                detail="명령 실행 타임아웃",
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
                if method.upper() == "GET":
                    resp = await client.get(
                        url,
                        headers=handler.headers or {},
                        timeout=handler.timeout,
                    )
                else:
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

    # ── metric gate ───────────────────────────────────────────

    async def _run_metric(self, handler: GateHandler, context: dict) -> GateResult:
        metric_name = handler.metric or ""
        threshold = handler.threshold
        if threshold is None:
            return GateResult(
                passed=False,
                detail=f"No threshold configured for metric '{metric_name}'",
                type="metric",
            )

        actual = context.get(metric_name)
        if actual is None:
            return GateResult(
                passed=False,
                detail=f"Metric '{metric_name}' not found in context",
                type="metric",
                metadata={"metric": metric_name, "threshold": threshold},
            )

        try:
            actual_val = float(actual)
        except (TypeError, ValueError):
            return GateResult(
                passed=False,
                detail=f"Metric '{metric_name}' is not numeric: {actual}",
                type="metric",
                metadata={"metric": metric_name, "threshold": threshold, "actual": actual},
            )

        passed = actual_val >= threshold
        return GateResult(
            passed=passed,
            detail=f"{metric_name}={actual_val} vs threshold={threshold}",
            type="metric",
            metadata={"metric": metric_name, "threshold": threshold, "actual": actual_val},
            metrics={metric_name: actual_val},
        )

    # ── approval gate ─────────────────────────────────────────

    async def _run_approval(self, handler: GateHandler, context: dict) -> GateResult:
        """승인 Gate — 사람의 명시적 승인을 기다림."""
        approval_config = handler.approval
        if not approval_config:
            return GateResult(
                passed=False,
                detail="ApprovalConfig not provided",
                type="approval",
            )

        action = context.get("approval_action", "pending")

        if action == "approve":
            return GateResult(
                passed=True,
                detail=f"CEO 승인: {approval_config.approver}",
                type="approval",
                metadata={
                    "status": "approved",
                    "approver": approval_config.approver,
                    "approved_at": context.get("timestamp", ""),
                },
            )

        if action == "reject":
            return GateResult(
                passed=False,
                detail=f"CEO 반려: {context.get('reject_reason', '')}",
                type="approval",
                metadata={
                    "status": "rejected",
                    "approver": approval_config.approver,
                    "reject_reason": context.get("reject_reason", ""),
                },
            )

        if action == "timeout":
            on_timeout = approval_config.on_timeout
            if on_timeout == "auto_approve":
                return GateResult(
                    passed=True,
                    detail="타임아웃 자동 승인",
                    type="approval",
                    metadata={"status": "auto_approved"},
                )
            if on_timeout == "reject":
                return GateResult(
                    passed=False,
                    detail="타임아웃 자동 반려",
                    type="approval",
                    metadata={"status": "timeout_rejected"},
                )
            return GateResult(
                passed=False,
                detail="타임아웃 — 긴급 에스컬레이션",
                type="approval",
                metadata={"status": "escalated"},
            )

        # 대기 중 — gate.pending 이벤트 발행
        if self._event_bus is not None:
            from brick.models.events import Event
            self._event_bus.publish(Event(type="gate.pending", data={
                "block_id": context.get("block_id", ""),
                "workflow_id": context.get("workflow_id", ""),
                "artifacts": context.get("artifacts", []),
                "approver": approval_config.approver,
            }))

        return GateResult(
            passed=False,
            detail="CEO 승인 대기 중",
            type="approval",
            metadata={
                "status": "waiting",
                "approver": approval_config.approver,
                "channel": approval_config.channel,
                "timeout_seconds": approval_config.timeout_seconds,
            },
        )

    # ── artifact gate ─────────────────────────────────────────

    async def _run_artifact(self, handler: GateHandler, context: dict) -> GateResult:
        """산출물 파일 존재 여부 검증 Gate."""
        artifacts = context.get("artifacts", [])
        if not artifacts:
            return GateResult(passed=False, detail="산출물 없음", type="artifact")

        missing = []
        for path_str in artifacts:
            # P1: path traversal 방어 — '..' 또는 절대경로 거부
            if '..' in path_str or os.path.isabs(path_str):
                return GateResult(
                    passed=False,
                    detail=f"경로 보안 위반: {path_str}",
                    type="artifact",
                    metadata={"blocked_path": path_str},
                )
            p = Path(path_str)
            if not p.exists():
                missing.append(path_str)

        if missing:
            return GateResult(
                passed=False,
                detail=f"산출물 파일 누락: {', '.join(missing)}",
                type="artifact",
                metadata={"missing": missing},
            )
        return GateResult(passed=True, detail=f"산출물 {len(artifacts)}건 확인", type="artifact")
