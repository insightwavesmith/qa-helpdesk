"""Review Block — specialized logic for human review blocks."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ChecklistItem:
    """Single checklist item for review."""

    text: str
    checked: bool = False
    checked_by: str = ""
    checked_at: float = 0.0


@dataclass
class ReviewComment:
    """Review comment."""

    author: str
    text: str
    created_at: float = field(default_factory=time.time)


@dataclass
class ReviewState:
    """Tracks the state of a review block."""

    block_id: str
    workflow_id: str
    reviewers: list[str] = field(default_factory=list)
    checklist: list[ChecklistItem] = field(default_factory=list)
    comments: list[ReviewComment] = field(default_factory=list)
    require_all_checked: bool = True
    status: str = "pending"  # pending | in_review | approved | rejected | changes_requested
    approved_by: str = ""
    rejected_by: str = ""
    reject_reason: str = ""
    artifacts: list[str] = field(default_factory=list)

    @property
    def checklist_progress(self) -> tuple[int, int]:
        """Returns (checked_count, total_count)."""
        checked = sum(1 for item in self.checklist if item.checked)
        return checked, len(self.checklist)

    @property
    def all_checked(self) -> bool:
        return all(item.checked for item in self.checklist) if self.checklist else True

    @property
    def can_approve(self) -> bool:
        """Approval requires all checklist items checked (if require_all_checked)."""
        if self.require_all_checked and not self.all_checked:
            return False
        return self.status in ("pending", "in_review")

    def to_dict(self) -> dict:
        return {
            "block_id": self.block_id,
            "workflow_id": self.workflow_id,
            "reviewers": self.reviewers,
            "checklist": [
                {
                    "text": c.text,
                    "checked": c.checked,
                    "checked_by": c.checked_by,
                    "checked_at": c.checked_at,
                }
                for c in self.checklist
            ],
            "comments": [
                {"author": c.author, "text": c.text, "created_at": c.created_at}
                for c in self.comments
            ],
            "require_all_checked": self.require_all_checked,
            "status": self.status,
            "approved_by": self.approved_by,
            "rejected_by": self.rejected_by,
            "reject_reason": self.reject_reason,
            "artifacts": self.artifacts,
        }


class ReviewBlockService:
    """Service for managing review block lifecycle."""

    def __init__(self) -> None:
        self._reviews: dict[str, ReviewState] = {}

    def _key(self, workflow_id: str, block_id: str) -> str:
        return f"{workflow_id}/{block_id}"

    def create_review(
        self,
        block_id: str,
        workflow_id: str,
        reviewers: list[str],
        checklist_texts: list[str],
        require_all_checked: bool = True,
        artifacts: list[str] | None = None,
    ) -> ReviewState:
        """Create a new review for a block."""
        key = self._key(workflow_id, block_id)
        state = ReviewState(
            block_id=block_id,
            workflow_id=workflow_id,
            reviewers=reviewers,
            checklist=[ChecklistItem(text=t) for t in checklist_texts],
            require_all_checked=require_all_checked,
            status="in_review",
            artifacts=artifacts or [],
        )
        self._reviews[key] = state
        return state

    def get_review(self, workflow_id: str, block_id: str) -> ReviewState | None:
        return self._reviews.get(self._key(workflow_id, block_id))

    def get_artifacts(
        self,
        workflow_id: str,
        block_id: str,
        workflow_blocks: dict[str, Any] | None = None,
    ) -> list[str]:
        """Get artifacts from the previous block (input.from_block)."""
        review = self.get_review(workflow_id, block_id)
        if review:
            return review.artifacts
        return []

    def check_item(
        self, workflow_id: str, block_id: str, index: int, checked_by: str
    ) -> ReviewState:
        """Toggle a checklist item."""
        review = self._reviews[self._key(workflow_id, block_id)]
        if 0 <= index < len(review.checklist):
            item = review.checklist[index]
            item.checked = True
            item.checked_by = checked_by
            item.checked_at = time.time()
        return review

    def add_comment(
        self, workflow_id: str, block_id: str, author: str, text: str
    ) -> ReviewComment:
        """Add a review comment."""
        review = self._reviews[self._key(workflow_id, block_id)]
        comment = ReviewComment(author=author, text=text)
        review.comments.append(comment)
        return comment

    def approve(self, workflow_id: str, block_id: str, reviewer: str) -> dict:
        """Approve the review. Returns result dict with status updates."""
        review = self._reviews[self._key(workflow_id, block_id)]
        if not review.can_approve:
            return {
                "success": False,
                "reason": (
                    "Cannot approve: checklist incomplete"
                    if review.require_all_checked and not review.all_checked
                    else "Invalid state"
                ),
            }
        review.status = "approved"
        review.approved_by = reviewer
        return {
            "success": True,
            "block_status": "completed",
            "approval": True,
        }

    def request_changes(
        self, workflow_id: str, block_id: str, reviewer: str, reason: str
    ) -> dict:
        """Request changes — triggers previous block re-execution."""
        review = self._reviews[self._key(workflow_id, block_id)]
        review.status = "changes_requested"
        review.reject_reason = reason
        return {
            "success": True,
            "action": "rerun_previous",
            "from_block": None,
            "reason": reason,
            "context_injection": {"reject_reason": reason, "reviewer": reviewer},
        }

    def reject(
        self, workflow_id: str, block_id: str, reviewer: str, reason: str
    ) -> dict:
        """Reject — suspends the workflow."""
        review = self._reviews[self._key(workflow_id, block_id)]
        review.status = "rejected"
        review.rejected_by = reviewer
        review.reject_reason = reason
        return {
            "success": True,
            "action": "suspend_workflow",
            "workflow_status": "suspended",
            "reason": reason,
        }

    def get_canvas_node_data(self, workflow_id: str, block_id: str) -> dict:
        """Get data for canvas node rendering."""
        review = self.get_review(workflow_id, block_id)
        if not review:
            return {}
        checked, total = review.checklist_progress
        return {
            "type": "reviewNode",
            "borderColor": "#8B5CF6",
            "reviewer": review.reviewers[0] if review.reviewers else "",
            "status": review.status,
            "checklist_progress": f"{checked}/{total}",
            "comment_count": len(review.comments),
        }
