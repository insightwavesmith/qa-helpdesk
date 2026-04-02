"""BD-18~47: Brick Dashboard REST API tests."""

from __future__ import annotations

import json

import pytest
import yaml
from fastapi.testclient import TestClient

from brick.dashboard.server import create_app


@pytest.fixture
def bkit_dir(tmp_path):
    """Create temp .bkit/ with sample data."""
    # Block types
    bt_dir = tmp_path / "block-types"
    bt_dir.mkdir()
    core_types = ["plan", "design", "do", "check", "act"]
    extra_types = ["review", "gate", "custom", "hotfix"]
    for name in core_types + extra_types:
        (bt_dir / f"{name}.yaml").write_text(yaml.dump({
            "kind": "BlockType",
            "name": name,
            "readonly": name in core_types,
            "spec": {
                "display_name": name.title(),
                "default_what": f"{name} work",
                "default_done": {"artifacts": []},
            },
            "labels": {},
            "annotations": {},
        }))

    # Teams
    teams_dir = tmp_path / "teams"
    teams_dir.mkdir()
    (teams_dir / "pm-team.yaml").write_text(yaml.dump({
        "kind": "Team",
        "name": "pm-team",
        "readonly": False,
        "spec": {
            "display_name": "PM팀",
            "adapter": "claude_agent_teams",
            "members": [{"name": "pm-lead", "role": "leader", "model": "opus"}],
            "skills": [{"name": "plan-writing", "path": ".bkit/skills/plan-writing.md"}],
            "mcp_servers": [
                {"name": "bkit-pdca", "enabled": True},
                {"name": "context7", "enabled": True},
            ],
            "model_config": {"default": "opus", "fallback": "sonnet"},
        },
        "labels": {"role": "planning"},
        "annotations": {},
    }))

    # Presets
    presets_dir = tmp_path / "presets"
    presets_dir.mkdir()
    (presets_dir / "t-pdca-l2.yaml").write_text(yaml.dump({
        "kind": "Preset",
        "name": "t-pdca-l2",
        "readonly": True,
        "spec": {
            "blocks": [{"id": "plan"}, {"id": "design"}, {"id": "do"}, {"id": "check"}, {"id": "act"}],
            "links": [
                {"from": "plan", "to": "design", "type": "sequential"},
                {"from": "design", "to": "do", "type": "sequential"},
            ],
            "teams": {
                "plan": {"adapter": "claude_agent_teams"},
                "design": {"adapter": "claude_agent_teams"},
                "do": {"adapter": "claude_code"},
                "check": {"adapter": "claude_code"},
                "act": {"adapter": "claude_code"},
            },
        },
        "labels": {"level": "l2"},
        "annotations": {},
    }))
    (presets_dir / "my-custom.yaml").write_text(yaml.dump({
        "kind": "Preset",
        "name": "my-custom",
        "readonly": False,
        "spec": {
            "blocks": [{"id": "step1"}],
            "links": [],
            "teams": {"step1": {"adapter": "human"}},
        },
        "labels": {},
        "annotations": {},
    }))

    return tmp_path


@pytest.fixture
def client(bkit_dir):
    app = create_app(root=str(bkit_dir))
    return TestClient(app)


# ── BD-18: GET /api/v1/block-types ──

def test_bd18_list_block_types(client):
    r = client.get("/api/v1/block-types")
    assert r.status_code == 200
    assert len(r.json()) >= 9


# ── BD-19: POST /api/v1/block-types ──

def test_bd19_create_block_type(client):
    r = client.post("/api/v1/block-types", json={
        "kind": "BlockType",
        "name": "deploy",
        "spec": {
            "display_name": "Deploy",
            "default_what": "deploy work",
            "default_done": {"artifacts": []},
        },
    })
    assert r.status_code == 201
    assert r.json()["name"] == "deploy"


# ── BD-20: PUT /api/v1/block-types/{name} ──

def test_bd20_update_block_type(client):
    r = client.put("/api/v1/block-types/custom", json={
        "kind": "BlockType",
        "name": "custom",
        "spec": {
            "display_name": "Updated Custom",
            "default_what": "updated work",
            "default_done": {"artifacts": []},
        },
    })
    assert r.status_code == 200
    assert r.json()["spec"]["display_name"] == "Updated Custom"


# ── BD-21: DELETE /api/v1/block-types/{name} ──

def test_bd21_delete_block_type(client):
    r = client.delete("/api/v1/block-types/custom")
    assert r.status_code == 204


# ── BD-22: DELETE readonly block type → 403 ──

def test_bd22_delete_readonly_block_type(client):
    r = client.delete("/api/v1/block-types/plan")
    assert r.status_code == 403


# ── BD-23: POST invalid block type → 400 ──

def test_bd23_create_invalid_block_type(client):
    r = client.post("/api/v1/block-types", json={
        "kind": "BlockType",
        "name": "bad",
        "spec": {},
    })
    assert r.status_code == 400
    assert "errors" in r.json()["detail"]


# ── BD-24: GET /api/v1/teams ──

def test_bd24_list_teams(client):
    r = client.get("/api/v1/teams")
    assert r.status_code == 200
    assert len(r.json()) >= 1


# ── BD-25: GET /api/v1/teams/{name}/members ──

def test_bd25_list_team_members(client):
    r = client.get("/api/v1/teams/pm-team/members")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1


# ── BD-26: POST /api/v1/teams/{name}/members ──

def test_bd26_add_team_member(client):
    r = client.post("/api/v1/teams/pm-team/members", json={
        "name": "pm-analyst",
        "role": "analyst",
        "model": "sonnet",
    })
    assert r.status_code == 201
    # Verify persisted
    r2 = client.get("/api/v1/teams/pm-team/members")
    assert any(m["name"] == "pm-analyst" for m in r2.json())


# ── BD-27: DELETE /api/v1/teams/{name}/members/{mid} ──

def test_bd27_delete_team_member(client):
    r = client.delete("/api/v1/teams/pm-team/members/pm-lead")
    assert r.status_code == 204


# ── BD-28: GET /api/v1/teams/{name}/skills ──

def test_bd28_list_team_skills(client):
    r = client.get("/api/v1/teams/pm-team/skills")
    assert r.status_code == 200


# ── BD-29: PUT /api/v1/teams/{name}/skills/{sid} ──

def test_bd29_update_team_skill(client):
    r = client.put("/api/v1/teams/pm-team/skills/plan-writing", json={
        "name": "plan-writing",
        "path": ".bkit/skills/updated.md",
    })
    assert r.status_code == 200


# ── BD-30: GET /api/v1/teams/{name}/mcp ──

def test_bd30_list_mcp(client):
    r = client.get("/api/v1/teams/pm-team/mcp")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ── BD-31: PUT /api/v1/teams/{name}/mcp/{sid} toggle ──

def test_bd31_toggle_mcp(client):
    r = client.put("/api/v1/teams/pm-team/mcp/bkit-pdca", json={"enabled": False})
    assert r.status_code == 200


# ── BD-32: GET /api/v1/teams/{name}/model ──

def test_bd32_get_model_config(client):
    r = client.get("/api/v1/teams/pm-team/model")
    assert r.status_code == 200
    assert "default" in r.json()


# ── BD-33: PUT /api/v1/teams/{name}/model ──

def test_bd33_update_model_config(client):
    r = client.put("/api/v1/teams/pm-team/model", json={
        "default": "sonnet",
        "fallback": "haiku",
    })
    assert r.status_code == 200


# ── BD-34: GET /api/v1/teams/{name}/status ──

def test_bd34_get_team_status(client):
    r = client.get("/api/v1/teams/pm-team/status")
    assert r.status_code == 200


# ── BD-35: GET /api/v1/presets ──

def test_bd35_list_presets(client):
    r = client.get("/api/v1/presets")
    assert r.status_code == 200
    presets = r.json()
    core = [p for p in presets if p["readonly"]]
    assert len(core) >= 1


# ── BD-36: PUT readonly preset → 403 ──

def test_bd36_update_readonly_preset(client):
    r = client.put("/api/v1/presets/t-pdca-l2", json={
        "kind": "Preset",
        "name": "t-pdca-l2",
        "spec": {"blocks": []},
    })
    assert r.status_code == 403


# ── BD-37: POST /api/v1/presets/{name}/validate ──

def test_bd37_validate_preset(client):
    r = client.post("/api/v1/presets/my-custom/validate")
    assert r.status_code == 200
    assert "valid" in r.json()


# ── BD-38: GET /api/v1/workflows ──

def test_bd38_list_workflows(client, bkit_dir):
    wf_dir = bkit_dir / "runtime" / "workflows" / "test-wf-001"
    wf_dir.mkdir(parents=True)
    (wf_dir / "state.json").write_text(json.dumps({
        "kind": "Workflow",
        "name": "test-wf-001",
        "spec": {"preset": "t-pdca-l2", "feature": "test", "task": "test-task"},
        "status": {"phase": "running", "current_block": "do"},
    }))
    r = client.get("/api/v1/workflows")
    assert r.status_code == 200


# ── BD-39: GET /api/v1/workflows/{id} ──

def test_bd39_get_workflow(client, bkit_dir):
    wf_dir = bkit_dir / "runtime" / "workflows" / "test-wf-002"
    wf_dir.mkdir(parents=True)
    (wf_dir / "state.json").write_text(json.dumps({
        "kind": "Workflow",
        "name": "test-wf-002",
        "spec": {"preset": "t-pdca-l2", "feature": "test2", "task": "test-task-2"},
        "status": {"phase": "completed", "blocks": {"plan": {"status": "completed"}}},
    }))
    r = client.get("/api/v1/workflows/test-wf-002")
    assert r.status_code == 200
    assert r.json()["status"]["phase"] == "completed"


# ── BD-40: GET /api/v1/workflows/{id}/events ──

def test_bd40_workflow_events(client, bkit_dir):
    wf_dir = bkit_dir / "runtime" / "workflows" / "test-wf-003"
    wf_dir.mkdir(parents=True)
    (wf_dir / "state.json").write_text(json.dumps({
        "kind": "Workflow",
        "name": "test-wf-003",
        "spec": {"task": "t"},
        "status": {},
    }))
    (wf_dir / "events.jsonl").write_text(
        json.dumps({"type": "workflow.start", "timestamp": "2026-04-02T10:00:00Z"}) + "\n"
        + json.dumps({"type": "block.started", "block": "plan", "timestamp": "2026-04-02T10:00:01Z"}) + "\n"
    )
    r = client.get("/api/v1/workflows/test-wf-003/events")
    assert r.status_code == 200
    assert len(r.json()) == 2


# ── BD-41: POST approve gate ──

def test_bd41_approve_gate(client, bkit_dir):
    wf_dir = bkit_dir / "runtime" / "workflows" / "test-wf-004"
    wf_dir.mkdir(parents=True)
    (wf_dir / "state.json").write_text(json.dumps({
        "kind": "Workflow",
        "name": "test-wf-004",
        "spec": {"task": "t"},
        "status": {"current_block": "check"},
    }))
    r = client.post(
        "/api/v1/workflows/test-wf-004/blocks/check/approve",
        json={"reason": "looks good"},
    )
    assert r.status_code == 200


# ── BD-42: POST reject gate ──

def test_bd42_reject_gate(client, bkit_dir):
    wf_dir = bkit_dir / "runtime" / "workflows" / "test-wf-005"
    wf_dir.mkdir(parents=True)
    (wf_dir / "state.json").write_text(json.dumps({
        "kind": "Workflow",
        "name": "test-wf-005",
        "spec": {"task": "t"},
        "status": {},
    }))
    r = client.post(
        "/api/v1/workflows/test-wf-005/blocks/check/reject",
        json={"reason": "needs rework"},
    )
    assert r.status_code == 200


# ── BD-43: POST /api/v1/validate/preset ──

def test_bd43_validate_preset_body(client):
    r = client.post("/api/v1/validate/preset", json={
        "kind": "Preset",
        "name": "test",
        "spec": {
            "blocks": [{"id": "a"}],
            "links": [],
            "teams": {"a": {"adapter": "human"}},
        },
    })
    assert r.status_code == 200
    assert r.json()["valid"] is True


# ── BD-44: POST /api/v1/validate/workflow-graph cycle ──

def test_bd44_validate_workflow_graph_cycle(client):
    r = client.post("/api/v1/validate/workflow-graph", json={
        "kind": "Preset",
        "name": "test-cycle",
        "spec": {
            "blocks": [{"id": "a"}, {"id": "b"}],
            "links": [
                {"from": "a", "to": "b", "type": "sequential"},
                {"from": "b", "to": "a", "type": "sequential"},
            ],
            "teams": {"a": {"adapter": "human"}, "b": {"adapter": "human"}},
        },
    })
    assert r.status_code == 200
    assert r.json()["valid"] is False


# ── BD-45: GET /api/v1/adapter-types ──

def test_bd45_adapter_types(client):
    r = client.get("/api/v1/adapter-types")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ── BD-46: GET /api/v1/gate-types ──

def test_bd46_gate_types(client):
    r = client.get("/api/v1/gate-types")
    assert r.status_code == 200


# ── BD-47: GET /api/v1/link-types ──

def test_bd47_link_types(client):
    r = client.get("/api/v1/link-types")
    assert r.status_code == 200
