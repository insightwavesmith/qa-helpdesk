"""Tests BD-48~56: Canvas ↔ YAML bidirectional converters + auto-layout."""

import pytest

from brick.dashboard.converters import (
    CanvasToPresetConverter,
    DagreLayoutEngine,
    PresetToCanvasConverter,
)
from brick.dashboard.models.canvas import CanvasEdge, CanvasNode, CanvasState

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_PRESET = {
    "blocks": [
        {"id": "plan", "type": "Plan", "what": "계획 수립"},
        {"id": "design", "type": "Design", "what": "상세 설계"},
        {"id": "do", "type": "Do", "what": "구현"},
        {"id": "check", "type": "Check", "what": "검증"},
        {"id": "act", "type": "Act", "what": "완료"},
    ],
    "links": [
        {"from": "plan", "to": "design", "type": "sequential"},
        {"from": "design", "to": "do", "type": "sequential"},
        {"from": "do", "to": "check", "type": "sequential"},
        {"from": "check", "to": "act", "type": "sequential"},
    ],
    "teams": {
        "plan": {"adapter": "claude_agent_teams", "session": "pm"},
        "design": {"adapter": "claude_agent_teams", "session": "pm"},
        "do": {"adapter": "claude_code"},
        "check": {"adapter": "claude_code"},
        "act": {"adapter": "claude_code"},
    },
    "gates": {
        "plan": {"handlers": [{"type": "command", "command": "test -f plan.md"}]},
        "design": {"handlers": [{"type": "command", "command": "test -f design.md"}]},
    },
}


# ---------------------------------------------------------------------------
# BD-48: Preset → Canvas: blocks → nodes
# ---------------------------------------------------------------------------
def test_bd48_preset_to_canvas_blocks_to_nodes():
    converter = PresetToCanvasConverter()
    canvas = converter.convert(SAMPLE_PRESET)

    assert len(canvas.nodes) == len(SAMPLE_PRESET["blocks"])
    node_ids = {n.id for n in canvas.nodes}
    block_ids = {b["id"] for b in SAMPLE_PRESET["blocks"]}
    assert node_ids == block_ids


# ---------------------------------------------------------------------------
# BD-49: Preset → Canvas: links → edges
# ---------------------------------------------------------------------------
def test_bd49_preset_to_canvas_links_to_edges():
    converter = PresetToCanvasConverter()
    canvas = converter.convert(SAMPLE_PRESET)

    assert len(canvas.edges) == len(SAMPLE_PRESET["links"])
    for edge in canvas.edges:
        assert edge.source
        assert edge.target


# ---------------------------------------------------------------------------
# BD-50: Preset → Canvas: teams → node.data.team mapping
# ---------------------------------------------------------------------------
def test_bd50_preset_to_canvas_teams_mapping():
    converter = PresetToCanvasConverter()
    canvas = converter.convert(SAMPLE_PRESET)

    for node in canvas.nodes:
        assert "team" in node.data
        expected_team = SAMPLE_PRESET["teams"].get(node.id)
        assert node.data["team"] == expected_team


# ---------------------------------------------------------------------------
# BD-51: Preset → Canvas: gates → node.data.gate mapping
# ---------------------------------------------------------------------------
def test_bd51_preset_to_canvas_gates_mapping():
    converter = PresetToCanvasConverter()
    canvas = converter.convert(SAMPLE_PRESET)

    for node in canvas.nodes:
        assert "gate" in node.data
        expected_gate = SAMPLE_PRESET.get("gates", {}).get(node.id)
        assert node.data["gate"] == expected_gate


# ---------------------------------------------------------------------------
# BD-52: Canvas → Preset: nodes → blocks
# ---------------------------------------------------------------------------
def test_bd52_canvas_to_preset_nodes_to_blocks():
    p2c = PresetToCanvasConverter()
    canvas = p2c.convert(SAMPLE_PRESET)

    c2p = CanvasToPresetConverter()
    result = c2p.convert(canvas)
    assert len(result["blocks"]) == len(canvas.nodes)


# ---------------------------------------------------------------------------
# BD-53: Canvas → Preset: edges → links
# ---------------------------------------------------------------------------
def test_bd53_canvas_to_preset_edges_to_links():
    p2c = PresetToCanvasConverter()
    canvas = p2c.convert(SAMPLE_PRESET)

    c2p = CanvasToPresetConverter()
    result = c2p.convert(canvas)

    assert len(result["links"]) == len(canvas.edges)
    for link in result["links"]:
        assert "from" in link
        assert "to" in link
        assert "type" in link


# ---------------------------------------------------------------------------
# BD-54: Roundtrip: Preset → Canvas → Preset matches original
# ---------------------------------------------------------------------------
def test_bd54_roundtrip_preset_canvas_preset():
    p2c = PresetToCanvasConverter()
    c2p = CanvasToPresetConverter()

    canvas = p2c.convert(SAMPLE_PRESET)
    result = c2p.convert(canvas)

    orig_block_ids = {b["id"] for b in SAMPLE_PRESET["blocks"]}
    result_block_ids = {b["id"] for b in result["blocks"]}
    assert orig_block_ids == result_block_ids

    assert len(result["links"]) == len(SAMPLE_PRESET["links"])
    assert result["teams"] == SAMPLE_PRESET["teams"]


# ---------------------------------------------------------------------------
# BD-55: YAML roundtrip preserves custom/extra fields
# ---------------------------------------------------------------------------
def test_bd55_yaml_roundtrip_extra_fields():
    preset_with_extras = {
        **SAMPLE_PRESET,
        "custom_field": "should_survive",
        "events": {"on_start": "notify"},
    }
    p2c = PresetToCanvasConverter()
    c2p = CanvasToPresetConverter()

    canvas = p2c.convert(preset_with_extras)
    result = c2p.convert(canvas, original_preset=preset_with_extras)

    assert result.get("custom_field") == "should_survive"
    assert result.get("events") == {"on_start": "notify"}


# ---------------------------------------------------------------------------
# BD-56: Auto-layout (dagre): no overlapping nodes
# ---------------------------------------------------------------------------
def test_bd56_auto_layout_no_overlap():
    engine = DagreLayoutEngine()
    nodes = ["plan", "design", "do", "check", "act"]
    edges = [("plan", "design"), ("design", "do"), ("do", "check"), ("check", "act")]
    positions = engine.layout(nodes, edges)

    assert len(positions) == 5

    pos_list = list(positions.values())
    for i in range(len(pos_list)):
        for j in range(i + 1, len(pos_list)):
            dx = abs(pos_list[i]["x"] - pos_list[j]["x"])
            dy = abs(pos_list[i]["y"] - pos_list[j]["y"])
            assert dx >= engine.NODE_WIDTH or dy >= engine.NODE_HEIGHT, (
                f"Nodes {i} and {j} overlap: {pos_list[i]} vs {pos_list[j]}"
            )
