"""Phase 0: BlockInstance to_dict/from_dict input+gate 직렬화 TDD (be_04~be_06)."""

from __future__ import annotations

import pytest

from brick.models.block import (
    Block, DoneCondition, GateConfig, GateHandler,
    InputConfig, ReviewConfig,
)
from brick.models.workflow import BlockInstance


def test_be04_to_dict_includes_input():
    """be_04: to_dict()에 input 키가 포함되어야 함."""
    block = Block(
        id="impl",
        what="구현",
        done=DoneCondition(),
        input=InputConfig(from_block="design", artifacts=["design.md"]),
    )
    bi = BlockInstance(block=block)
    d = bi.to_dict()

    assert "input" in d["block"], "to_dict()에 input 키가 없음"
    assert d["block"]["input"]["from_block"] == "design"
    assert d["block"]["input"]["artifacts"] == ["design.md"]


def test_be05_to_dict_includes_gate():
    """be_05: to_dict()에 gate 키가 포함되어야 함."""
    gate = GateConfig(
        handlers=[GateHandler(type="command", command="npm run build")],
        on_fail="retry",
        max_retries=2,
    )
    block = Block(id="build", what="빌드", done=DoneCondition(), gate=gate)
    bi = BlockInstance(block=block)
    d = bi.to_dict()

    assert "gate" in d["block"], "to_dict()에 gate 키가 없음"
    assert d["block"]["gate"]["on_fail"] == "retry"
    assert d["block"]["gate"]["max_retries"] == 2
    assert len(d["block"]["gate"]["handlers"]) == 1
    assert d["block"]["gate"]["handlers"][0]["type"] == "command"
    assert d["block"]["gate"]["handlers"][0]["command"] == "npm run build"


def test_be06_roundtrip_input_gate_preserved():
    """be_06: to_dict → from_dict 왕복 후 input, gate 동일."""
    gate = GateConfig(
        handlers=[
            GateHandler(type="command", command="npm test"),
            GateHandler(type="metric", metric="match_rate", threshold=0.9),
        ],
        review=ReviewConfig(coo=True, timeout=7200),
        on_fail="skip",
        max_retries=5,
    )
    block = Block(
        id="check",
        what="검증",
        done=DoneCondition(artifacts=["report.md"]),
        input=InputConfig(from_block="do", artifacts=["output.json", "log.txt"]),
        gate=gate,
    )
    bi = BlockInstance(block=block, adapter="claude_local")

    d = bi.to_dict()
    restored = BlockInstance.from_dict(d)

    # input 검증
    assert restored.block.input is not None, "from_dict 후 input이 None"
    assert restored.block.input.from_block == "do"
    assert restored.block.input.artifacts == ["output.json", "log.txt"]

    # gate 검증
    assert restored.block.gate is not None, "from_dict 후 gate가 None"
    assert restored.block.gate.on_fail == "skip"
    assert restored.block.gate.max_retries == 5
    assert len(restored.block.gate.handlers) == 2
    assert restored.block.gate.handlers[0].type == "command"
    assert restored.block.gate.handlers[0].command == "npm test"
    assert restored.block.gate.handlers[1].type == "metric"
    assert restored.block.gate.handlers[1].metric == "match_rate"
    assert restored.block.gate.handlers[1].threshold == 0.9

    # review 검증
    assert restored.block.gate.review is not None
    assert restored.block.gate.review.coo is True
    assert restored.block.gate.review.timeout == 7200
