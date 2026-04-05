"""Phase 0: Codex allowlist 추가 TDD (be_11~be_12)."""

from __future__ import annotations

import pytest

from brick.gates.command_allowlist import ALLOWED_COMMANDS, validate_command


def test_be11_codex_in_allowed_commands():
    """be_11: "codex" in ALLOWED_COMMANDS."""
    assert "codex" in ALLOWED_COMMANDS, "codex가 ALLOWED_COMMANDS에 없음"


def test_be12_codex_review_uncommitted_allowed():
    """be_12: codex review --uncommitted 허용."""
    allowed, reason = validate_command(["codex", "review", "--uncommitted"])
    assert allowed, f"codex review --uncommitted가 차단됨: {reason}"
