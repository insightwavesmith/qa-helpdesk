"""be_22~be_23: CommandDispatcher 모듈 분리 TDD."""

import asyncio
from unittest.mock import MagicMock


def test_be22_command_dispatcher_importable():
    """be_22: from brick.engine.command_dispatcher import CommandDispatcher."""
    from brick.engine.command_dispatcher import CommandDispatcher
    assert CommandDispatcher is not None


def test_be23_command_dispatcher_unknown_command_error():
    """be_23: 알 수 없는 커맨드에 UnknownCommandError 발생."""
    from brick.engine.command_dispatcher import CommandDispatcher, UnknownCommandError

    cp = MagicMock()
    ap = {}
    eb = MagicMock()
    sm = MagicMock()
    bm = MagicMock()
    cm = MagicMock()
    lock = asyncio.Lock()

    dispatcher = CommandDispatcher(
        checkpoint=cp,
        adapter_pool=ap,
        event_bus=eb,
        state_machine=sm,
        block_monitor=bm,
        compete_manager=cm,
        _checkpoint_lock=lock,
    )

    instance = MagicMock()

    class FakeCommand:
        pass

    import pytest
    with pytest.raises(UnknownCommandError):
        asyncio.run(dispatcher.dispatch(instance, FakeCommand()))
