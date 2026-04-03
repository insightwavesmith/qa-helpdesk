"""Link models for Brick Engine."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class LinkDefinition:
    from_block: str
    to_block: str
    type: str = "sequential"  # sequential|parallel|compete|loop|cron|branch
    condition: str | dict = field(default_factory=dict)
    max_retries: int = 3
    merge_strategy: str = "all"  # all|any|n_of_m (for parallel)
    teams: list[str] = field(default_factory=list)  # for compete
    judge: dict = field(default_factory=dict)  # for compete
    schedule: str = ""  # for cron
    branches: list[dict] = field(default_factory=list)  # for branch
    on_fail: str | None = None


@dataclass
class LinkDecision:
    next_blocks: list[str] = field(default_factory=list)
    parallel: bool = False
    merge_strategy: str = "all"
