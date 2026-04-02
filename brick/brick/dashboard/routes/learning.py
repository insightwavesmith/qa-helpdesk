"""Learning Harness REST API routes — proposals approve/reject/rollback/modify/history/stats/detect."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from brick.engine.learning import RuleSuggester

router = APIRouter()

_suggester: RuleSuggester | None = None


def _get_suggester() -> RuleSuggester:
    global _suggester
    if _suggester is None:
        _suggester = RuleSuggester(Path(".bkit/runtime/suggestions"))
    return _suggester


def set_suggester(suggester: RuleSuggester) -> None:
    """Override suggester for testing."""
    global _suggester
    _suggester = suggester


class RejectRequest(BaseModel):
    reason: str = ""


class ModifyRequest(BaseModel):
    modified_diff: str


@router.get("/learning/proposals")
def list_proposals(status: str | None = None):
    return _get_suggester().list_suggestions(status=status)


@router.get("/learning/proposals/{proposal_id}")
def get_proposal(proposal_id: str):
    path = _get_suggester().suggestions_dir / f"{proposal_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Proposal '{proposal_id}' not found")
    return json.loads(path.read_text())


@router.post("/learning/proposals/{proposal_id}/approve")
def approve_proposal(proposal_id: str):
    try:
        return _get_suggester().approve(proposal_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Proposal '{proposal_id}' not found")


@router.post("/learning/proposals/{proposal_id}/reject")
def reject_proposal(proposal_id: str, body: RejectRequest):
    try:
        return _get_suggester().reject(proposal_id, reason=body.reason)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Proposal '{proposal_id}' not found")


@router.post("/learning/proposals/{proposal_id}/modify")
def modify_proposal(proposal_id: str, body: ModifyRequest):
    """Set modified_diff on proposal, status='modified'."""
    suggester = _get_suggester()
    path = suggester.suggestions_dir / f"{proposal_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Proposal '{proposal_id}' not found")
    data = json.loads(path.read_text())
    data["modified_diff"] = body.modified_diff
    data["status"] = "modified"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    return data


@router.get("/learning/history")
def get_history():
    """Return all proposals sorted by id (approved + rejected + rolled_back)."""
    suggester = _get_suggester()
    all_proposals = suggester.list_suggestions()
    history = [p for p in all_proposals if p.get("status") in ("approved", "rejected", "rolled_back", "modified")]
    return history


@router.get("/learning/stats")
def get_stats():
    """Return counts by rule type and status."""
    suggester = _get_suggester()
    all_proposals = suggester.list_suggestions()

    block_rules = sum(1 for p in all_proposals if p.get("suggested_rule", {}).get("type") == "gate_handler")
    team_rules = sum(1 for p in all_proposals if p.get("suggested_rule", {}).get("type") == "adapter_fallback")
    link_adjustments = sum(1 for p in all_proposals if p.get("suggested_rule", {}).get("type") == "link_adjustment")
    pending_count = sum(1 for p in all_proposals if p.get("status") == "pending")

    return {
        "total_proposals": len(all_proposals),
        "pending_count": pending_count,
        "block_rules": block_rules,
        "team_rules": team_rules,
        "link_adjustments": link_adjustments,
    }


@router.post("/learning/detect")
def trigger_detect():
    """Manual pattern detection trigger — return status."""
    suggester = _get_suggester()
    proposals = suggester.list_suggestions(status="pending")
    return {"status": "detected", "proposals": proposals}


@router.post("/learning/proposals/{proposal_id}/rollback")
def rollback_proposal(proposal_id: str):
    try:
        return _get_suggester().rollback(proposal_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Proposal '{proposal_id}' not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
