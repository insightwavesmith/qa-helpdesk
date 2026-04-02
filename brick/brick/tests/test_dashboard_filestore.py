"""BD-01~08: FileStore tests for Brick Dashboard."""

import pytest
import yaml
from pathlib import Path

from brick.dashboard.models.resource import BrickResource
from brick.dashboard.file_store import FileStore


BUILTIN_BLOCK_TYPES = [
    "plan", "design", "do", "check", "act", "review", "gate", "custom", "hotfix"
]


@pytest.fixture
def bkit_root(tmp_path: Path) -> Path:
    """Create a .bkit/ directory with block-type YAMLs."""
    root = tmp_path / ".bkit"
    bt_dir = root / "block-types"
    bt_dir.mkdir(parents=True)
    (root / "teams").mkdir()
    (root / "presets").mkdir()

    for name in BUILTIN_BLOCK_TYPES:
        data = {
            "kind": "BlockType",
            "name": name,
            "spec": {
                "default_what": f"{name} 기본 작업",
                "default_done": f"{name} 완료 조건",
            },
            "labels": {},
            "annotations": {},
            "readonly": name in BUILTIN_BLOCK_TYPES,  # builtins are readonly
        }
        (bt_dir / f"{name}.yaml").write_text(yaml.dump(data, allow_unicode=True))

    return root


@pytest.fixture
def store(bkit_root: Path) -> FileStore:
    return FileStore(root=str(bkit_root))


class TestBD01ListBlockTypes:
    """BD-01: FileStore list(kind='BlockType') returns built-in block types (9 types)."""

    def test_list_returns_all_builtin_block_types(self, store: FileStore):
        resources = store.list("BlockType")
        names = {r.name for r in resources}
        assert len(resources) >= 9
        for bt in BUILTIN_BLOCK_TYPES:
            assert bt in names

    def test_list_returns_brick_resources(self, store: FileStore):
        resources = store.list("BlockType")
        for r in resources:
            assert isinstance(r, BrickResource)
            assert r.kind == "BlockType"


class TestBD02CreateBlockType:
    """BD-02: FileStore create(BlockType) creates YAML file at .bkit/block-types/{name}.yaml."""

    def test_create_writes_yaml_file(self, store: FileStore, bkit_root: Path):
        resource = BrickResource(
            kind="BlockType",
            name="test-block",
            spec={"default_what": "테스트 작업", "default_done": "테스트 완료"},
        )
        result = store.create(resource)

        assert result.name == "test-block"
        assert result.updated_at != ""

        file_path = bkit_root / "block-types" / "test-block.yaml"
        assert file_path.exists()

        data = yaml.safe_load(file_path.read_text())
        assert data["name"] == "test-block"
        assert data["kind"] == "BlockType"

    def test_create_duplicate_raises(self, store: FileStore):
        resource = BrickResource(
            kind="BlockType", name="plan",
            spec={"default_what": "x", "default_done": "y"},
        )
        with pytest.raises(FileExistsError):
            store.create(resource)


class TestBD03UpdateBlockType:
    """BD-03: FileStore update(BlockType) updates existing YAML file."""

    def test_update_overwrites_spec(self, store: FileStore, bkit_root: Path):
        # First make it non-readonly so update is allowed
        file_path = bkit_root / "block-types" / "custom.yaml"
        data = yaml.safe_load(file_path.read_text())
        data["readonly"] = False
        file_path.write_text(yaml.dump(data, allow_unicode=True))

        resource = store.get("BlockType", "custom")
        resource.spec["default_what"] = "업데이트된 작업"
        result = store.update(resource)

        assert result.spec["default_what"] == "업데이트된 작업"
        reloaded = store.get("BlockType", "custom")
        assert reloaded.spec["default_what"] == "업데이트된 작업"

    def test_update_nonexistent_raises(self, store: FileStore):
        resource = BrickResource(
            kind="BlockType", name="nonexistent",
            spec={"default_what": "x", "default_done": "y"},
        )
        with pytest.raises(FileNotFoundError):
            store.update(resource)


class TestBD04DeleteBlockType:
    """BD-04: FileStore delete(BlockType) removes file."""

    def test_delete_removes_file(self, store: FileStore, bkit_root: Path):
        # Create a non-readonly resource first
        resource = BrickResource(
            kind="BlockType", name="deletable",
            spec={"default_what": "x", "default_done": "y"},
        )
        store.create(resource)
        assert (bkit_root / "block-types" / "deletable.yaml").exists()

        result = store.delete("BlockType", "deletable")
        assert result is True
        assert not (bkit_root / "block-types" / "deletable.yaml").exists()


class TestBD05DeleteReadonly:
    """BD-05: FileStore delete(readonly resource) raises error."""

    def test_delete_readonly_raises(self, store: FileStore):
        with pytest.raises(PermissionError):
            store.delete("BlockType", "plan")


class TestBD06Watch:
    """BD-06: FileStore watch — external file change triggers callback."""

    def test_watch_callback_mechanism(self, store: FileStore, bkit_root: Path):
        events = []

        def on_change(event):
            events.append(event)

        # Register callback
        store.watch(on_change)

        # Simulate file change
        new_file = bkit_root / "block-types" / "new-block.yaml"
        data = {
            "kind": "BlockType",
            "name": "new-block",
            "spec": {"default_what": "new", "default_done": "done"},
            "labels": {},
            "annotations": {},
            "readonly": False,
        }
        new_file.write_text(yaml.dump(data, allow_unicode=True))

        # Trigger scan for changes
        store.notify_changes()

        assert len(events) >= 1


class TestBD07CreateTeam:
    """BD-07: FileStore create(Team) creates YAML at .bkit/teams/{name}.yaml."""

    def test_create_team(self, store: FileStore, bkit_root: Path):
        resource = BrickResource(
            kind="Team",
            name="backend-team",
            spec={
                "adapter": "claude_agent_teams",
                "config": {"session": "sdk-cto", "role": "CTO_LEADER"},
            },
        )
        result = store.create(resource)

        assert result.name == "backend-team"
        file_path = bkit_root / "teams" / "backend-team.yaml"
        assert file_path.exists()

        data = yaml.safe_load(file_path.read_text())
        assert data["kind"] == "Team"
        assert data["spec"]["adapter"] == "claude_agent_teams"


class TestBD08CreatePreset:
    """BD-08: FileStore create(Preset) creates YAML at .bkit/presets/{name}.yaml."""

    def test_create_preset(self, store: FileStore, bkit_root: Path):
        resource = BrickResource(
            kind="Preset",
            name="my-workflow",
            spec={
                "level": 2,
                "blocks": [
                    {"id": "plan", "type": "Plan", "what": "계획 수립"},
                    {"id": "do", "type": "Do", "what": "구현"},
                ],
                "links": [{"from": "plan", "to": "do", "type": "sequential"}],
                "teams": {
                    "plan": {"adapter": "claude_code", "config": {}},
                    "do": {"adapter": "claude_agent_teams", "config": {}},
                },
            },
        )
        result = store.create(resource)

        assert result.name == "my-workflow"
        file_path = bkit_root / "presets" / "my-workflow.yaml"
        assert file_path.exists()

        data = yaml.safe_load(file_path.read_text())
        assert data["kind"] == "Preset"
        assert len(data["spec"]["blocks"]) == 2
