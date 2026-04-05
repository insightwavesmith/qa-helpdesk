"""Phase 1B TDD: 순환 의존성 제거 검증."""

from pathlib import Path


def test_be29_claude_local_no_engine_bridge_import():
    """be_29: claude_local.py에서 engine_bridge 임포트 없음."""
    content = Path("brick/adapters/claude_local.py").read_text()
    assert "engine_bridge" not in content, (
        "claude_local.py에 engine_bridge 임포트가 남아있음"
    )


def test_be30_claude_local_notify_publishes_event():
    """be_30: _notify_complete()가 EventBus 이벤트를 발행 (executor 직접 호출 아님)."""
    content = Path("brick/adapters/claude_local.py").read_text()
    # executor.complete_block 직접 호출이 없어야 함
    assert "executor.complete_block" not in content, (
        "executor.complete_block 직접 호출이 남아있음"
    )
    # event_bus 참조가 있어야 함
    assert "event_bus" in content or "EventBus" in content, (
        "EventBus 이벤트 발행 코드가 없음"
    )
