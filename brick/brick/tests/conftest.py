"""Shared test fixtures for Brick Engine tests."""

from __future__ import annotations

import pytest
from pathlib import Path

from brick.models.block import Block, DoneCondition, GateConfig, GateHandler
from brick.models.team import TeamDefinition
from brick.models.link import LinkDefinition
from brick.models.workflow import WorkflowDefinition, WorkflowInstance
from brick.models.events import Event, WorkflowStatus, BlockStatus


@pytest.fixture
def simple_block() -> Block:
    return Block(
        id="plan",
        what="Create implementation plan",
        done=DoneCondition(artifacts=["plan.md"]),
    )


@pytest.fixture
def simple_blocks() -> list[Block]:
    return [
        Block(id="plan", what="Create plan", done=DoneCondition(artifacts=["plan.md"])),
        Block(id="implement", what="Write code", done=DoneCondition(artifacts=["src/"])),
        Block(id="review", what="Code review", done=DoneCondition(artifacts=["review.md"])),
    ]


@pytest.fixture
def simple_links() -> list[LinkDefinition]:
    return [
        LinkDefinition(from_block="plan", to_block="implement"),
        LinkDefinition(from_block="implement", to_block="review"),
    ]


@pytest.fixture
def simple_teams() -> dict[str, TeamDefinition]:
    return {
        "plan": TeamDefinition(block_id="plan", adapter="claude_code"),
        "implement": TeamDefinition(block_id="implement", adapter="claude_agent_teams"),
        "review": TeamDefinition(block_id="review", adapter="claude_code"),
    }


@pytest.fixture
def simple_workflow(simple_blocks, simple_links, simple_teams) -> WorkflowDefinition:
    return WorkflowDefinition(
        name="test-workflow",
        description="A simple 3-block workflow for testing",
        blocks=simple_blocks,
        links=simple_links,
        teams=simple_teams,
    )


@pytest.fixture
def workflow_instance(simple_workflow) -> WorkflowInstance:
    return WorkflowInstance.from_definition(
        simple_workflow, feature="test-feature", task="test-task"
    )


@pytest.fixture
def running_workflow(workflow_instance) -> WorkflowInstance:
    """A workflow that has been started (RUNNING, first block QUEUED)."""
    wf = workflow_instance
    wf.status = WorkflowStatus.RUNNING
    wf.current_block_id = "plan"
    wf.blocks["plan"].status = BlockStatus.QUEUED
    return wf


@pytest.fixture
def checkpoint_dir(tmp_path) -> Path:
    return tmp_path / "checkpoints"


@pytest.fixture
def queue_dir(tmp_path) -> Path:
    return tmp_path / "queue"
