"""
Command Gate 실행 허용 명령 allowlist.
이 목록에 없는 명령은 거부.
"""

# 허용 명령 목록 — 절대 경로 또는 명령명
ALLOWED_COMMANDS: set[str] = {
    # 빌드/테스트
    "npm",
    "npx",
    "node",
    "python",
    "pytest",
    "vitest",

    # git
    "git",

    # 파일 조회 (읽기 전용)
    "cat",
    "ls",
    "find",
    "grep",
    "wc",
    "head",
    "tail",
    "diff",

    # 프로세스
    "echo",
    "true",
    "false",
    "test",
    "sleep",

    # brick 전용
    "brick-check",
    "brick-lint",

    # AI 코드 리뷰
    "codex",
}

# 절대 차단 — allowlist에 있어도 이 인자 패턴이 있으면 거부
BLOCKED_ARGS: list[str] = [
    "--force",
    "-rf",
    "rm ",
    "sudo",
    "chmod",
    "chown",
    "mkfs",
    "dd ",
    "> /dev",
    "| sh",
    "| bash",
    "$((",
    "`",
]

# 인터프리터 인라인 코드 실행 차단
INTERPRETER_COMMANDS: set[str] = {"python", "python3", "node", "perl", "ruby", "php"}
INTERPRETER_BLOCKED_ARGS: set[str] = {"-c", "-e", "-r", "--eval"}


def validate_command(cmd_parts: list[str]) -> tuple[bool, str]:
    """
    allowlist 기반 명령 검증.

    Args:
        cmd_parts: shlex.split()된 명령 리스트

    Returns:
        (허용 여부, 거부 사유)
    """
    if not cmd_parts:
        return False, "빈 명령"

    binary = cmd_parts[0].rsplit("/", 1)[-1]  # /usr/bin/npm → npm

    if binary not in ALLOWED_COMMANDS:
        return False, f"허용되지 않은 명령: {binary}"

    # 인터프리터 인라인 코드 실행 차단
    if binary in INTERPRETER_COMMANDS and len(cmd_parts) > 1:
        first_arg = cmd_parts[1]
        if first_arg in INTERPRETER_BLOCKED_ARGS:
            return False, f"인터프리터 인라인 코드 실행 차단: {binary} {first_arg}"

    # 인자 패턴 검사
    full_cmd = " ".join(cmd_parts)
    for pattern in BLOCKED_ARGS:
        if pattern in full_cmd:
            return False, f"차단된 인자 패턴: {pattern}"

    return True, ""
