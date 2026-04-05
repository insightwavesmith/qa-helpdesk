"""GAP-01~03: Design gap fix tests."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

# ── GAP-01: ISP separation — management methods in separate ABC ──


def test_gap01_isp_teamadapter_no_management_methods():
    """TeamAdapter should NOT have management methods."""
    from brick.adapters.base import TeamAdapter
    assert not hasattr(TeamAdapter, 'list_members')
    assert not hasattr(TeamAdapter, 'list_skills')
    assert not hasattr(TeamAdapter, 'list_mcp_servers')
    assert not hasattr(TeamAdapter, 'configure_mcp')
    assert not hasattr(TeamAdapter, 'get_model_config')
    assert not hasattr(TeamAdapter, 'set_model_config')
    assert not hasattr(TeamAdapter, 'get_team_status')


def test_gap01_isp_management_adapter_exists():
    """TeamManagementAdapter ABC exists with required methods."""
    from brick.adapters.management import TeamManagementAdapter
    assert hasattr(TeamManagementAdapter, 'list_members')
    assert hasattr(TeamManagementAdapter, 'add_member')
    assert hasattr(TeamManagementAdapter, 'remove_member')
    assert hasattr(TeamManagementAdapter, 'list_skills')
    assert hasattr(TeamManagementAdapter, 'get_skill_content')
    assert hasattr(TeamManagementAdapter, 'update_skill')
    assert hasattr(TeamManagementAdapter, 'list_mcp_servers')
    assert hasattr(TeamManagementAdapter, 'configure_mcp')
    assert hasattr(TeamManagementAdapter, 'get_model_config')
    assert hasattr(TeamManagementAdapter, 'set_model_config')
    assert hasattr(TeamManagementAdapter, 'get_team_status')


def test_gap01_claude_adapter_implements_both():
    """ClaudeAgentTeamsAdapter implements both TeamAdapter and TeamManagementAdapter."""
    from brick.adapters.claude_agent_teams import ClaudeAgentTeamsAdapter
    from brick.adapters.base import TeamAdapter
    from brick.adapters.management import TeamManagementAdapter
    adapter = ClaudeAgentTeamsAdapter()
    assert isinstance(adapter, TeamAdapter)
    assert isinstance(adapter, TeamManagementAdapter)


def test_gap01_human_adapter_no_management():
    """HumanAdapter does NOT implement TeamManagementAdapter."""
    from brick.adapters.human import HumanAdapter
    from brick.adapters.management import TeamManagementAdapter
    adapter = HumanAdapter()
    assert not isinstance(adapter, TeamManagementAdapter)


def test_gap01_webhook_adapter_no_management():
    """WebhookAdapter does NOT implement TeamManagementAdapter."""
    from brick.adapters.webhook import WebhookAdapter
    from brick.adapters.management import TeamManagementAdapter
    adapter = WebhookAdapter()
    assert not isinstance(adapter, TeamManagementAdapter)


# ── GAP-02: INV-6 — all blocks connected by links ──


def test_gap02_inv6_isolated_block_error():
    """Preset with isolated block should fail INV-6."""
    from brick.dashboard.validation_pipeline import ValidationPipeline
    from brick.dashboard.models.resource import BrickResource
    pipeline = ValidationPipeline()
    resource = BrickResource(
        kind="Preset", name="test",
        spec={
            "blocks": [{"id": "a"}, {"id": "b"}, {"id": "c"}],
            "links": [{"from": "a", "to": "b", "type": "sequential"}],
            "teams": {"a": {"adapter": "human"}, "b": {"adapter": "human"}, "c": {"adapter": "human"}},
        }
    )
    result = pipeline.validate(resource)
    inv6_errors = [e for e in result.errors if e.code == "INV-6"]
    assert len(inv6_errors) == 1
    assert "c" in inv6_errors[0].message


def test_gap02_inv6_single_block_no_links_ok():
    """Preset with single block and no links should pass INV-6."""
    from brick.dashboard.validation_pipeline import ValidationPipeline
    from brick.dashboard.models.resource import BrickResource
    pipeline = ValidationPipeline()
    resource = BrickResource(
        kind="Preset", name="test",
        spec={
            "blocks": [{"id": "only"}],
            "links": [],
            "teams": {"only": {"adapter": "human"}},
        }
    )
    result = pipeline.validate(resource)
    inv6_errors = [e for e in result.errors if e.code == "INV-6"]
    assert len(inv6_errors) == 0


def test_gap02_inv6_all_connected_ok():
    """Preset with all blocks connected should pass INV-6."""
    from brick.dashboard.validation_pipeline import ValidationPipeline
    from brick.dashboard.models.resource import BrickResource
    pipeline = ValidationPipeline()
    resource = BrickResource(
        kind="Preset", name="test",
        spec={
            "blocks": [{"id": "a"}, {"id": "b"}, {"id": "c"}],
            "links": [
                {"from": "a", "to": "b", "type": "sequential"},
                {"from": "b", "to": "c", "type": "sequential"},
            ],
            "teams": {"a": {"adapter": "human"}, "b": {"adapter": "human"}, "c": {"adapter": "human"}},
        }
    )
    result = pipeline.validate(resource)
    inv6_errors = [e for e in result.errors if e.code == "INV-6"]
    assert len(inv6_errors) == 0


# ── GAP-03: Learning Harness approve/reject/rollback ──


def test_gap03_reject_suggestion(tmp_path):
    """RuleSuggester.reject sets status=rejected with reason."""
    from brick.engine.learning import RuleSuggester
    suggester = RuleSuggester(tmp_path)
    (tmp_path / "sug-1.json").write_text(json.dumps({"id": "sug-1", "status": "pending", "pattern": "test"}))
    result = suggester.reject("sug-1", reason="not useful")
    assert result["status"] == "rejected"
    assert result["reject_reason"] == "not useful"


def test_gap03_rollback_approved(tmp_path):
    """RuleSuggester.rollback changes approved -> rolled_back."""
    from brick.engine.learning import RuleSuggester
    suggester = RuleSuggester(tmp_path)
    (tmp_path / "sug-2.json").write_text(json.dumps({"id": "sug-2", "status": "approved"}))
    result = suggester.rollback("sug-2")
    assert result["status"] == "rolled_back"


def test_gap03_rollback_non_approved_fails(tmp_path):
    """RuleSuggester.rollback on non-approved raises ValueError."""
    from brick.engine.learning import RuleSuggester
    suggester = RuleSuggester(tmp_path)
    (tmp_path / "sug-3.json").write_text(json.dumps({"id": "sug-3", "status": "pending"}))
    with pytest.raises(ValueError):
        suggester.rollback("sug-3")


def test_gap03_list_suggestions(tmp_path):
    """RuleSuggester.list_suggestions returns filtered list."""
    from brick.engine.learning import RuleSuggester
    suggester = RuleSuggester(tmp_path)
    (tmp_path / "s1.json").write_text(json.dumps({"id": "s1", "status": "pending"}))
    (tmp_path / "s2.json").write_text(json.dumps({"id": "s2", "status": "approved"}))
    all_sug = suggester.list_suggestions()
    assert len(all_sug) == 2
    pending = suggester.list_suggestions(status="pending")
    assert len(pending) == 1


# ── GAP-03 API tests ──


@pytest.fixture
def client_with_learning(tmp_path, monkeypatch):
    """FastAPI test client with learning routes and temp suggestion data."""
    monkeypatch.setenv("BRICK_DEV_MODE", "1")
    from brick.dashboard.server import create_app
    from brick.dashboard.routes.learning import set_suggester
    from brick.engine.learning import RuleSuggester

    suggester = RuleSuggester(tmp_path)
    # Pre-populate suggestions
    (tmp_path / "sug-1.json").write_text(json.dumps({"id": "sug-1", "status": "pending", "pattern": "test"}))
    (tmp_path / "sug-2.json").write_text(json.dumps({"id": "sug-2", "status": "pending", "pattern": "test2"}))

    bkit_dir = tmp_path / "bkit"
    (bkit_dir / "block-types").mkdir(parents=True)
    (bkit_dir / "teams").mkdir()
    (bkit_dir / "presets").mkdir()

    app = create_app(root=str(bkit_dir))
    set_suggester(suggester)
    yield TestClient(app)
    set_suggester(None)  # type: ignore[arg-type]


def test_gap03_api_list_proposals(client_with_learning):
    """GET /api/v1/learning/proposals -> list."""
    r = client_with_learning.get("/api/v1/learning/proposals")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_gap03_api_reject(client_with_learning):
    """POST /api/v1/learning/proposals/:id/reject -> 200."""
    r = client_with_learning.post("/api/v1/learning/proposals/sug-1/reject", json={"reason": "bad"})
    assert r.status_code == 200
    assert r.json()["status"] == "rejected"
    assert r.json()["reject_reason"] == "bad"


def test_gap03_api_rollback(client_with_learning):
    """POST /api/v1/learning/proposals/:id/rollback -> 200."""
    # First approve
    r1 = client_with_learning.post("/api/v1/learning/proposals/sug-2/approve")
    assert r1.status_code == 200
    # Then rollback
    r = client_with_learning.post("/api/v1/learning/proposals/sug-2/rollback")
    assert r.status_code == 200
    assert r.json()["status"] == "rolled_back"


def test_gap03_api_rollback_non_approved(client_with_learning):
    """POST rollback on pending -> 400."""
    r = client_with_learning.post("/api/v1/learning/proposals/sug-1/rollback")
    assert r.status_code == 400


def test_gap03_api_reject_not_found(client_with_learning):
    """POST reject on nonexistent -> 404."""
    r = client_with_learning.post("/api/v1/learning/proposals/nonexistent/reject", json={"reason": "x"})
    assert r.status_code == 404
