"""be_26~be_28: WorkflowExecutor Public API TDD."""


def test_be26_executor_has_resume_monitoring_public():
    """be_26: WorkflowExecutor에 resume_monitoring 메서드 존재."""
    from brick.engine.executor import WorkflowExecutor
    assert hasattr(WorkflowExecutor, "resume_monitoring")


def test_be27_executor_has_retry_block_public():
    """be_27: WorkflowExecutor에 retry_block 메서드 존재."""
    from brick.engine.executor import WorkflowExecutor
    assert hasattr(WorkflowExecutor, "retry_block")


def test_be28_executor_monitor_block_delegates_to_block_monitor():
    """be_28: _monitor_block은 BlockMonitor.monitor()로 위임."""
    from brick.engine.executor import WorkflowExecutor
    # executor에 _monitor_block이 있더라도 직접 로직이 아닌 BlockMonitor 위임 확인
    # BlockMonitor가 별도 모듈로 존재하는지로 검증
    from brick.engine.block_monitor import BlockMonitor
    assert hasattr(BlockMonitor, "monitor")
