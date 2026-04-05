"""P2-A06 EventBus 핸들러 예외 격리 테스트."""
from __future__ import annotations

from brick.engine.event_bus import EventBus
from brick.models.events import Event


class TestEventBusExceptionIsolation:
    """핸들러 예외가 다른 핸들러 실행을 방해하지 않는지 검증."""

    def test_p2a06_handler_exception_isolated(self):
        """핸들러1 예외 → 핸들러2도 정상 호출."""
        bus = EventBus()
        results = []

        def bad_handler(e: Event):
            raise RuntimeError("boom")

        def good_handler(e: Event):
            results.append(e.type)

        bus.subscribe("test.event", bad_handler)
        bus.subscribe("test.event", good_handler)

        bus.publish(Event(type="test.event", data={}))

        assert results == ["test.event"], "good_handler가 호출되어야 함"

    def test_p2a06_wildcard_exception_isolated(self):
        """와일드카드 핸들러 예외 → 다른 와일드카드 핸들러 정상."""
        bus = EventBus()
        results = []

        def bad_wildcard(e: Event):
            raise ValueError("fail")

        def good_wildcard(e: Event):
            results.append("wildcard:" + e.type)

        bus.subscribe("*", bad_wildcard)
        bus.subscribe("*", good_wildcard)

        bus.publish(Event(type="some.event", data={}))

        assert results == ["wildcard:some.event"]

    def test_p2a06_mixed_exception_all_run(self):
        """타입 핸들러 예외 + 와일드카드 예외 → 정상 핸들러 모두 실행."""
        bus = EventBus()
        results = []

        bus.subscribe("x", lambda e: (_ for _ in ()).throw(RuntimeError("type boom")))
        bus.subscribe("x", lambda e: results.append("type_ok"))
        bus.subscribe("*", lambda e: (_ for _ in ()).throw(RuntimeError("wild boom")))
        bus.subscribe("*", lambda e: results.append("wild_ok"))

        bus.publish(Event(type="x", data={}))

        assert "type_ok" in results
        assert "wild_ok" in results

    def test_p2a06_no_exception_unchanged(self):
        """예외 없을 때 기존 동작 동일."""
        bus = EventBus()
        results = []

        bus.subscribe("ok", lambda e: results.append("a"))
        bus.subscribe("ok", lambda e: results.append("b"))
        bus.subscribe("*", lambda e: results.append("w"))

        bus.publish(Event(type="ok", data={}))

        assert results == ["a", "b", "w"]
