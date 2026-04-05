"""Phase 0: Command Gate 보안 검증 TDD (be_07~be_10)."""

from __future__ import annotations

import pytest

from brick.gates.command_allowlist import validate_command


def test_be07_python_c_blocked():
    """be_07: python -c 차단."""
    allowed, reason = validate_command(["python", "-c", "print('pwned')"])
    assert not allowed, "python -c가 허용됨 — 차단 필요"
    assert "인라인" in reason or "차단" in reason


def test_be08_node_e_blocked():
    """be_08: node -e 차단."""
    allowed, reason = validate_command(["node", "-e", "process.exit(1)"])
    assert not allowed, "node -e가 허용됨 — 차단 필요"


def test_be09_bash_c_blocked():
    """be_09: bash -c 차단 (ALLOWED_COMMANDS에 없으므로)."""
    allowed, reason = validate_command(["bash", "-c", "rm -rf /"])
    assert not allowed, "bash가 허용됨 — ALLOWED_COMMANDS에 없어야 함"
    assert "허용되지 않은" in reason


def test_be10_python_m_pytest_allowed():
    """be_10: python -m pytest 허용."""
    allowed, reason = validate_command(["python", "-m", "pytest", "tests/"])
    assert allowed, f"python -m pytest가 차단됨: {reason}"
