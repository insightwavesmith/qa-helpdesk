"""BD-09~17: ValidationPipeline tests for Brick Dashboard."""

import pytest
import yaml
from pathlib import Path

from brick.dashboard.models.resource import BrickResource, ValidationResult
from brick.dashboard.file_store import FileStore
from brick.dashboard.validation_pipeline import ValidationPipeline


@pytest.fixture
def bkit_root(tmp_path: Path) -> Path:
    """Minimal .bkit/ with block-types and teams."""
    root = tmp_path / ".bkit"
    (root / "block-types").mkdir(parents=True)
    (root / "teams").mkdir()
    (root / "presets").mkdir()

    # Create a couple of block types
    for name in ["plan", "do", "check"]:
        data = {
            "kind": "BlockType",
            "name": name,
            "spec": {"default_what": f"{name} 작업", "default_done": f"{name} 완료"},
            "labels": {},
            "annotations": {},
            "readonly": True,
        }
        (root / "block-types" / f"{name}.yaml").write_text(
            yaml.dump(data, allow_unicode=True)
        )

    # Create a team
    team_data = {
        "kind": "Team",
        "name": "dev-team",
        "spec": {"adapter": "claude_agent_teams", "config": {}},
        "labels": {},
        "annotations": {},
        "readonly": False,
    }
    (root / "teams" / "dev-team.yaml").write_text(
        yaml.dump(team_data, allow_unicode=True)
    )

    return root


@pytest.fixture
def store(bkit_root: Path) -> FileStore:
    return FileStore(root=str(bkit_root))


@pytest.fixture
def pipeline(store: FileStore) -> ValidationPipeline:
    return ValidationPipeline(store=store)


class TestBD09InvWorkflowWithoutTask:
    """BD-09: INV-1 — Workflow without task field → ValidationError(INV-1)."""

    def test_workflow_missing_task(self, pipeline: ValidationPipeline):
        resource = BrickResource(
            kind="Workflow",
            name="test-wf",
            spec={},  # no task field
        )
        result = pipeline.validate(resource)
        assert not result.valid
        codes = [e.code for e in result.errors]
        assert "INV-1" in codes


class TestBD10BlockTypeMissingWhat:
    """BD-10: INV-2 — BlockType without default_what → ValidationError(INV-2)."""

    def test_blocktype_missing_default_what(self, pipeline: ValidationPipeline):
        resource = BrickResource(
            kind="BlockType",
            name="bad-block",
            spec={"default_done": "완료 조건"},  # no default_what
        )
        result = pipeline.validate(resource)
        assert not result.valid
        codes = [e.code for e in result.errors]
        assert "INV-2" in codes


class TestBD11BlockTypeMissingDone:
    """BD-11: INV-3 — BlockType without default_done → ValidationError(INV-3)."""

    def test_blocktype_missing_default_done(self, pipeline: ValidationPipeline):
        resource = BrickResource(
            kind="BlockType",
            name="bad-block",
            spec={"default_what": "작업"},  # no default_done
        )
        result = pipeline.validate(resource)
        assert not result.valid
        codes = [e.code for e in result.errors]
        assert "INV-3" in codes


class TestBD12PresetBlockNoTeam:
    """BD-12: INV-5 — Preset with block that has no team assigned → ValidationError(INV-5)."""

    def test_preset_block_without_team(self, pipeline: ValidationPipeline):
        resource = BrickResource(
            kind="Preset",
            name="bad-preset",
            spec={
                "blocks": [
                    {"id": "plan", "type": "Plan", "what": "계획"},
                    {"id": "do", "type": "Do", "what": "구현"},
                ],
                "links": [{"from": "plan", "to": "do", "type": "sequential"}],
                "teams": {
                    "plan": {"adapter": "claude_code", "config": {}},
                    # 'do' has no team
                },
            },
        )
        result = pipeline.validate(resource)
        assert not result.valid
        codes = [e.code for e in result.errors]
        assert "INV-5" in codes


class TestBD13PresetDAGCycle:
    """BD-13: INV-7 — Preset DAG with cycle → ValidationError(INV-7)."""

    def test_preset_dag_cycle(self, pipeline: ValidationPipeline):
        resource = BrickResource(
            kind="Preset",
            name="cyclic-preset",
            spec={
                "blocks": [
                    {"id": "a", "type": "Do", "what": "A"},
                    {"id": "b", "type": "Do", "what": "B"},
                    {"id": "c", "type": "Do", "what": "C"},
                ],
                "links": [
                    {"from": "a", "to": "b", "type": "sequential"},
                    {"from": "b", "to": "c", "type": "sequential"},
                    {"from": "c", "to": "a", "type": "sequential"},  # cycle!
                ],
                "teams": {
                    "a": {"adapter": "x", "config": {}},
                    "b": {"adapter": "x", "config": {}},
                    "c": {"adapter": "x", "config": {}},
                },
            },
        )
        result = pipeline.validate(resource)
        assert not result.valid
        codes = [e.code for e in result.errors]
        assert "INV-7" in codes

    def test_loop_type_exempt(self, pipeline: ValidationPipeline):
        """Loop-type links should not trigger cycle detection."""
        resource = BrickResource(
            kind="Preset",
            name="loop-preset",
            spec={
                "blocks": [
                    {"id": "do", "type": "Do", "what": "구현"},
                    {"id": "check", "type": "Check", "what": "검증"},
                ],
                "links": [
                    {"from": "do", "to": "check", "type": "sequential"},
                    {"from": "check", "to": "do", "type": "loop"},  # loop, not cycle
                ],
                "teams": {
                    "do": {"adapter": "x", "config": {}},
                    "check": {"adapter": "x", "config": {}},
                },
            },
        )
        result = pipeline.validate(resource)
        # Should not have INV-7
        codes = [e.code for e in result.errors]
        assert "INV-7" not in codes


class TestBD14ReadonlyModification:
    """BD-14: INV-8 — Readonly resource modification → ValidationError(READONLY)."""

    def test_readonly_resource_error(self, pipeline: ValidationPipeline):
        resource = BrickResource(
            kind="BlockType",
            name="plan",
            spec={"default_what": "modified", "default_done": "modified"},
            readonly=True,
        )
        result = pipeline.validate(resource)
        assert not result.valid
        codes = [e.code for e in result.errors]
        assert "READONLY" in codes


class TestBD15SchemaValidation:
    """BD-15: Schema validation — missing required fields → SchemaValidationError."""

    def test_blocktype_missing_name(self, pipeline: ValidationPipeline):
        resource = BrickResource(
            kind="BlockType",
            name="",  # missing name
            spec={"default_what": "작업", "default_done": "완료"},
        )
        result = pipeline.validate(resource)
        assert not result.valid
        codes = [e.code for e in result.errors]
        assert "SCHEMA" in codes

    def test_preset_missing_blocks(self, pipeline: ValidationPipeline):
        resource = BrickResource(
            kind="Preset",
            name="bad-preset",
            spec={},  # no blocks
        )
        result = pipeline.validate(resource)
        assert not result.valid
        codes = [e.code for e in result.errors]
        assert "SCHEMA" in codes


class TestBD16ReferenceValidation:
    """BD-16: Reference validation — nonexistent team reference → ReferenceError."""

    def test_preset_references_nonexistent_team(self, pipeline: ValidationPipeline):
        resource = BrickResource(
            kind="Preset",
            name="ref-preset",
            spec={
                "blocks": [
                    {"id": "plan", "type": "Plan", "what": "계획"},
                ],
                "links": [],
                "teams": {
                    "plan": {"adapter": "nonexistent_adapter", "config": {}},
                },
            },
        )
        result = pipeline.validate(resource)
        # Reference errors may be warnings depending on implementation
        all_issues = result.errors + result.warnings
        codes = [e.code for e in all_issues]
        assert "REFERENCE" in codes


class TestBD17MultipleErrors:
    """BD-17: Multiple validation errors returned simultaneously."""

    def test_multiple_errors_at_once(self, pipeline: ValidationPipeline):
        resource = BrickResource(
            kind="BlockType",
            name="",  # SCHEMA error: no name
            spec={},  # INV-2: no default_what, INV-3: no default_done
        )
        result = pipeline.validate(resource)
        assert not result.valid
        assert len(result.errors) >= 2  # at least SCHEMA + INV-2 or INV-3
        codes = {e.code for e in result.errors}
        # Should have multiple different error codes
        assert len(codes) >= 2
