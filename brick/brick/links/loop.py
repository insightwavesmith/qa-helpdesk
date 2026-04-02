"""LoopLink — retry block if condition not met."""

from __future__ import annotations

from brick.links.base import LinkHandler
from brick.models.events import BlockStatus
from brick.models.link import LinkDefinition, LinkDecision
from brick.models.workflow import BlockInstance


class LoopLink(LinkHandler):
    """Loop back to block if condition not met (e.g. match_rate too low)."""

    def __init__(self, link_def: LinkDefinition):
        self.link_def = link_def

    def evaluate(self, source_block: BlockInstance, context: dict) -> LinkDecision:
        condition = self.link_def.condition
        should_loop = self._check_condition(condition, source_block, context)
        if should_loop and source_block.retry_count < self.link_def.max_retries:
            return LinkDecision(next_blocks=[self.link_def.to_block])
        return LinkDecision()

    def _check_condition(
        self, condition: dict, source_block: BlockInstance, context: dict
    ) -> bool:
        if "match_rate_below" in condition:
            actual = source_block.metrics.get("match_rate", 0)
            return actual < condition["match_rate_below"]
        if "status" in condition:
            return source_block.status.value == condition["status"]
        return False
