"""CronLink — scheduled execution based on cron expression."""

from __future__ import annotations

from brick.links.base import LinkHandler
from brick.models.events import BlockStatus
from brick.models.link import LinkDefinition, LinkDecision
from brick.models.workflow import BlockInstance


class CronLink(LinkHandler):
    """Cron-scheduled block transition."""

    def __init__(self, link_def: LinkDefinition):
        self.link_def = link_def

    def evaluate(self, source_block: BlockInstance, context: dict) -> LinkDecision:
        if self.link_def.schedule and self.parse_cron(self.link_def.schedule):
            return LinkDecision(next_blocks=[self.link_def.to_block])
        return LinkDecision()

    @staticmethod
    def parse_cron(expression: str) -> bool:
        """Simple cron expression validation (5 fields)."""
        parts = expression.strip().split()
        return len(parts) == 5
