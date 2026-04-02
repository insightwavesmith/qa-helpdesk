"""BK-08~10: EventBus tests."""

from __future__ import annotations

import pytest

from brick.engine.event_bus import EventBus
from brick.models.events import Event


class TestEventBus:
    """BK-08~10: EventBus publish/subscribe and replay."""

    def test_bk08_publish_calls_subscriber(self):
        """BK-08: publish → registered handler is called."""
        bus = EventBus()
        received = []

        def handler(event: Event):
            received.append(event)

        bus.subscribe("block.completed", handler)
        event = Event(type="block.completed", data={"block_id": "plan"})
        bus.publish(event)

        assert len(received) == 1
        assert received[0].type == "block.completed"

    def test_bk09_multiple_subscribers_all_called(self):
        """BK-09: 3 subscribers → all 3 called."""
        bus = EventBus()
        results = {"a": [], "b": [], "c": []}

        bus.subscribe("test.event", lambda e: results["a"].append(e))
        bus.subscribe("test.event", lambda e: results["b"].append(e))
        bus.subscribe("test.event", lambda e: results["c"].append(e))

        bus.publish(Event(type="test.event"))

        assert len(results["a"]) == 1
        assert len(results["b"]) == 1
        assert len(results["c"]) == 1

    def test_bk10_replay_in_order(self):
        """BK-10: replay — events replayed in order."""
        bus = EventBus()
        received = []
        bus.subscribe("*", lambda e: received.append(e.type))

        events = [
            Event(type="workflow.started"),
            Event(type="block.started"),
            Event(type="block.completed"),
        ]
        bus.replay(events)

        assert received == ["workflow.started", "block.started", "block.completed"]

    def test_wildcard_subscriber(self):
        """Wildcard '*' subscriber receives all events."""
        bus = EventBus()
        received = []
        bus.subscribe("*", lambda e: received.append(e.type))

        bus.publish(Event(type="block.started"))
        bus.publish(Event(type="workflow.completed"))

        assert len(received) == 2

    def test_unsubscribe(self):
        """Unsubscribed handler no longer receives events."""
        bus = EventBus()
        received = []

        def handler(event: Event):
            received.append(event)

        bus.subscribe("test", handler)
        bus.unsubscribe("test", handler)
        bus.publish(Event(type="test"))

        assert len(received) == 0

    def test_external_callback_subscription(self):
        """External callable (not a method) can subscribe."""
        bus = EventBus()
        external_log = []

        class ExternalSystem:
            def on_event(self, event: Event):
                external_log.append(event.type)

        ext = ExternalSystem()
        bus.subscribe("block.completed", ext.on_event)
        bus.publish(Event(type="block.completed"))

        assert external_log == ["block.completed"]
