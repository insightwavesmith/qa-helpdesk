"""FAIL 3건 수정 검증 테스트."""
from __future__ import annotations


# ── P2-C02: Command allowlist 인터프리터 차단 ──────────────────────────

from brick.gates.command_allowlist import validate_command


class TestCommandAllowlistInterpreter:
    """인터프리터 인라인 코드 실행 차단 검증."""

    def test_p2c02_python_c_blocked(self):
        ok, reason = validate_command(["python", "-c", "import os; os.system('id')"])
        assert ok is False
        assert "인라인 코드" in reason

    def test_p2c02_python3_c_blocked(self):
        ok, reason = validate_command(["python3", "-c", "print('hello')"])
        assert ok is False

    def test_p2c02_node_e_blocked(self):
        ok, reason = validate_command(["node", "-e", "require('child_process').execSync('id')"])
        assert ok is False
        assert "인라인 코드" in reason

    def test_p2c02_node_eval_blocked(self):
        ok, reason = validate_command(["node", "--eval", "console.log(1)"])
        assert ok is False

    def test_p2c02_perl_e_blocked(self):
        ok, reason = validate_command(["perl", "-e", "system('id')"])
        assert ok is False

    def test_p2c02_python_m_allowed(self):
        ok, reason = validate_command(["python", "-m", "pytest"])
        assert ok is True
        assert reason == ""

    def test_p2c02_python_script_allowed(self):
        ok, reason = validate_command(["python", "script.py"])
        assert ok is True

    def test_p2c02_node_script_allowed(self):
        ok, reason = validate_command(["node", "index.js"])
        assert ok is True

    def test_p2c02_node_version_allowed(self):
        ok, reason = validate_command(["node", "--version"])
        assert ok is True

    def test_p2c02_existing_blocked_args_still_work(self):
        ok, reason = validate_command(["git", "--force", "push"])
        assert ok is False
        assert "--force" in reason
