"""BranchLink — conditional branching based on context."""

from __future__ import annotations

from brick.links.base import LinkHandler
from brick.models.link import LinkDefinition, LinkDecision
from brick.models.workflow import BlockInstance


class BranchLink(LinkHandler):
    """Branch to different blocks based on context conditions."""

    def __init__(self, link_def: LinkDefinition):
        self.link_def = link_def

    def evaluate(self, source_block: BlockInstance, context: dict) -> LinkDecision:
        for branch in self.link_def.branches:
            condition_key = branch.get("condition_key", "")
            condition_value = branch.get("condition_value", "")
            target = branch.get("target", "")
            actual = context.get(condition_key, "")
            if str(actual) == str(condition_value):
                return LinkDecision(next_blocks=[target])
        # Default branch
        if self.link_def.to_block:
            return LinkDecision(next_blocks=[self.link_def.to_block])
        return LinkDecision()
