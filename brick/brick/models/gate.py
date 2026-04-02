"""Gate result model for Brick Engine."""

from dataclasses import dataclass, field


@dataclass
class GateResult:
    passed: bool
    detail: str = ""
    type: str = ""  # command|http|prompt|agent
    confidence: float = 1.0
    metadata: dict = field(default_factory=dict)
