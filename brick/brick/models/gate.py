"""Gate result model for Brick Engine."""

from __future__ import annotations


from dataclasses import dataclass, field


@dataclass
class GateResult:
    passed: bool
    detail: str = ""
    type: str = ""  # command|http|prompt|agent
    confidence: float = 1.0
    metadata: dict = field(default_factory=dict)
    metrics: dict = field(default_factory=dict)
