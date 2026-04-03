"""ReviewCollector — PDCA 사이클의 교훈을 구조화하여 수집."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from brick.review.models import (
    ReviewData,
    Lesson,
    LessonCategory,
    TimeAnalysis,
    PlanVsActual,
    GateSummary,
)


class ReviewCollector:
    """PDCA 사이클의 교훈을 구조화하여 수집."""

    def __init__(self, llm_client=None, workspace_root: str = "."):
        self.llm = llm_client
        self.root = Path(workspace_root)

    async def collect(self, execution_id: str, feature: str) -> ReviewData:
        """1개 PDCA 사이클의 데이터를 수집·분석."""
        artifacts = self._gather_artifacts(feature)
        gate_logs = self._gather_gate_logs(execution_id)
        events = self._gather_events(execution_id)
        git_log = await self._gather_git_log(feature)

        lessons = await self._extract_lessons(artifacts, gate_logs, events, git_log)
        time_analysis = self._analyze_time(events)
        plan_vs_actual = self._compare_plan_actual(events)
        gate_summary = self._summarize_gates(gate_logs)

        return ReviewData(
            feature=feature,
            execution_id=execution_id,
            cycle_duration_minutes=time_analysis.total_minutes,
            plan_vs_actual=plan_vs_actual,
            gate_results=gate_summary,
            time_analysis=time_analysis,
            lessons=lessons,
        )

    def _gather_artifacts(self, feature: str) -> dict[str, str]:
        """Plan, Design, Gap, Report 문서 수집."""
        paths = {
            "plan": self.root / f"docs/01-plan/features/{feature}.plan.md",
            "design": self.root / f"docs/02-design/features/{feature}.design.md",
            "gap": self.root / f"docs/03-analysis/features/{feature}.gap.md",
            "report": self.root / f"docs/04-report/features/{feature}.report.md",
        }
        result = {}
        for key, path in paths.items():
            if path.exists():
                result[key] = path.read_text()
        return result

    def _gather_gate_logs(self, execution_id: str) -> list[dict]:
        """Gate 결과 로그 수집."""
        gate_path = self.root / f".bkit/state/gate-results/{execution_id}.json"
        if gate_path.exists():
            return json.loads(gate_path.read_text())
        return []

    def _gather_events(self, execution_id: str) -> list[dict]:
        """블록 이벤트 수집."""
        event_path = self.root / f".bkit/state/events/{execution_id}.jsonl"
        if not event_path.exists():
            return []
        events = []
        for line in event_path.read_text().strip().split("\n"):
            if line:
                events.append(json.loads(line))
        return events

    async def _gather_git_log(self, feature: str) -> str:
        """Git 커밋 이력 수집."""
        try:
            proc = await asyncio.create_subprocess_shell(
                f'git log --oneline --grep="{feature}" -20',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            return stdout.decode()
        except Exception:
            return ""

    async def _extract_lessons(
        self, artifacts: dict, gate_logs: list, events: list, git_log: str
    ) -> list[Lesson]:
        """LLM을 사용하여 교훈 추출."""
        if not self.llm:
            return []

        prompt = (
            "다음 PDCA 사이클 데이터를 분석하여 교훈을 추출하라.\n\n"
            f"[산출물]\n{json.dumps(list(artifacts.keys()))}\n\n"
            f"[Gate 로그]\n{json.dumps(gate_logs[:10])}\n\n"
            f"[블록 이벤트 수]\n{len(events)}건\n\n"
            f"[Git 이력]\n{git_log[:500]}\n\n"
            "각 교훈: category, severity, description, evidence, suggestion.\n"
            "JSON 배열로 반환."
        )
        try:
            raw = await self.llm.evaluate(prompt, model="sonnet")
            lessons = []
            for i, item in enumerate(raw if isinstance(raw, list) else []):
                lessons.append(Lesson(
                    id=f"LS-{i+1:03d}",
                    category=LessonCategory(item.get("category", "design_gap")),
                    severity=item.get("severity", "minor"),
                    description=item.get("description", ""),
                    evidence=item.get("evidence", ""),
                    suggestion=item.get("suggestion", ""),
                ))
            return lessons
        except Exception:
            return []

    def _analyze_time(self, events: list[dict]) -> TimeAnalysis:
        """블록별 소요 시간 분석."""
        if not events:
            return TimeAnalysis()
        block_times: dict[str, float] = {}
        for e in events:
            bid = e.get("block_id", "")
            duration = e.get("duration_seconds", 0)
            if bid:
                block_times[bid] = block_times.get(bid, 0) + duration
        if not block_times:
            return TimeAnalysis()
        longest_id = max(block_times, key=block_times.get)
        total = sum(block_times.values())
        return TimeAnalysis(
            total_minutes=total / 60,
            longest_block_id=longest_id,
            longest_block_minutes=block_times[longest_id] / 60,
            bottleneck=longest_id,
        )

    def _compare_plan_actual(self, events: list[dict]) -> PlanVsActual:
        """계획 대비 실제 블록 수 비교."""
        block_ids = set()
        loop_count = 0
        for e in events:
            block_ids.add(e.get("block_id", ""))
            if e.get("type") == "block.loop":
                loop_count += 1
        return PlanVsActual(
            planned_blocks=len(block_ids),
            actual_blocks=len(events),
            loop_count=loop_count,
        )

    def _summarize_gates(self, gate_logs: list[dict]) -> GateSummary:
        """Gate 결과 요약."""
        total = len(gate_logs)
        passed_first = sum(1 for g in gate_logs if g.get("passed") and g.get("attempt", 1) == 1)
        failed_then_passed = sum(1 for g in gate_logs if g.get("passed") and g.get("attempt", 1) > 1)
        failed_perm = sum(1 for g in gate_logs if not g.get("passed"))
        return GateSummary(
            total=total,
            passed_first_try=passed_first,
            failed_then_passed=failed_then_passed,
            failed_permanently=failed_perm,
        )
