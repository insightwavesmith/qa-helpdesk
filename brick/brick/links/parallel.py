"""ParallelLink — fan-out to multiple blocks."""

from __future__ import annotations

from brick.links.base import LinkHandler
from brick.models.events import BlockStatus
from brick.models.link import LinkDefinition, LinkDecision
from brick.models.workflow import BlockInstance


class ParallelLink(LinkHandler):
    """Parallel fan-out transition."""

    def __init__(self, link_def: LinkDefinition):
        self.link_def = link_def

    def evaluate(self, source_block: BlockInstance, context: dict) -> LinkDecision:
        if source_block.status == BlockStatus.COMPLETED:
            targets = [self.link_def.to_block]
            return LinkDecision(
                next_blocks=targets,
                parallel=True,
                merge_strategy=self.link_def.merge_strategy,
            )
        return LinkDecision()
