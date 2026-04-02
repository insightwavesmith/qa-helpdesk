"""SequentialLink — A completes → B starts."""

from __future__ import annotations

from brick.links.base import LinkHandler
from brick.models.events import BlockStatus
from brick.models.link import LinkDefinition, LinkDecision
from brick.models.workflow import BlockInstance


class SequentialLink(LinkHandler):
    """Simple sequential transition."""

    def __init__(self, link_def: LinkDefinition):
        self.link_def = link_def

    def evaluate(self, source_block: BlockInstance, context: dict) -> LinkDecision:
        if source_block.status == BlockStatus.COMPLETED:
            return LinkDecision(next_blocks=[self.link_def.to_block])
        if source_block.status == BlockStatus.FAILED and self.link_def.on_fail:
            return LinkDecision(next_blocks=[self.link_def.on_fail])
        return LinkDecision()
