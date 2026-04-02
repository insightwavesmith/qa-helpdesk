"""Learning Harness REST API routes — proposals approve/reject/rollback."""

from __future__ import annotations

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


@router.get("/learning/proposals")
def list_proposals(status: str | None = None):
    return _get_suggester().list_suggestions(status=status)


@router.get("/learning/proposals/{proposal_id}")
def get_proposal(proposal_id: str):
    path = _get_suggester().suggestions_dir / f"{proposal_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Proposal '{proposal_id}' not found")
    import json
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


@router.post("/learning/proposals/{proposal_id}/rollback")
def rollback_proposal(proposal_id: str):
    try:
        return _get_suggester().rollback(proposal_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Proposal '{proposal_id}' not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
