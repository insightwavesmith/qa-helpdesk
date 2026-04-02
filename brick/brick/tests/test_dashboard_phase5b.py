"""BD-141~150: Plugin-driven UI + 심층 분석 보충 tests."""

from __future__ import annotations

import yaml
import pytest

from brick.dashboard.plugin_manager import PluginManager, PluginMetadata


# ══════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════


@pytest.fixture
def plugin_mgr():
    return PluginManager()


@pytest.fixture
def sample_schema():
    return {
        "properties": {
            "repo": {"type": "string", "title": "Repo"},
            "branch": {"type": "string", "title": "Branch"},
            "port": {"type": "number", "title": "Port"},
        },
        "required": ["repo"],
    }


# ══════════════════════════════════════════════════════════════
# Part 1: Plugin-driven UI (BD-141~145)
# ══════════════════════════════════════════════════════════════


def test_bd141_discover_adapters_have_config_schema(plugin_mgr: PluginManager):
    """BD-141: discover_adapters returns list, each item has config_schema dict."""
    adapters = plugin_mgr.discover_adapters()
    assert isinstance(adapters, list)
    assert len(adapters) > 0
    for meta in adapters:
        assert isinstance(meta, PluginMetadata)
        assert isinstance(meta.config_schema, dict)


def test_bd142_validate_config_all_valid(plugin_mgr: PluginManager, sample_schema: dict):
    """BD-142: validate_config — valid config → 0 errors."""
    config = {"repo": "my-repo", "branch": "main", "port": 8080}
    errors = plugin_mgr.validate_config(sample_schema, config)
    assert len(errors) == 0


def test_bd143_validate_config_required_empty(plugin_mgr: PluginManager, sample_schema: dict):
    """BD-143: validate_config — required field empty → error containing '필수 필드'."""
    config = {"repo": "", "branch": "main"}
    errors = plugin_mgr.validate_config(sample_schema, config)
    assert len(errors) == 1
    assert "필수 필드" in errors[0]


def test_bd144_discover_adapters_registered_names(plugin_mgr: PluginManager):
    """BD-144: registered entry_points appear in discovered names."""
    adapters = plugin_mgr.discover_adapters()
    names = [a.name for a in adapters]
    assert "claude_agent_teams" in names or "human" in names


def test_bd145_plugin_metadata_fields(plugin_mgr: PluginManager):
    """BD-145: each discovered adapter has non-empty display_name, icon, description."""
    adapters = plugin_mgr.discover_adapters()
    assert len(adapters) > 0
    for meta in adapters:
        assert meta.display_name, f"display_name empty for {meta.name}"
        assert meta.icon, f"icon empty for {meta.name}"
        assert meta.description, f"description empty for {meta.name}"


# ══════════════════════════════════════════════════════════════
# Part 2: 심층 분석 보충 (BD-146~150)
# ══════════════════════════════════════════════════════════════


def test_bd146_adapter_not_found_error(plugin_mgr: PluginManager):
    """BD-146: get_management_capabilities('nonexistent') → error."""
    result = plugin_mgr.get_management_capabilities("nonexistent_adapter")
    assert "error" in result
    assert result["error"] == "Adapter not found"


def test_bd147_management_capability_matrix(plugin_mgr: PluginManager):
    """BD-147: human → no management; claude_agent_teams → has management."""
    human_caps = plugin_mgr.get_management_capabilities("human")
    assert human_caps["has_management"] is False
    assert human_caps.get("skills_tab") is False
    assert human_caps.get("mcp_tab") is False

    claude_caps = plugin_mgr.get_management_capabilities("claude_agent_teams")
    assert claude_caps["has_management"] is True
    assert claude_caps["skills_tab"] is True


def test_bd148_slack_webhook_parse_approval():
    """BD-148: SlackWebhookHandler.parse_approval → proposal_id, action='approve'."""
    from brick.dashboard.webhook_handler import SlackWebhookHandler

    handler = SlackWebhookHandler()
    payload = {
        "actions": [
            {"value": "proposal-123", "action_id": "approve"}
        ],
        "user": {"name": "smith"},
    }
    result = handler.parse_approval(payload)
    assert result["proposal_id"] == "proposal-123"
    assert result["action"] == "approve"
    assert result["user"] == "smith"


def test_bd149_validation_pipeline_warnings():
    """BD-149: Applying proposal with unknown adapter → warnings returned."""
    from brick.dashboard.validation_pipeline import ValidationPipeline
    from brick.dashboard.models.resource import BrickResource

    resource = BrickResource(
        kind="Preset",
        name="test-preset",
        spec={
            "blocks": [
                {"id": "b1"},
                {"id": "b2"},
            ],
            "teams": {
                "b1": {"adapter": "unknown_adapter"},
                "b2": {"adapter": "claude_code"},
            },
            "links": [
                {"from": "b1", "to": "b2"},
            ],
        },
    )
    pipeline = ValidationPipeline()
    result = pipeline.validate(resource)
    assert len(result.warnings) > 0
    warning_messages = [w.message for w in result.warnings]
    assert any("unknown_adapter" in m for m in warning_messages)


def test_bd150_filestore_sync_all(tmp_path):
    """BD-150: FileStore sync_all() picks up externally added files."""
    from brick.dashboard.file_store import FileStore

    store = FileStore(root=str(tmp_path))

    # Initially empty
    assert store.list("Team") == []

    # Add a file externally (simulating offline edit)
    team_dir = tmp_path / "teams"
    team_dir.mkdir(parents=True)
    (team_dir / "external-team.yaml").write_text(
        yaml.dump({
            "kind": "Team",
            "name": "external-team",
            "spec": {"adapter": "human"},
            "labels": {},
            "annotations": {},
        })
    )

    # sync_all should pick up the new file
    synced = store.sync_all()
    assert synced >= 1

    # list should now return the externally added resource
    teams = store.list("Team")
    assert len(teams) == 1
    assert teams[0].name == "external-team"
