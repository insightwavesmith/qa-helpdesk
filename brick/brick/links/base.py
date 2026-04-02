"""LinkHandler — abstract base class for link evaluation."""

from __future__ import annotations

from abc import ABC, abstractmethod

from brick.models.link import LinkDecision
from brick.models.workflow import BlockInstance


class LinkHandler(ABC):
    """Base class for link handlers that determine block transitions."""

    @abstractmethod
    def evaluate(self, source_block: BlockInstance, context: dict) -> LinkDecision:
        """Evaluate link and return decision on next blocks."""
        ...
