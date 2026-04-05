"""
Codex/AI 전용 Command Gate 허용 명령 allowlist.
AI 어댑터(claude, codex 등)가 실행하는 명령 제한.
"""

from brick.gates.command_allowlist import BLOCKED_ARGS, SHELL_METACHAR_PATTERNS

# AI/Codex 전용 허용 명령
CODEX_ALLOWED_COMMANDS: set[str] = {
    # AI 도구
    "claude",
    "codex",

    # 빌드/테스트 (제한적)
    "npm",
    "npx",
    "node",
    "python",
    "pytest",

    # 파일 조회 (읽기 전용)
    "cat",
    "ls",
    "find",
    "grep",
    "head",
    "tail",
    "wc",
    "diff",

    # git (읽기 위주)
    "git",

    # brick 전용
    "brick-check",
    "brick-lint",
}


def validate_codex_command(cmd_parts: list[str]) -> tuple[bool, str]:
    """
    codex/AI 전용 allowlist 기반 명령 검증.

    Args:
        cmd_parts: shlex.split()된 명령 리스트

    Returns:
        (허용 여부, 거부 사유)
    """
    if not cmd_parts:
        return False, "빈 명령"

    # 환경변수 오버라이드 차단
    binary = cmd_parts[0]
    if "=" in binary and not binary.startswith("-"):
        return False, f"차단된 패턴: 환경변수 오버라이드 ({binary})"

    binary = binary.rsplit("/", 1)[-1]

    if binary not in CODEX_ALLOWED_COMMANDS:
        return False, f"허용되지 않은 codex 명령: {binary}"

    # 셸 메타문자 인젝션 검사
    for part in cmd_parts:
        for meta in SHELL_METACHAR_PATTERNS:
            if meta in part:
                return False, f"차단된 셸 메타문자: {meta}"

    # BLOCKED_ARGS 패턴 검사
    full_cmd = " ".join(cmd_parts)
    for pattern in BLOCKED_ARGS:
        if pattern in full_cmd:
            return False, f"차단된 인자 패턴: {pattern}"

    return True, ""
