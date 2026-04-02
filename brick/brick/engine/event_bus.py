"""EventBus — callback-based event system with external subscription support."""

from __future__ import annotations

from typing import Callable

from brick.models.events import Event


class EventBus:
    """Publish-subscribe event bus. Supports wildcard '*' subscriptions."""

    def __init__(self) -> None:
        self._handlers: dict[str, list[Callable[[Event], None]]] = {}

    def subscribe(self, event_type: str, handler: Callable[[Event], None]) -> None:
        if event_type not in self._handlers:
            self._handlers[event_type] = []
        self._handlers[event_type].append(handler)

    def unsubscribe(self, event_type: str, handler: Callable[[Event], None]) -> None:
        if event_type in self._handlers:
            self._handlers[event_type] = [
                h for h in self._handlers[event_type] if h is not handler
            ]

    def publish(self, event: Event) -> None:
        # Call specific type handlers
        for handler in self._handlers.get(event.type, []):
            handler(event)
        # Call wildcard handlers
        if event.type != "*":
            for handler in self._handlers.get("*", []):
                handler(event)

    def replay(self, events: list[Event]) -> None:
        for event in events:
            self.publish(event)
