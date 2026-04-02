"""BK-64~75: Link tests."""

import pytest

from brick.links.sequential import SequentialLink
from brick.links.parallel import ParallelLink
from brick.links.compete import CompeteLink
from brick.links.loop import LoopLink
from brick.links.cron import CronLink
from brick.links.branch import BranchLink
from brick.models.block import Block, DoneCondition
from brick.models.events import BlockStatus
from brick.models.link import LinkDefinition, LinkDecision
from brick.models.workflow import BlockInstance


def _make_block_inst(status: BlockStatus, metrics: dict | None = None) -> BlockInstance:
    inst = BlockInstance(
        block=Block(id="src", what="Source", done=DoneCondition()),
        status=status,
    )
    if metrics:
        inst.metrics = metrics
    return inst


class TestSequentialLink:
    def test_bk64_sequential_a_to_b(self):
        """BK-64: Sequential A→B."""
        link_def = LinkDefinition(from_block="a", to_block="b")
        link = SequentialLink(link_def)
        src = _make_block_inst(BlockStatus.COMPLETED)
        decision = link.evaluate(src, {})
        assert decision.next_blocks == ["b"]

    def test_bk65_sequential_fail_on_fail(self):
        """BK-65: Sequential B failed → on_fail."""
        link_def = LinkDefinition(from_block="a", to_block="b", on_fail="fallback")
        link = SequentialLink(link_def)
        src = _make_block_inst(BlockStatus.FAILED)
        decision = link.evaluate(src, {})
        assert decision.next_blocks == ["fallback"]

    def test_sequential_pending_no_decision(self):
        link_def = LinkDefinition(from_block="a", to_block="b")
        link = SequentialLink(link_def)
        src = _make_block_inst(BlockStatus.PENDING)
        decision = link.evaluate(src, {})
        assert decision.next_blocks == []


class TestParallelLink:
    def test_bk66_parallel_all_merge(self):
        """BK-66: Parallel all merge."""
        link_def = LinkDefinition(
            from_block="a", to_block="b", type="parallel", merge_strategy="all"
        )
        link = ParallelLink(link_def)
        src = _make_block_inst(BlockStatus.COMPLETED)
        decision = link.evaluate(src, {})
        assert decision.parallel is True
        assert decision.merge_strategy == "all"
        assert "b" in decision.next_blocks

    def test_bk67_parallel_any_merge(self):
        """BK-67: Parallel any merge."""
        link_def = LinkDefinition(
            from_block="a", to_block="b", type="parallel", merge_strategy="any"
        )
        link = ParallelLink(link_def)
        src = _make_block_inst(BlockStatus.COMPLETED)
        decision = link.evaluate(src, {})
        assert decision.merge_strategy == "any"


class TestCompeteLink:
    def test_bk68_compete_two_adapters(self):
        """BK-68: Compete 2 adapter 동시."""
        link_def = LinkDefinition(
            from_block="a", to_block="b", type="compete",
            teams=["team1", "team2"],
        )
        link = CompeteLink(link_def)
        src = _make_block_inst(BlockStatus.COMPLETED)
        decision = link.evaluate(src, {})
        assert decision.parallel is True
        assert "b" in decision.next_blocks

    def test_bk69_compete_judge_auto(self):
        """BK-69: Compete judge auto."""
        link_def = LinkDefinition(
            from_block="a", to_block="b", type="compete",
            judge={"mode": "auto"},
        )
        link = CompeteLink(link_def)
        src = _make_block_inst(BlockStatus.COMPLETED)
        decision = link.evaluate(src, {})
        assert decision.next_blocks == ["b"]

    def test_bk70_compete_judge_prompt(self):
        """BK-70: Compete judge prompt."""
        link_def = LinkDefinition(
            from_block="a", to_block="b", type="compete",
            judge={"mode": "prompt", "prompt": "Which is better?"},
        )
        link = CompeteLink(link_def)
        src = _make_block_inst(BlockStatus.COMPLETED)
        decision = link.evaluate(src, {})
        assert decision.parallel is True


class TestLoopLink:
    def test_bk71_loop_retry(self):
        """BK-71: Loop retry."""
        link_def = LinkDefinition(
            from_block="check", to_block="do", type="loop",
            condition={"match_rate_below": 90}, max_retries=3,
        )
        link = LoopLink(link_def)
        src = _make_block_inst(BlockStatus.COMPLETED, metrics={"match_rate": 80})
        src.retry_count = 0
        decision = link.evaluate(src, {})
        assert decision.next_blocks == ["do"]

    def test_bk72_loop_max_retries_exhausted(self):
        """BK-72: Loop max_retries 소진."""
        link_def = LinkDefinition(
            from_block="check", to_block="do", type="loop",
            condition={"match_rate_below": 90}, max_retries=3,
        )
        link = LoopLink(link_def)
        src = _make_block_inst(BlockStatus.COMPLETED, metrics={"match_rate": 80})
        src.retry_count = 3
        decision = link.evaluate(src, {})
        assert decision.next_blocks == []

    def test_loop_condition_met_no_loop(self):
        link_def = LinkDefinition(
            from_block="check", to_block="do", type="loop",
            condition={"match_rate_below": 90}, max_retries=3,
        )
        link = LoopLink(link_def)
        src = _make_block_inst(BlockStatus.COMPLETED, metrics={"match_rate": 95})
        decision = link.evaluate(src, {})
        assert decision.next_blocks == []


class TestCronLink:
    def test_bk73_cron_expression_valid(self):
        """BK-73: Cron expression 파싱."""
        assert CronLink.parse_cron("*/5 * * * *") is True
        assert CronLink.parse_cron("0 9 * * 1") is True
        assert CronLink.parse_cron("bad") is False

    def test_cron_with_schedule(self):
        link_def = LinkDefinition(
            from_block="a", to_block="b", type="cron", schedule="*/5 * * * *"
        )
        link = CronLink(link_def)
        src = _make_block_inst(BlockStatus.COMPLETED)
        decision = link.evaluate(src, {})
        assert decision.next_blocks == ["b"]

    def test_cron_no_schedule(self):
        link_def = LinkDefinition(from_block="a", to_block="b", type="cron")
        link = CronLink(link_def)
        src = _make_block_inst(BlockStatus.COMPLETED)
        decision = link.evaluate(src, {})
        assert decision.next_blocks == []


class TestBranchLink:
    def test_bk74_branch_condition(self):
        """BK-74: Branch 조건 분기."""
        link_def = LinkDefinition(
            from_block="check", to_block="default",
            type="branch",
            branches=[
                {"condition_key": "level", "condition_value": "3", "target": "security"},
                {"condition_key": "level", "condition_value": "2", "target": "act"},
            ],
        )
        link = BranchLink(link_def)
        src = _make_block_inst(BlockStatus.COMPLETED)
        decision = link.evaluate(src, {"level": "3"})
        assert decision.next_blocks == ["security"]

    def test_bk75_branch_default(self):
        """BK-75: Branch 기본 분기."""
        link_def = LinkDefinition(
            from_block="check", to_block="default",
            type="branch",
            branches=[
                {"condition_key": "level", "condition_value": "99", "target": "nowhere"},
            ],
        )
        link = BranchLink(link_def)
        src = _make_block_inst(BlockStatus.COMPLETED)
        decision = link.evaluate(src, {"level": "2"})
        assert decision.next_blocks == ["default"]

    def test_branch_no_match_no_default(self):
        link_def = LinkDefinition(
            from_block="check", to_block="",
            type="branch",
            branches=[
                {"condition_key": "x", "condition_value": "1", "target": "t"},
            ],
        )
        link = BranchLink(link_def)
        src = _make_block_inst(BlockStatus.COMPLETED)
        decision = link.evaluate(src, {"x": "2"})
        assert decision.next_blocks == []
