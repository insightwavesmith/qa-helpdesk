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

    # codex (Phase 2 adapter)
    "codex",
}

# 셸 메타문자 패턴 — 인자에 포함되면 인젝션으로 간주
SHELL_METACHAR_PATTERNS: list[str] = [
    "|",     # 파이프
    ";",     # 명령 체이닝
    "&&",    # AND 체이닝
    "&",     # 백그라운드 / AND
    "$(",    # 서브셸
    "`",     # 백틱 명령 치환
    ">",     # 리다이렉트
    ">>",    # 어펜드 리다이렉트
    "<",     # 입력 리다이렉트
    "\n",   # 개행문자
]

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
    # Phase 0 보안 강화: 명령 치환/체이닝 차단
    "$(",      # command substitution
    ";",       # command chaining
    "&&",      # AND chaining
    "||",      # OR chaining
    "<(",      # process substitution (input)
    ">(",      # process substitution (output)
]


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

    # 환경변수 오버라이드 차단 (VAR=val 패턴)
    binary = cmd_parts[0]
    if "=" in binary and not binary.startswith("-"):
        return False, f"차단된 패턴: 환경변수 오버라이드 ({binary})"

    binary = binary.rsplit("/", 1)[-1]  # /usr/bin/npm → npm

    if binary not in ALLOWED_COMMANDS:
        return False, f"허용되지 않은 명령: {binary}"

    # 셸 메타문자 인젝션 검사 (개별 인자 단위)
    for part in cmd_parts:
        for meta in SHELL_METACHAR_PATTERNS:
            if meta in part:
                return False, f"차단된 셸 메타문자: {meta}"

    # 인자 패턴 검사
    full_cmd = " ".join(cmd_parts)
    for pattern in BLOCKED_ARGS:
        if pattern in full_cmd:
            return False, f"차단된 인자 패턴: {pattern}"

    return True, ""
