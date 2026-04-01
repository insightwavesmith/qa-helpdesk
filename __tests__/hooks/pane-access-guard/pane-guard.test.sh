#!/bin/bash
# pane-guard.test.sh — C-01 ~ C-20
# TDD for .bkit/hooks/pane-access-guard.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
HOOK="$PROJECT_DIR/.bkit/hooks/pane-access-guard.sh"

PASS=0; FAIL=0; TOTAL=20

run_test() {
    local ID="$1" DESC="$2" EXPECTED_EXIT="$3"
    shift 3
    local ACTUAL_EXIT=0
    eval "$@" >/dev/null 2>&1 || ACTUAL_EXIT=$?

    if [ "$ACTUAL_EXIT" -eq "$EXPECTED_EXIT" ]; then
        echo "  ✅ $ID: $DESC"; PASS=$((PASS+1))
    else
        echo "  ❌ $ID: $DESC (expected exit $EXPECTED_EXIT, got $ACTUAL_EXIT)"; FAIL=$((FAIL+1))
    fi
}

run_test_stderr() {
    local ID="$1" DESC="$2" PATTERN="$3"
    shift 3
    local STDERR_OUT
    STDERR_OUT=$(eval "$@" 2>&1 >/dev/null || true)

    if echo "$STDERR_OUT" | grep -q "$PATTERN"; then
        echo "  ✅ $ID: $DESC"; PASS=$((PASS+1))
    else
        echo "  ❌ $ID: $DESC (stderr에 '$PATTERN' 없음, got: $STDERR_OUT)"; FAIL=$((FAIL+1))
    fi
}

# 헬퍼: hook에 JSON stdin 전달
run_hook() {
    local TOOL_NAME="$1" COMMAND="$2" CALLER_SESSION="$3" CALLER_PANE="$4" USE_TMUX="${5-fake}"
    local ESCAPED_COMMAND
    ESCAPED_COMMAND=$(echo "$COMMAND" | sed 's/"/\\"/g')
    echo "{\"tool_name\":\"$TOOL_NAME\",\"tool_input\":{\"command\":\"$ESCAPED_COMMAND\"}}" | \
        TMUX="$USE_TMUX" MOCK_CALLER_SESSION="$CALLER_SESSION" MOCK_CALLER_PANE="$CALLER_PANE" \
        bash "$HOOK"
}

echo "=== pane-access-guard.sh TDD (C-01 ~ C-20) ==="
echo ""

# ──────────────────────────────────────
# C-01~C-05: 차단 케이스
# ──────────────────────────────────────
echo "--- 차단 케이스 (C-01~C-05) ---"

run_test "C-01" "COO→CTO팀원 차단" 2 \
    'run_hook "Bash" "tmux send-keys -t sdk-cto.1 \"ls\"" "sdk-pm" "0"'

run_test "C-02" "타팀리더→CTO팀원2 차단" 2 \
    'run_hook "Bash" "tmux send-keys -t sdk-cto.2 \"ls\"" "other" "0"'

run_test "C-03" "타팀→PM팀원 차단" 2 \
    'run_hook "Bash" "tmux send-keys -t sdk-pm.1 \"ls\"" "other" "0"'

run_test "C-04" "PM리더→CTO팀원 차단" 2 \
    'run_hook "Bash" "tmux send-keys -t sdk-cto.1 \"ls\"" "sdk-pm" "0"'

run_test "C-05" "팀원→다른팀원 차단" 2 \
    'run_hook "Bash" "tmux send-keys -t sdk-cto.2 \"ls\"" "sdk-cto" "1"'

echo ""

# ──────────────────────────────────────
# C-06~C-10: 허용 케이스
# ──────────────────────────────────────
echo "--- 허용 케이스 (C-06~C-10) ---"

run_test "C-06" "COO→CTO리더(pane 0) 허용" 0 \
    'run_hook "Bash" "tmux send-keys -t sdk-cto.0 \"ls\"" "other" "0"'

run_test "C-07" "CTO리더→자기팀원1 허용" 0 \
    'run_hook "Bash" "tmux send-keys -t sdk-cto.1 \"ls\"" "sdk-cto" "0"'

run_test "C-08" "CTO리더→자기팀원3 허용" 0 \
    'run_hook "Bash" "tmux send-keys -t sdk-cto.3 \"text\"" "sdk-cto" "0"'

run_test "C-09" "pane미지정 허용" 0 \
    'run_hook "Bash" "tmux send-keys -t sdk-cto \"ls\"" "other" "0"'

run_test "C-10" "tmux아닌명령 허용" 0 \
    'run_hook "Bash" "echo hello" "anyone" "0"'

echo ""

# ──────────────────────────────────────
# C-11~C-15: 변형 구문
# ──────────────────────────────────────
echo "--- 변형 구문 (C-11~C-15) ---"

run_test "C-11" "window:pane 구문 차단" 2 \
    'run_hook "Bash" "tmux send-keys -t sdk-cto:0.2 \"text\"" "other" "0"'

run_test "C-12" "따옴표 타겟 차단" 2 \
    'run_hook "Bash" "tmux send-keys -t \"sdk-cto.1\" \"text\"" "other" "0"'

run_test "C-13" "-t 뒤위치 차단" 2 \
    'run_hook "Bash" "tmux send-keys \"text\" -t sdk-cto.1" "other" "0"'

run_test "C-14" "send-key 단수 차단" 2 \
    'run_hook "Bash" "tmux send-key -t sdk-cto.1 \"text\"" "other" "0"'

run_test "C-15" "비-tmux환경 허용" 0 \
    'run_hook "Bash" "tmux send-keys -t sdk-cto.1 \"text\"" "other" "0" ""'

echo ""

# ──────────────────────────────────────
# C-16~C-18: 리다이렉트 안내 (stderr 검증)
# ──────────────────────────────────────
echo "--- 리다이렉트 안내 (C-16~C-18) ---"

run_test_stderr "C-16" "stderr에 리더 pane 안내" "sdk-cto.0" \
    'run_hook "Bash" "tmux send-keys -t sdk-cto.1 \"ls\"" "other" "0"'

run_test_stderr "C-17" "stderr에 A0-7 포함" "A0-7" \
    'run_hook "Bash" "tmux send-keys -t sdk-cto.1 \"ls\"" "other" "0"'

run_test_stderr "C-18" "stderr에 원본 command 포함" "send-keys" \
    'run_hook "Bash" "tmux send-keys -t sdk-cto.1 \"ls\"" "other" "0"'

echo ""

# ──────────────────────────────────────
# C-19~C-20: 비-Bash tool
# ──────────────────────────────────────
echo "--- 비-Bash tool (C-19~C-20) ---"

run_test "C-19" "Edit tool 허용" 0 \
    'echo "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"test.ts\"}}" | TMUX="fake" bash "$HOOK"'

run_test "C-20" "Write tool 허용" 0 \
    'echo "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"test.ts\"}}" | TMUX="fake" bash "$HOOK"'

echo ""

# ──────────────────────────────────────
# 결과 요약
# ──────────────────────────────────────
echo "=== 결과: $PASS/$TOTAL PASS, $FAIL FAIL ==="

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
