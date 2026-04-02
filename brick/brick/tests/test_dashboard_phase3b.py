"""BD-132~140: Review Block 전용 로직 tests."""

from __future__ import annotations

from brick.dashboard.review_block import (
    ChecklistItem,
    ReviewBlockService,
    ReviewComment,
    ReviewState,
)


def _make_service_with_review(
    checklist_texts: list[str] | None = None,
    artifacts: list[str] | None = None,
    require_all_checked: bool = True,
    reviewers: list[str] | None = None,
    block_id: str = "review-1",
    workflow_id: str = "wf-1",
) -> tuple[ReviewBlockService, ReviewState]:
    """Helper: create a service and a review in one call."""
    svc = ReviewBlockService()
    state = svc.create_review(
        block_id=block_id,
        workflow_id=workflow_id,
        reviewers=reviewers or ["coo"],
        checklist_texts=checklist_texts or [],
        require_all_checked=require_all_checked,
        artifacts=artifacts,
    )
    return svc, state


# ── BD-132: artifacts from previous block ─────────────────────────
def test_bd132_review_displays_artifacts_from_previous_block():
    """Review block displays artifacts from previous block (input.from_block)."""
    svc, state = _make_service_with_review(artifacts=["design.md", "tdd.md"])

    assert state.artifacts == ["design.md", "tdd.md"]
    assert svc.get_artifacts("wf-1", "review-1") == ["design.md", "tdd.md"]


# ── BD-133: checklist rendering + check state persistence ─────────
def test_bd133_checklist_rendering_and_persistence():
    """Checklist items render and check state persists across get_review calls."""
    svc, state = _make_service_with_review(
        checklist_texts=["코드 품질", "TDD 커버리지", "보안 점검"],
    )

    assert len(state.checklist) == 3
    assert state.checklist[0].text == "코드 품질"
    assert state.checklist[0].checked is False

    svc.check_item("wf-1", "review-1", index=0, checked_by="coo")

    # State persists across get_review
    fetched = svc.get_review("wf-1", "review-1")
    assert fetched is not None
    assert fetched.checklist[0].checked is True
    assert fetched.checklist[0].checked_by == "coo"
    assert fetched.checklist[0].checked_at > 0


# ── BD-134: approve disabled when checklist incomplete ────────────
def test_bd134_approve_disabled_when_checklist_incomplete():
    """Approve is disabled when require_all_checked=True and items unchecked."""
    svc, state = _make_service_with_review(
        checklist_texts=["항목1", "항목2"],
        require_all_checked=True,
    )

    # Check only 1 of 2
    svc.check_item("wf-1", "review-1", index=0, checked_by="coo")

    assert state.can_approve is False

    result = svc.approve("wf-1", "review-1", reviewer="coo")
    assert result["success"] is False
    assert "checklist" in result["reason"].lower()


# ── BD-135: comment adds + context injection ──────────────────────
def test_bd135_comment_adds_and_context_injection():
    """Comments are added and request_changes includes context_injection."""
    svc, state = _make_service_with_review(
        checklist_texts=["체크"],
    )

    comment = svc.add_comment("wf-1", "review-1", author="coo", text="TDD 부족")
    assert isinstance(comment, ReviewComment)
    assert comment.author == "coo"
    assert comment.text == "TDD 부족"
    assert len(state.comments) == 1

    result = svc.request_changes("wf-1", "review-1", reviewer="coo", reason="TDD 보충 필요")
    assert "context_injection" in result
    assert result["context_injection"]["reject_reason"] == "TDD 보충 필요"


# ── BD-136: approve → done.approval=true → completed ─────────────
def test_bd136_approve_completes_block():
    """Approve with all items checked → success, completed, approval=True."""
    svc, state = _make_service_with_review(
        checklist_texts=["항목1", "항목2"],
    )

    svc.check_item("wf-1", "review-1", index=0, checked_by="coo")
    svc.check_item("wf-1", "review-1", index=1, checked_by="coo")

    result = svc.approve("wf-1", "review-1", reviewer="coo")
    assert result["success"] is True
    assert result["block_status"] == "completed"
    assert result["approval"] is True

    fetched = svc.get_review("wf-1", "review-1")
    assert fetched.status == "approved"
    assert fetched.approved_by == "coo"


# ── BD-137: request changes → previous block re-execution ────────
def test_bd137_request_changes_reruns_previous():
    """request_changes returns rerun_previous action with reason & context."""
    svc, _state = _make_service_with_review()

    result = svc.request_changes(
        "wf-1", "review-1", reviewer="coo", reason="TDD 보충 필요",
    )

    assert result["success"] is True
    assert result["action"] == "rerun_previous"
    assert result["reason"] == "TDD 보충 필요"
    assert result["context_injection"]["reviewer"] == "coo"

    fetched = svc.get_review("wf-1", "review-1")
    assert fetched.status == "changes_requested"


# ── BD-138: reject → workflow suspended ───────────────────────────
def test_bd138_reject_suspends_workflow():
    """Reject suspends workflow with reason."""
    svc, _state = _make_service_with_review()

    result = svc.reject("wf-1", "review-1", reviewer="coo", reason="설계 부적합")

    assert result["success"] is True
    assert result["action"] == "suspend_workflow"
    assert result["workflow_status"] == "suspended"
    assert result["reason"] == "설계 부적합"

    fetched = svc.get_review("wf-1", "review-1")
    assert fetched.status == "rejected"
    assert fetched.rejected_by == "coo"
    assert fetched.reject_reason == "설계 부적합"


# ── BD-139: canvas node purple border ────────────────────────────
def test_bd139_canvas_node_purple_border():
    """Canvas node uses purple border #8B5CF6 and reviewNode type."""
    svc, _state = _make_service_with_review(reviewers=["coo"])

    data = svc.get_canvas_node_data("wf-1", "review-1")

    assert data["type"] == "reviewNode"
    assert data["borderColor"] == "#8B5CF6"
    assert data["reviewer"] == "coo"
    assert data["status"] == "in_review"


# ── BD-140: checklist progress display in node ───────────────────
def test_bd140_checklist_progress_in_canvas_node():
    """Canvas node shows checklist progress and comment count."""
    svc, _state = _make_service_with_review(
        checklist_texts=["A", "B", "C", "D"],
    )

    svc.check_item("wf-1", "review-1", index=0, checked_by="pm")
    svc.check_item("wf-1", "review-1", index=2, checked_by="pm")
    svc.add_comment("wf-1", "review-1", author="pm", text="확인")

    data = svc.get_canvas_node_data("wf-1", "review-1")

    assert data["checklist_progress"] == "2/4"
    assert data["comment_count"] == 1
