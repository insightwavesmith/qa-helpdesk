"""Workflow read + action routes."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException

from brick.dashboard.routes.schemas import GateAction

router = APIRouter()


def _get_deps():
    from brick.dashboard.server import file_store
    return file_store


def _workflows_dir() -> Path:
    store = _get_deps()
    return Path(store.root) / "runtime" / "workflows"


@router.get("/workflows")
def list_workflows():
    wf_dir = _workflows_dir()
    if not wf_dir.exists():
        return []
    results = []
    for d in sorted(wf_dir.iterdir()):
        state_file = d / "state.json"
        if d.is_dir() and state_file.exists():
            try:
                data = json.loads(state_file.read_text())
                results.append(data)
            except Exception:
                continue
    return results


@router.get("/workflows/{wf_id}")
def get_workflow(wf_id: str):
    state_file = _workflows_dir() / wf_id / "state.json"
    if not state_file.exists():
        raise HTTPException(status_code=404, detail=f"Workflow '{wf_id}' not found")
    return json.loads(state_file.read_text())


@router.get("/workflows/{wf_id}/events")
def list_events(wf_id: str):
    wf_dir = _workflows_dir() / wf_id
    if not wf_dir.exists():
        raise HTTPException(status_code=404, detail=f"Workflow '{wf_id}' not found")
    events_file = wf_dir / "events.jsonl"
    if not events_file.exists():
        return []
    events = []
    for line in events_file.read_text().strip().split("\n"):
        if line.strip():
            events.append(json.loads(line))
    return events


@router.get("/workflows/{wf_id}/blocks/{bid}")
def get_block_state(wf_id: str, bid: str):
    state_file = _workflows_dir() / wf_id / "state.json"
    if not state_file.exists():
        raise HTTPException(status_code=404, detail=f"Workflow '{wf_id}' not found")
    data = json.loads(state_file.read_text())
    blocks = data.get("status", {}).get("blocks", {})
    if bid not in blocks:
        raise HTTPException(status_code=404, detail=f"Block '{bid}' not found in workflow '{wf_id}'")
    return blocks[bid]


def _write_command(wf_id: str, bid: str, action: str, reason: str = ""):
    wf_dir = _workflows_dir() / wf_id
    if not wf_dir.exists():
        raise HTTPException(status_code=404, detail=f"Workflow '{wf_id}' not found")
    cmd_dir = wf_dir / "commands"
    cmd_dir.mkdir(parents=True, exist_ok=True)
    cmd = {
        "action": action,
        "block": bid,
        "reason": reason,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    cmd_file = cmd_dir / f"{action}.json"
    cmd_file.write_text(json.dumps(cmd))
    return cmd


@router.post("/workflows/{wf_id}/blocks/{bid}/approve")
def approve_gate(wf_id: str, bid: str, body: GateAction):
    cmd = _write_command(wf_id, bid, "approve", body.reason)
    return {"status": "approved", "command": cmd}


@router.post("/workflows/{wf_id}/blocks/{bid}/reject")
def reject_gate(wf_id: str, bid: str, body: GateAction):
    cmd = _write_command(wf_id, bid, "reject", body.reason)
    return {"status": "rejected", "command": cmd}


@router.post("/workflows/{wf_id}/cancel")
def cancel_workflow(wf_id: str):
    cmd = _write_command(wf_id, "", "cancel")
    return {"status": "cancelled", "command": cmd}


@router.post("/workflows/{wf_id}/resume")
def resume_workflow(wf_id: str):
    cmd = _write_command(wf_id, "", "resume")
    return {"status": "resumed", "command": cmd}
