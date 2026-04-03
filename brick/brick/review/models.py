"""Review block data models."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class LessonCategory(Enum):
    DESIGN_GAP = "design_gap"
    IMPLEMENTATION_BUG = "implementation_bug"
    PROCESS_BOTTLENECK = "process_bottleneck"
    TOOL_MISUSE = "tool_misuse"
    COMMUNICATION_FAIL = "communication_fail"
    GATE_WEAKNESS = "gate_weakness"
    POSITIVE_PATTERN = "positive_pattern"


@dataclass
class Lesson:
    id: str
    category: LessonCategory
    severity: str  # critical | major | minor
    description: str
    evidence: str
    suggestion: str


@dataclass
class TimeAnalysis:
    total_minutes: float = 0
    longest_block_id: str = ""
    longest_block_minutes: float = 0
    bottleneck: str = ""
    idle_time_minutes: float = 0


@dataclass
class PlanVsActual:
    planned_blocks: int = 0
    actual_blocks: int = 0
    loop_count: int = 0
    rejected_count: int = 0


@dataclass
class GateSummary:
    total: int = 0
    passed_first_try: int = 0
    failed_then_passed: int = 0
    failed_permanently: int = 0


@dataclass
class ReviewData:
    feature: str = ""
    execution_id: str = ""
    cycle_duration_minutes: float = 0
    plan_vs_actual: PlanVsActual = field(default_factory=PlanVsActual)
    gate_results: GateSummary = field(default_factory=GateSummary)
    time_analysis: TimeAnalysis = field(default_factory=TimeAnalysis)
    lessons: list[Lesson] = field(default_factory=list)


class ProposalType(Enum):
    MEMORY_UPDATE = "memory_update"
    HOOK_IMPROVEMENT = "hook_improvement"
    GATE_ADDITION = "gate_addition"
    PRESET_ADJUSTMENT = "preset_adjustment"
    CLAUDEMD_UPDATE = "claudemd_update"
    TDD_ADDITION = "tdd_addition"
    POSTMORTEM_ENTRY = "postmortem_entry"


@dataclass
class Proposal:
    id: str
    lesson_id: str
    type: ProposalType
    target: str
    description: str
    diff_preview: str = ""
    auto_applicable: bool = False
    risk: str = "low"  # low | medium | high
    requires_approval: bool = True
