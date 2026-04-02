"""BK-28~30: Block model tests."""

from brick.models.block import Block, DoneCondition


class TestBlockModel:
    """BK-28: 최소 Block (what + done만) 유효."""

    def test_bk28_minimal_block(self):
        block = Block(id="plan", what="Create plan", done=DoneCondition(artifacts=["plan.md"]))
        assert block.id == "plan"
        assert block.what == "Create plan"
        assert block.done.artifacts == ["plan.md"]
        assert block.type == "Custom"  # default

    def test_bk28_block_with_empty_done(self):
        block = Block(id="x", what="Do something", done=DoneCondition())
        assert block.done.artifacts == []
        assert block.done.metrics == {}

    def test_bk29_block_types(self):
        """BK-29: Block 타입 레지스트리 9개."""
        valid_types = ["Plan", "Design", "Do", "Check", "Act", "Research", "Review", "Report", "Cron"]
        for t in valid_types:
            block = Block(id=f"b-{t.lower()}", what=f"{t} block", done=DoneCondition(), type=t)
            assert block.type == t

    def test_bk30_custom_block_type(self):
        """BK-30: 커스텀 Block 타입 등록."""
        block = Block(id="custom-1", what="Custom task", done=DoneCondition(), type="CustomAnalysis")
        assert block.type == "CustomAnalysis"
