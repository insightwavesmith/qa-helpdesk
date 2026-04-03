"""LearningHarness — 교훈을 실행 가능한 개선 제안으로 변환."""

from __future__ import annotations

from brick.review.models import (
    ReviewData,
    Lesson,
    Proposal,
    ProposalType,
)


class LearningHarness:
    """교훈을 실행 가능한 개선 제안으로 변환."""

    CATEGORY_TO_PROPOSALS: dict[str, list[str]] = {
        "design_gap":          ["tdd_addition", "gate_addition"],
        "implementation_bug":  ["tdd_addition", "memory_update"],
        "process_bottleneck":  ["preset_adjustment", "hook_improvement"],
        "tool_misuse":         ["claudemd_update", "memory_update"],
        "communication_fail":  ["hook_improvement", "memory_update"],
        "gate_weakness":       ["gate_addition", "tdd_addition"],
        "positive_pattern":    ["memory_update"],
    }

    AUTO_APPLICABLE: dict[str, bool] = {
        "memory_update": True,
        "postmortem_entry": True,
        "tdd_addition": False,
        "hook_improvement": False,
        "gate_addition": False,
        "preset_adjustment": False,
        "claudemd_update": False,
    }

    RISK_MAP: dict[str, str] = {
        "memory_update": "low",
        "postmortem_entry": "low",
        "tdd_addition": "medium",
        "hook_improvement": "medium",
        "gate_addition": "medium",
        "preset_adjustment": "high",
        "claudemd_update": "high",
    }

    async def propose(self, review_data: ReviewData) -> list[Proposal]:
        """교훈에서 개선 제안 생성."""
        proposals: list[Proposal] = []
        counter = 1
        for lesson in review_data.lessons:
            proposal_types = self.CATEGORY_TO_PROPOSALS.get(lesson.category.value, [])
            for ptype_str in proposal_types:
                ptype = ProposalType(ptype_str)
                auto = self.AUTO_APPLICABLE.get(ptype_str, False)
                risk = self.RISK_MAP.get(ptype_str, "low")
                proposals.append(Proposal(
                    id=f"PR-{counter:03d}",
                    lesson_id=lesson.id,
                    type=ptype,
                    target=self._get_target(ptype),
                    description=f"{lesson.suggestion} ({ptype_str})",
                    auto_applicable=auto,
                    risk=risk,
                    requires_approval=not auto,
                ))
                counter += 1
        return proposals

    def _get_target(self, ptype: ProposalType) -> str:
        """제안 타입별 대상 경로."""
        targets = {
            ProposalType.MEMORY_UPDATE: "~/.claude/projects/.../memory/",
            ProposalType.HOOK_IMPROVEMENT: ".bkit/hooks/",
            ProposalType.GATE_ADDITION: "brick/brick/presets/",
            ProposalType.PRESET_ADJUSTMENT: "brick/brick/presets/",
            ProposalType.CLAUDEMD_UPDATE: "CLAUDE.md",
            ProposalType.TDD_ADDITION: "__tests__/",
            ProposalType.POSTMORTEM_ENTRY: "docs/postmortem/",
        }
        return targets.get(ptype, "")
