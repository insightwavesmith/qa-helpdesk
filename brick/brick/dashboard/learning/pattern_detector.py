"""PatternDetector — detects repeated failure patterns from event history."""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field


@dataclass
class FailurePattern:
    event_type: str
    count: int
    window: str
    block_id: str | None = None
    team_id: str | None = None
    common_cause: str = ""
    event_ids: list[str] = field(default_factory=list)


@dataclass
class LearningProposal:
    id: str
    axis: str  # block | team | link
    title: str
    description: str
    pattern: FailurePattern
    confidence: float
    target_file: str
    diff: str
    status: str = "pending"  # pending | approved | rejected | hold | modified
    reviewed_by: str | None = None
    reviewed_at: str | None = None
    reject_reason: str | None = None
    modified_diff: str | None = None
    created_at: str = ""
    applied_at: str | None = None


class PatternDetector:
    """Detects repeated failure patterns from event list."""

    def __init__(self, threshold: int = 3, window_days: int = 7, llm_client=None):
        self.threshold = threshold
        self.window_days = window_days
        self.llm_client = llm_client
        self._proposal_counter = 0

    def detect(self, events: list[dict]) -> list[FailurePattern]:
        """Scan events for repeated (event_type, block_id) patterns."""
        cutoff = time.time() - (self.window_days * 86400)

        recent = [e for e in events if e.get("timestamp", 0) >= cutoff]

        groups: dict[tuple, list] = defaultdict(list)
        for e in recent:
            key = (e.get("type", ""), e.get("data", {}).get("block_id", ""))
            groups[key].append(e)

        patterns = []
        for (etype, block_id), group in groups.items():
            if len(group) >= self.threshold:
                patterns.append(FailurePattern(
                    event_type=etype,
                    count=len(group),
                    window=f"{self.window_days}d",
                    block_id=block_id or None,
                    event_ids=[e.get("id", "") for e in group],
                ))
        return patterns

    async def propose(self, pattern: FailurePattern) -> LearningProposal:
        """Pattern → LLM analysis → LearningProposal."""
        self._proposal_counter += 1

        if self.llm_client:
            analysis = await self.llm_client.analyze_pattern(pattern)
            confidence = analysis.get("confidence", 0.5)
            status = "hold" if confidence < 0.7 else "pending"
            return LearningProposal(
                id=f"LH-{self._proposal_counter:03d}",
                axis=analysis.get("axis", "block"),
                title=analysis.get("title", ""),
                description=analysis.get("description", ""),
                pattern=pattern,
                confidence=confidence,
                target_file=analysis.get("target_file", ""),
                diff=analysis.get("diff", ""),
                status=status,
                created_at=str(time.time()),
            )

        return LearningProposal(
            id=f"LH-{self._proposal_counter:03d}",
            axis="block",
            title=f"Pattern: {pattern.event_type}",
            description=f"Detected {pattern.count}x in {pattern.window}",
            pattern=pattern,
            confidence=0.5,
            target_file="",
            diff="",
            status="pending",
            created_at=str(time.time()),
        )
