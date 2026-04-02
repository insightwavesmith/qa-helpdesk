"""CompeteLink — same block run by N teams, pick winner."""

from __future__ import annotations

from brick.links.base import LinkHandler
from brick.models.events import BlockStatus
from brick.models.link import LinkDefinition, LinkDecision
from brick.models.workflow import BlockInstance


class CompeteLink(LinkHandler):
    """Competition: same block executed by multiple teams."""

    def __init__(self, link_def: LinkDefinition):
        self.link_def = link_def

    def evaluate(self, source_block: BlockInstance, context: dict) -> LinkDecision:
        if source_block.status == BlockStatus.COMPLETED:
            return LinkDecision(
                next_blocks=[self.link_def.to_block],
                parallel=True,
            )
        return LinkDecision()
