"""be_16~be_19: BlockMonitor 모듈 분리 TDD."""

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch


def test_be16_block_monitor_importable():
    """be_16: from brick.engine.block_monitor import BlockMonitor 성공."""
    from brick.engine.block_monitor import BlockMonitor
    assert BlockMonitor is not None


def test_be17_block_monitor_has_constants():
    """be_17: BlockMonitor에 POLL_INTERVAL, STALE_THRESHOLD, STALE_HARD_TIMEOUT 상수."""
    from brick.engine.block_monitor import BlockMonitor
    assert BlockMonitor.POLL_INTERVAL == 10
    assert BlockMonitor.STALE_THRESHOLD == 300
    assert BlockMonitor.STALE_HARD_TIMEOUT == 600


def test_be18_block_monitor_constructor():
    """be_18: BlockMonitor 생성자가 checkpoint, event_bus, _checkpoint_lock 받음."""
    from brick.engine.block_monitor import BlockMonitor
    cp = MagicMock()
    eb = MagicMock()
    lock = asyncio.Lock()
    monitor = BlockMonitor(checkpoint=cp, event_bus=eb, _checkpoint_lock=lock)
    assert monitor.checkpoint is cp
    assert monitor.event_bus is eb
    assert monitor._checkpoint_lock is lock


def test_be19_block_monitor_has_monitor_method():
    """be_19: BlockMonitor에 async monitor() 메서드 존재."""
    from brick.engine.block_monitor import BlockMonitor
    assert asyncio.iscoroutinefunction(BlockMonitor.monitor)
