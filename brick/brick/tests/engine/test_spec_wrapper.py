"""SW-001 ~ SW-012: Spec Wrapper 자동 해제 TDD.

PresetLoader._parse_preset()가 kind+spec YAML을 올바르게 파싱하는지 검증.
기존 flat YAML 하위호환 보장.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from brick.engine.executor import PresetLoader
from brick.models.workflow import WorkflowDefinition


# ── Test Data ──

SPEC_WRAPPED_L2 = {
    "kind": "Preset",
    "name": "t-pdca-l2",
    "description": "L2 표준 PDCA",
    "labels": {"level": "l2", "type": "standard"},
    "spec": {
        "blocks": [
            {"id": "plan", "type": "plan", "what": "계획 수립", "done": {"artifacts": ["plan.md"]}},
            {"id": "design", "type": "design", "what": "상세 설계", "done": {"artifacts": ["design.md"]}},
            {"id": "do", "type": "implement", "what": "구현", "done": {"artifacts": ["src/**"]}},
            {"id": "check", "type": "test", "what": "Gap 분석", "done": {"artifacts": ["gap.md"]}},
            {"id": "review", "type": "review", "what": "검토", "done": {"artifacts": []}},
            {"id": "learn", "type": "custom", "what": "회고", "done": {"artifacts": ["report.md"]}},
        ],
        "links": [
            {"from": "plan", "to": "design", "type": "sequential"},
            {"from": "design", "to": "do", "type": "sequential"},
            {"from": "do", "to": "check", "type": "sequential"},
            {"from": "check", "to": "do", "type": "loop", "condition": "match_rate < 90"},
            {"from": "check", "to": "review", "type": "branch", "condition": "match_rate >= 90"},
            {"from": "review", "to": "do", "type": "loop", "condition": "review == rejected"},
            {"from": "review", "to": "learn", "type": "branch", "condition": "review == approved"},
        ],
        "teams": {
            "plan": "pm-team",
            "design": "pm-team",
            "do": {"team": "cto-team", "override": {"permitted_tools": ["Read", "Write"]}},
            "check": {"team": "cto-team", "override": {"permitted_tools": ["Read"]}},
            "review": None,
            "learn": "coo-team",
        },
    },
}

FLAT_YAML = {
    "name": "flat-preset",
    "description": "Legacy flat format",
    "blocks": [
        {"id": "plan", "type": "plan", "what": "계획", "done": {"artifacts": []}},
        {"id": "do", "type": "implement", "what": "구현", "done": {"artifacts": []}},
    ],
    "links": [
        {"from": "plan", "to": "do", "type": "sequential"},
    ],
    "teams": {
        "plan": {"adapter": "human", "config": {}},
        "do": {"adapter": "claude", "config": {}},
    },
    "level": 1,
}

KIND_ONLY_NO_SPEC = {
    "kind": "Preset",
    "name": "kind-only",
    "blocks": [
        {"id": "do", "type": "implement", "what": "구현", "done": {"artifacts": []}},
    ],
    "links": [],
    "teams": {},
}

EMPTY_SPEC = {
    "kind": "Preset",
    "name": "empty-spec",
    "spec": {},
}

SPEC_WITH_GATES = {
    "kind": "Preset",
    "name": "gated",
    "spec": {
        "blocks": [
            {"id": "do", "type": "implement", "what": "구현", "done": {"artifacts": []}},
        ],
        "links": [],
        "teams": {},
        "gates": {
            "do": [{"type": "command", "command": "npm run build"}],
        },
    },
}

SPEC_WITH_LABELS_LEVEL = {
    "kind": "Preset",
    "name": "leveled",
    "labels": {"level": "l3", "type": "full"},
    "spec": {
        "blocks": [
            {"id": "plan", "type": "plan", "what": "계획", "done": {"artifacts": []}},
        ],
        "links": [],
        "teams": {},
    },
}

SPEC_WITH_READONLY = {
    "kind": "Preset",
    "name": "readonly-test",
    "readonly": True,
    "spec": {
        "blocks": [
            {"id": "do", "type": "implement", "what": "구현", "done": {"artifacts": []}},
        ],
        "links": [],
        "teams": {},
    },
}


# ── Helpers ──

def _loader() -> PresetLoader:
    """PresetLoader with dummy dir (not used for in-memory tests)."""
    return PresetLoader(Path("/tmp/unused"))


def _real_loader() -> PresetLoader:
    """PresetLoader pointing at actual .bkit/presets/."""
    presets_dir = Path(__file__).resolve().parents[4] / ".bkit" / "presets"
    return PresetLoader(presets_dir)


# ── Tests ──


class TestSpecWrapper:
    """SW-001 ~ SW-007: Core spec wrapper behavior."""

    def test_sw01_parse_with_spec_wrapper(self):
        """SW-001: kind+spec YAML -> 6 blocks loaded."""
        loader = _loader()
        defn = loader._parse_preset(SPEC_WRAPPED_L2)
        assert len(defn.blocks) == 6
        assert defn.blocks[0].id == "plan"
        assert defn.blocks[5].id == "learn"

    def test_sw02_parse_flat_yaml(self):
        """SW-002: flat YAML without spec -> backward compat."""
        loader = _loader()
        defn = loader._parse_preset(FLAT_YAML)
        assert len(defn.blocks) == 2
        assert defn.blocks[0].id == "plan"
        assert defn.blocks[1].id == "do"
        assert defn.name == "flat-preset"
        assert defn.level == 1

    def test_sw03_spec_wrapper_links(self):
        """SW-003: spec.links 7 items -> 7 links, correct from/to."""
        loader = _loader()
        defn = loader._parse_preset(SPEC_WRAPPED_L2)
        assert len(defn.links) == 7
        assert defn.links[0].from_block == "plan"
        assert defn.links[0].to_block == "design"
        assert defn.links[3].type == "loop"
        assert defn.links[6].to_block == "learn"

    def test_sw04_spec_wrapper_teams(self):
        """SW-004: spec.teams parsing -> teams dict keyed by block_id."""
        loader = _loader()
        defn = loader._parse_preset(SPEC_WRAPPED_L2)
        # String shorthand: "pm-team"
        assert "plan" in defn.teams
        assert defn.teams["plan"].adapter == "pm-team"
        # Dict with team key
        assert "do" in defn.teams
        assert defn.teams["do"].adapter == "cto-team"
        # None -> skipped
        assert "review" not in defn.teams
        # String shorthand for coo
        assert "learn" in defn.teams
        assert defn.teams["learn"].adapter == "coo-team"

    def test_sw05_name_from_root(self):
        """SW-005: name read from root, not spec."""
        loader = _loader()
        defn = loader._parse_preset(SPEC_WRAPPED_L2)
        assert defn.name == "t-pdca-l2"
        assert defn.description == "L2 표준 PDCA"

    def test_sw06_kind_only_no_spec(self):
        """SW-006: kind present but no spec -> flat fallback, no error."""
        loader = _loader()
        defn = loader._parse_preset(KIND_ONLY_NO_SPEC)
        assert len(defn.blocks) == 1
        assert defn.blocks[0].id == "do"
        assert defn.name == "kind-only"

    def test_sw07_empty_spec(self):
        """SW-007: spec: {} -> empty blocks/links/teams."""
        loader = _loader()
        defn = loader._parse_preset(EMPTY_SPEC)
        assert defn.blocks == []
        assert defn.links == []
        assert defn.teams == {}
        assert defn.name == "empty-spec"


class TestSpecWrapperRealFile:
    """SW-008 ~ SW-009: Real YAML file loading."""

    def test_sw08_load_real_preset_file(self):
        """SW-008: load actual t-pdca-l2.yaml -> 5 blocks + 5 links."""
        loader = _real_loader()
        if not (loader.presets_dir / "t-pdca-l2.yaml").exists():
            pytest.skip("t-pdca-l2.yaml not found")
        defn = loader.load("t-pdca-l2")
        assert len(defn.blocks) == 5
        assert len(defn.links) == 5
        assert defn.name == "T-PDCA L2 표준"
        block_ids = [b.id for b in defn.blocks]
        assert "plan" in block_ids
        assert "act" in block_ids

    def test_sw09_extends_with_spec_wrapper(self):
        """SW-009: extends preset also has spec -> merge works."""
        loader = _loader()
        # Child extends base via data["extends"]
        base_data = {
            "kind": "Preset",
            "name": "base",
            "spec": {
                "blocks": [
                    {"id": "plan", "type": "plan", "what": "base plan", "done": {"artifacts": []}},
                    {"id": "do", "type": "implement", "what": "base do", "done": {"artifacts": []}},
                ],
                "links": [{"from": "plan", "to": "do", "type": "sequential"}],
                "teams": {"plan": "pm-team"},
            },
        }
        child_data = {
            "kind": "Preset",
            "name": "child",
            "spec": {
                "blocks": [
                    {"id": "do", "type": "implement", "what": "child do override", "done": {"artifacts": ["new.ts"]}},
                    {"id": "check", "type": "test", "what": "child check", "done": {"artifacts": []}},
                ],
                "links": [
                    {"from": "plan", "to": "do", "type": "sequential"},
                    {"from": "do", "to": "check", "type": "sequential"},
                ],
                "teams": {"do": "cto-team"},
            },
        }
        base_defn = loader._parse_preset(base_data)
        child_defn = loader._parse_preset(child_data)
        merged = loader._merge(base_defn, child_defn, {})

        block_ids = [b.id for b in merged.blocks]
        assert "plan" in block_ids
        assert "do" in block_ids
        assert "check" in block_ids
        # child "do" overrides base "do"
        do_block = next(b for b in merged.blocks if b.id == "do")
        assert do_block.what == "child do override"


class TestSpecWrapperEdgeCases:
    """SW-010 ~ SW-012: Edge cases."""

    def test_sw10_gates_in_spec_ignored(self):
        """SW-010: gates field in spec -> parse succeeds, gates ignored by _parse_preset."""
        loader = _loader()
        defn = loader._parse_preset(SPEC_WITH_GATES)
        # _parse_preset doesn't parse gates into WorkflowDefinition
        assert len(defn.blocks) == 1
        assert defn.name == "gated"

    def test_sw11_level_from_labels(self):
        """SW-011: labels.level -> level value extracted correctly."""
        loader = _loader()
        defn = loader._parse_preset(SPEC_WITH_LABELS_LEVEL)
        assert defn.level == 3

    def test_sw12_readonly_field_preserved(self):
        """SW-012: readonly: true -> no parsing impact."""
        loader = _loader()
        defn = loader._parse_preset(SPEC_WITH_READONLY)
        assert len(defn.blocks) == 1
        assert defn.name == "readonly-test"
