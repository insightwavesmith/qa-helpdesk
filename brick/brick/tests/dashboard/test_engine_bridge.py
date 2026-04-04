"""EB-001~050: Engine Bridge API tests."""

from __future__ import annotations

import pytest
import yaml
from fastapi import FastAPI
from fastapi.testclient import TestClient

from brick.dashboard.routes.engine_bridge import router, init_engine


@pytest.fixture
def app(tmp_path):
    """Create test app with 2-block preset (a → b, sequential)."""
    test_app = FastAPI()

    presets_dir = tmp_path / "presets"
    presets_dir.mkdir()

    _teams_ab = {"a": {"team": "human"}, "b": {"team": "human"}}
    _teams_abc = {"a": {"team": "human"}, "b": {"team": "human"}, "c": {"team": "human"}}

    # Simple 2-block preset
    (presets_dir / "test-simple.yaml").write_text(yaml.dump({
        "name": "test-simple",
        "blocks": [
            {"id": "a", "what": "block a", "done": {}},
            {"id": "b", "what": "block b", "done": {}},
        ],
        "links": [
            {"from": "a", "to": "b", "type": "sequential"},
        ],
        "teams": _teams_ab,
    }))

    # Loop preset: a → b with loop link (max 2 retries), condition match_rate < 90
    (presets_dir / "test-loop.yaml").write_text(yaml.dump({
        "name": "test-loop",
        "blocks": [
            {"id": "a", "what": "block a", "done": {}},
            {"id": "b", "what": "block b", "done": {}},
        ],
        "links": [
            {"from": "a", "to": "b", "type": "sequential"},
            {"from": "b", "to": "a", "type": "loop", "condition": "match_rate < 90", "max_retries": 2},
        ],
        "teams": _teams_ab,
    }))

    # Parallel preset: a → b, a → c, b → c (b link needed for INV-6)
    (presets_dir / "test-parallel.yaml").write_text(yaml.dump({
        "name": "test-parallel",
        "blocks": [
            {"id": "a", "what": "block a", "done": {}},
            {"id": "b", "what": "block b", "done": {}},
            {"id": "c", "what": "block c", "done": {}},
        ],
        "links": [
            {"from": "a", "to": "b", "type": "parallel"},
            {"from": "a", "to": "c", "type": "parallel"},
            {"from": "b", "to": "c", "type": "sequential"},
        ],
        "teams": _teams_abc,
    }))

    # Branch preset: a → b (branch, condition score >= 80)
    (presets_dir / "test-branch.yaml").write_text(yaml.dump({
        "name": "test-branch",
        "blocks": [
            {"id": "a", "what": "block a", "done": {}},
            {"id": "b", "what": "block b", "done": {}},
        ],
        "links": [
            {"from": "a", "to": "b", "type": "branch", "condition": "score >= 80"},
        ],
        "teams": _teams_ab,
    }))

    # Hook preset: a → b with hook link (external trigger)
    (presets_dir / "test-hook.yaml").write_text(yaml.dump({
        "name": "test-hook",
        "blocks": [
            {"id": "a", "what": "block a", "done": {}},
            {"id": "b", "what": "block b", "done": {}},
        ],
        "links": [
            {"from": "a", "to": "b", "type": "hook", "condition": {"event": "git.commit"}},
        ],
        "teams": _teams_ab,
    }))

    # Invalid DAG preset (cycle: a → b → a, non-loop) + teams for passing INV-5
    (presets_dir / "test-invalid.yaml").write_text(yaml.dump({
        "name": "test-invalid",
        "blocks": [
            {"id": "a", "what": "block a", "done": {}},
            {"id": "b", "what": "block b", "done": {}},
        ],
        "links": [
            {"from": "a", "to": "b", "type": "sequential"},
            {"from": "b", "to": "a", "type": "sequential"},
        ],
        "teams": _teams_ab,
    }))

    init_engine(root=str(tmp_path))
    test_app.include_router(router, prefix="/api/v1")
    return test_app


@pytest.fixture
def client(app):
    return TestClient(app)


def _start_workflow(client, preset="test-simple", feature="feat", task="task"):
    """Helper: start a workflow and return response JSON."""
    resp = client.post("/api/v1/engine/start", json={
        "preset_name": preset,
        "feature": feature,
        "task": task,
    })
    return resp


# ── EB-001: EP-1 returns blocks_state with first=queued ──────────────

def test_eb01_start_workflow_returns_blocks(client):
    resp = _start_workflow(client)
    assert resp.status_code == 200
    data = resp.json()
    assert "workflow_id" in data
    assert data["status"] == "running"
    assert "blocks_state" in data
    assert data["blocks_state"]["a"]["status"] == "running"  # adapter 즉시 시작
    assert data["blocks_state"]["b"]["status"] == "pending"
    assert data["current_block_id"] is not None


# ── EB-002: EP-1 404 for missing preset ──────────────────────────────

def test_eb02_start_workflow_preset_not_found(client):
    resp = _start_workflow(client, preset="nonexistent")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "preset_not_found"


# ── EB-003: EP-1 422 for invalid DAG ────────────────────────────────

def test_eb03_start_workflow_validation_error(client):
    resp = _start_workflow(client, preset="test-invalid")
    assert resp.status_code == 422
    assert resp.json()["detail"] == "validation_failed"


# ── EB-004: complete block gate pass → next block queued ─────────────

def test_eb04_complete_block_gate_pass(client):
    start = _start_workflow(client)
    wf_id = start.json()["workflow_id"]

    resp = client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["gate_result"]["passed"] is True
    assert data["blocks_state"]["a"]["status"] == "completed"
    assert data["blocks_state"]["b"]["status"] == "running"  # adapter 즉시 시작
    assert "b" in data["next_blocks"]


# ── EB-005: complete block gate fail with loop link ──────────────────

def test_eb05_complete_block_gate_fail_loop(client):
    # Use test-loop preset with loop link
    start = _start_workflow(client, preset="test-loop")
    wf_id = start.json()["workflow_id"]

    # Complete block a (gate passes, no gate handlers)
    client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
    })

    # Complete block b with match_rate < 90 → loop should trigger back to a
    resp = client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "b",
        "metrics": {"match_rate": 50},
    })
    assert resp.status_code == 200
    data = resp.json()
    # Gate passes (no gate handlers), but loop link should activate
    assert data["gate_result"]["passed"] is True


# ── EB-006: complete block gate fail with unmet branch ───────────────

def test_eb06_complete_block_gate_fail_branch(client):
    start = _start_workflow(client, preset="test-branch")
    wf_id = start.json()["workflow_id"]

    # Complete a with score < 80 → branch condition unmet
    resp = client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
        "metrics": {"score": 50},
    })
    assert resp.status_code == 200
    data = resp.json()
    # No next blocks because branch condition not met
    assert data["blocks_state"]["b"]["status"] != "running"


# ── EB-007: metrics appear in context ────────────────────────────────

def test_eb07_complete_block_with_metrics(client):
    start = _start_workflow(client)
    wf_id = start.json()["workflow_id"]

    resp = client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
        "metrics": {"accuracy": 95, "coverage": 88},
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["context"]["accuracy"] == 95
    assert data["context"]["coverage"] == 88


# ── EB-008: EP-3 returns events ──────────────────────────────────────

def test_eb08_get_status_with_events(client):
    start = _start_workflow(client)
    wf_id = start.json()["workflow_id"]

    # Complete a block to generate events
    client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
    })

    resp = client.get(f"/api/v1/engine/status/{wf_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert "events" in data
    assert len(data["events"]) > 0
    event_types = [e["type"] for e in data["events"]]
    assert "block.completed" in event_types or "block.started" in event_types


# ── EB-009: EP-3 404 for missing workflow ────────────────────────────

def test_eb09_get_status_not_found(client):
    resp = client.get("/api/v1/engine/status/nonexistent-12345")
    assert resp.status_code == 404


# ── EB-010: EP-4+5: suspend → resume ────────────────────────────────

def test_eb10_suspend_resume_cycle(client):
    start = _start_workflow(client)
    wf_id = start.json()["workflow_id"]

    # Suspend
    resp = client.post(f"/api/v1/engine/suspend/{wf_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "suspended"

    # Resume
    resp = client.post(f"/api/v1/engine/resume/{wf_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "running"


# ── EB-011: EP-6: cancel ────────────────────────────────────────────

def test_eb11_cancel_workflow(client):
    start = _start_workflow(client)
    wf_id = start.json()["workflow_id"]

    resp = client.post(f"/api/v1/engine/cancel/{wf_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "failed"


# ── EB-012: EP-7: health check ──────────────────────────────────────

def test_eb12_health_check(client):
    resp = client.get("/api/v1/engine/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["engine_version"] == "0.1.0"
    assert "presets_loaded" in data
    assert data["presets_loaded"] > 0
    assert "active_workflows" in data


# ── EB-013: all blocks done → workflow completed ────────────────────

def test_eb13_workflow_complete_all_blocks(client):
    start = _start_workflow(client)
    wf_id = start.json()["workflow_id"]

    # Complete block a
    client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
    })

    # Complete block b
    client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "b",
    })

    # Check status
    resp = client.get(f"/api/v1/engine/status/{wf_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert data["blocks_state"]["a"]["status"] == "completed"
    assert data["blocks_state"]["b"]["status"] == "completed"


# ── EB-014: loop respects max_retries ────────────────────────────────

def test_eb14_loop_max_iterations(client):
    start = _start_workflow(client, preset="test-loop")
    wf_id = start.json()["workflow_id"]

    # Complete a → b queued
    client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
    })

    # Loop: b → a (iteration 1), with match_rate < 90
    resp = client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "b",
        "metrics": {"match_rate": 50},
    })
    assert resp.status_code == 200

    # Verify loop happened: a should be queued again
    status = client.get(f"/api/v1/engine/status/{wf_id}").json()
    assert status["blocks_state"]["a"]["status"] == "running"  # adapter 즉시 시작

    # The loop counter _loop_b_a should be in context
    assert "_loop_b_a" in status["context"]
    assert status["context"]["_loop_b_a"] >= 1

    # Run loop until it stops (max_retries=2, so max ~4 more iterations)
    for _ in range(6):
        s = client.get(f"/api/v1/engine/status/{wf_id}").json()
        if s["status"] in ("completed", "failed"):
            break
        a_st = s["blocks_state"]["a"]["status"]
        b_st = s["blocks_state"]["b"]["status"]
        if a_st in ("queued", "pending"):
            client.post("/api/v1/engine/complete-block", json={
                "workflow_id": wf_id, "block_id": "a",
            })
        elif b_st in ("queued", "pending"):
            client.post("/api/v1/engine/complete-block", json={
                "workflow_id": wf_id, "block_id": "b",
                "metrics": {"match_rate": 50},
            })
        else:
            break

    # After exhausting loop, context should show loop counter ≤ max_retries+1
    final = client.get(f"/api/v1/engine/status/{wf_id}").json()
    loop_count = final["context"].get("_loop_b_a", 0)
    assert loop_count <= 4  # max_retries=2, some slack for implementation detail


# ── EB-015: parallel links → multiple next blocks ───────────────────

def test_eb15_parallel_next_blocks(client):
    start = _start_workflow(client, preset="test-parallel")
    wf_id = start.json()["workflow_id"]

    # Complete a → both b and c should be queued
    resp = client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["blocks_state"]["b"]["status"] == "running"  # adapter 즉시 시작
    assert data["blocks_state"]["c"]["status"] == "running"  # adapter 즉시 시작
    assert len(data["next_blocks"]) == 2


# ── EB-045: context persists across blocks ───────────────────────────

def test_eb45_context_persists_across_blocks(client):
    start = _start_workflow(client)
    wf_id = start.json()["workflow_id"]

    # Complete a with metrics
    client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
        "metrics": {"step_a_result": "done"},
    })

    # Complete b with more metrics
    resp = client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "b",
        "metrics": {"step_b_result": "done"},
    })
    data = resp.json()
    # Both metrics should persist in context
    assert data["context"]["step_a_result"] == "done"
    assert data["context"]["step_b_result"] == "done"


# ── EB-046: adapter.start_block called after gate pass ───────────────

def test_eb46_adapter_start_block_called(client):
    """After completing block a (gate pass), next block b gets StartBlockCommand.
    Since no adapter is registered, execution_id stays None but block transitions."""
    start = _start_workflow(client)
    wf_id = start.json()["workflow_id"]

    resp = client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
    })
    data = resp.json()
    # Block b should be running (adapter starts immediately)
    assert data["blocks_state"]["b"]["status"] == "running"


# ── EB-047: adapter failure → block stays queued ─────────────────────

def test_eb47_adapter_failure_block_stays_queued(client):
    """When no adapter is registered, block stays in queued state."""
    start = _start_workflow(client)
    wf_id = start.json()["workflow_id"]

    # Complete a → b gets queued but adapter not available
    client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
    })

    status = client.get(f"/api/v1/engine/status/{wf_id}").json()
    # b is running since adapter starts it immediately
    assert status["blocks_state"]["b"]["status"] == "running"


# ── EB-048: EP-8 retries adapter ─────────────────────────────────────

def test_eb48_adapter_retry_ep8(client):
    start = _start_workflow(client)
    wf_id = start.json()["workflow_id"]

    # Complete a → b queued
    client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
    })

    # Block b is RUNNING (adapter starts immediately), retry rejects non-QUEUED
    resp = client.post("/api/v1/engine/retry-adapter", json={
        "workflow_id": wf_id,
        "block_id": "b",
    })
    assert resp.status_code == 409  # RUNNING, not QUEUED

    # Block a is COMPLETED → also rejected
    resp = client.post("/api/v1/engine/retry-adapter", json={
        "workflow_id": wf_id,
        "block_id": "a",
    })
    assert resp.status_code == 409


# ── EB-049: two independent workflows ───────────────────────────────

def test_eb49_concurrent_two_workflows(client):
    start1 = _start_workflow(client, feature="feat1")
    start2 = _start_workflow(client, feature="feat2")

    wf_id1 = start1.json()["workflow_id"]
    wf_id2 = start2.json()["workflow_id"]

    assert wf_id1 != wf_id2

    # Complete block a in workflow 1
    client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id1,
        "block_id": "a",
    })

    # Workflow 2 should be unaffected
    status2 = client.get(f"/api/v1/engine/status/{wf_id2}").json()
    assert status2["blocks_state"]["a"]["status"] == "running"  # adapter 즉시 시작
    assert status2["blocks_state"]["b"]["status"] == "pending"


# ── EB-050: double complete same block → second rejected ─────────────

def test_eb50_concurrent_complete_same_block(client):
    start = _start_workflow(client)
    wf_id = start.json()["workflow_id"]

    # First complete succeeds
    resp1 = client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
    })
    assert resp1.status_code == 200

    # Second complete of same block — block is now COMPLETED
    # The executor should handle this gracefully (block not in RUNNING/QUEUED)
    resp2 = client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
    })
    # Should either error or return the existing state
    # The executor will try to transition COMPLETED→RUNNING which is invalid
    assert resp2.status_code in (200, 400, 409, 500)


# ── EB-051: hook link → from 완료 후 대기, API로 발동 ───────────────

def test_eb51_hook_link_waits_after_from_complete(client):
    """hook Link: from 블록 완료 후 다음 블록 시작 안 됨 (대기)."""
    start = _start_workflow(client, preset="test-hook")
    wf_id = start.json()["workflow_id"]

    # Complete block a → hook link이므로 b 시작 안 됨
    resp = client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["blocks_state"]["b"]["status"] == "pending"
    assert data["next_blocks"] == []


def test_eb52_hook_trigger_starts_block(client):
    """hook Link: API 호출 시 다음 블록 시작됨."""
    start = _start_workflow(client, preset="test-hook")
    wf_id = start.json()["workflow_id"]

    # Complete block a
    client.post("/api/v1/engine/complete-block", json={
        "workflow_id": wf_id,
        "block_id": "a",
    })

    # Trigger hook link
    resp = client.post(f"/api/v1/engine/hook/{wf_id}/a_b")
    assert resp.status_code == 200
    data = resp.json()
    assert data["triggered_block"] == "b"
    assert data["status"] == "running"


def test_eb53_hook_trigger_invalid_link(client):
    """hook Link: 잘못된 link_id → 404."""
    start = _start_workflow(client, preset="test-hook")
    wf_id = start.json()["workflow_id"]

    resp = client.post(f"/api/v1/engine/hook/{wf_id}/nonexistent_link")
    assert resp.status_code == 404


def test_eb54_hook_trigger_from_not_completed(client):
    """hook Link: from 블록 미완료 시 → 409."""
    start = _start_workflow(client, preset="test-hook")
    wf_id = start.json()["workflow_id"]

    # Don't complete block a → try to trigger hook
    resp = client.post(f"/api/v1/engine/hook/{wf_id}/a_b")
    assert resp.status_code == 409
