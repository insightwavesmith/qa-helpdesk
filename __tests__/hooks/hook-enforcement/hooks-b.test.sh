#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PASS=0; FAIL=0; TOTAL=21

TMP_DIR=$(mktemp -d)
trap "rm -r $TMP_DIR" EXIT

run_test() {
    local ID="$1" DESC="$2" EXPECTED="$3"; shift 3
    local ACTUAL=0
    eval "$@" >/dev/null 2>&1 || ACTUAL=$?
    if [ "$ACTUAL" -eq "$EXPECTED" ]; then
        echo "  ✅ $ID: $DESC"; PASS=$((PASS+1))
    else
        echo "  ❌ $ID: $DESC (expected $EXPECTED, got $ACTUAL)"; FAIL=$((FAIL+1))
    fi
}

run_test_stderr() {
    local ID="$1" DESC="$2" PATTERN="$3"; shift 3
    local STDERR_OUT
    STDERR_OUT=$(eval "$@" 2>&1 >/dev/null || true)
    if echo "$STDERR_OUT" | grep -q "$PATTERN"; then
        echo "  ✅ $ID: $DESC"; PASS=$((PASS+1))
    else
        echo "  ❌ $ID: $DESC (stderr에 '$PATTERN' 없음, got: $STDERR_OUT)"; FAIL=$((FAIL+1))
    fi
}

make_input() { echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"$(echo "$1" | sed 's/"/\\"/g')\"}}"; }

HOOK_DIR="$PROJECT_DIR/.bkit/hooks"

# ═══════════════════════════════════════════
echo "=== Hook #5: validate-task-fields.sh ==="
# ═══════════════════════════════════════════

HOOK5="$HOOK_DIR/validate-task-fields.sh"

# C-43: L2 + sdk-cto → exit 0
TASK_C43="$TMP_DIR/TASK-C43.md"
cat > "$TASK_C43" << 'EOF'
## TASK-C43
L2 기능 개발
담당: sdk-cto
EOF
run_test "C-43" "L2 + sdk-cto → exit 0" 0 \
    "make_input 'bash spawn.sh' | TMUX=fake TASK_DIR='$TMP_DIR' bash '$HOOK5'"

# C-44: 레벨 누락 → exit 2
TASK_C44="$TMP_DIR/TASK-C44.md"
cat > "$TASK_C44" << 'EOF'
## TASK-C44
기능 개발
담당: sdk-cto
EOF
rm -f "$TMP_DIR"/TASK-C43.md
run_test "C-44" "레벨 누락 → exit 2" 2 \
    "make_input 'bash spawn.sh' | TMUX=fake TASK_DIR='$TMP_DIR' bash '$HOOK5'"

# C-45: 담당팀 누락 → exit 2
TASK_C45="$TMP_DIR/TASK-C45.md"
rm -f "$TMP_DIR"/TASK-C44.md
cat > "$TASK_C45" << 'EOF'
## TASK-C45
L2 기능 개발
담당: 미정
EOF
run_test "C-45" "담당팀 누락 → exit 2" 2 \
    "make_input 'bash spawn.sh' | TMUX=fake TASK_DIR='$TMP_DIR' bash '$HOOK5'"

# C-46: 둘 다 누락 → exit 2
TASK_C46="$TMP_DIR/TASK-C46.md"
rm -f "$TMP_DIR"/TASK-C45.md
cat > "$TASK_C46" << 'EOF'
## TASK-C46
기능 개발
담당: 미정
EOF
run_test "C-46" "둘 다 누락 → exit 2" 2 \
    "make_input 'bash spawn.sh' | TMUX=fake TASK_DIR='$TMP_DIR' bash '$HOOK5'"

# C-47: L0 + sdk-cto → exit 0
TASK_C47="$TMP_DIR/TASK-C47.md"
rm -f "$TMP_DIR"/TASK-C46.md
cat > "$TASK_C47" << 'EOF'
## TASK-C47
L0 핫픽스
담당: sdk-cto
EOF
run_test "C-47" "L0 + sdk-cto → exit 0" 0 \
    "make_input 'bash spawn.sh' | TMUX=fake TASK_DIR='$TMP_DIR' bash '$HOOK5'"

# C-48: L3 + sdk-pm → exit 0
TASK_C48="$TMP_DIR/TASK-C48.md"
rm -f "$TMP_DIR"/TASK-C47.md
cat > "$TASK_C48" << 'EOF'
## TASK-C48
L3 마이그레이션
담당: sdk-pm
EOF
run_test "C-48" "L3 + sdk-pm → exit 0" 0 \
    "make_input 'bash spawn.sh' | TMUX=fake TASK_DIR='$TMP_DIR' bash '$HOOK5'"

# C-49: spawn.sh 아닌 명령 → exit 0
rm -f "$TMP_DIR"/TASK-C48.md
run_test "C-49" "spawn.sh 아닌 명령 → exit 0" 0 \
    "make_input 'npm run build' | TMUX=fake TASK_DIR='$TMP_DIR' bash '$HOOK5'"

# ═══════════════════════════════════════════
echo ""
echo "=== Hook #6: filter-completion-dm.sh ==="
# ═══════════════════════════════════════════

HOOK6="$HOOK_DIR/filter-completion-dm.sh"

# C-50: pane 0 (리더) → exit 0
run_test "C-50" "pane 0 (리더) → exit 0" 0 \
    "echo '' | TMUX=fake CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 MOCK_CALLER_PANE=0 bash '$HOOK6'"

# C-51: pane 1 (팀원) → exit 2
run_test "C-51" "pane 1 (팀원) → exit 2" 2 \
    "echo '' | TMUX=fake CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 MOCK_CALLER_PANE=1 bash '$HOOK6'"

# C-52: pane 2 (팀원) → exit 2
run_test "C-52" "pane 2 (팀원) → exit 2" 2 \
    "echo '' | TMUX=fake CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 MOCK_CALLER_PANE=2 bash '$HOOK6'"

# C-53: TMUX 없음 → exit 0
run_test "C-53" "TMUX 없음 → exit 0" 0 \
    "echo '' | TMUX= CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 MOCK_CALLER_PANE=1 bash '$HOOK6'"

# C-54: TEAMS 없음 → exit 0
run_test "C-54" "TEAMS 없음 → exit 0" 0 \
    "echo '' | TMUX=fake CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS= MOCK_CALLER_PANE=1 bash '$HOOK6'"

# C-55: pane 1 stderr에 "pane 0" 포함
run_test_stderr "C-55" "pane 1 stderr에 'pane 0' 포함" "pane 0" \
    "echo '' | TMUX=fake CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 MOCK_CALLER_PANE=1 bash '$HOOK6'"

# ═══════════════════════════════════════════
echo ""
echo "=== Hook #7: validate-slack-payload.sh ==="
# ═══════════════════════════════════════════

HOOK7="$HOOK_DIR/validate-slack-payload.sh"

# C-56: TASK_NAME + team → exit 0
run_test "C-56" "TASK_NAME + team → exit 0" 0 \
    "make_input 'curl -d '\"'\"'{\"TASK_NAME\":\"TASK-001\",\"team\":\"sdk-cto\"}'\"'\"' https://hooks.slack.com/xxx' | bash '$HOOK7'"

# C-57: TASK_NAME 없음 → exit 2
run_test "C-57" "TASK_NAME 없음 → exit 2" 2 \
    "make_input 'curl -d '\"'\"'{\"name\":\"hello\",\"team\":\"sdk-cto\"}'\"'\"' https://hooks.slack.com/xxx' | bash '$HOOK7'"

# C-58: 팀명 없음 → exit 2
run_test "C-58" "팀명 없음 → exit 2" 2 \
    "make_input 'curl -d '\"'\"'{\"TASK_NAME\":\"TASK-001\",\"group\":\"alpha\"}'\"'\"' https://hooks.slack.com/xxx' | bash '$HOOK7'"

# C-59: 둘 다 없음 → exit 2
run_test "C-59" "둘 다 없음 → exit 2" 2 \
    "make_input 'curl -d '\"'\"'{\"name\":\"hello\",\"group\":\"alpha\"}'\"'\"' https://hooks.slack.com/xxx' | bash '$HOOK7'"

# C-60: curl api.example.com (슬랙 아님) → exit 0
run_test "C-60" "슬랙 아닌 curl → exit 0" 0 \
    "make_input 'curl https://api.example.com/data' | bash '$HOOK7'"

# C-61: echo (비-curl) → exit 0
run_test "C-61" "비-curl 명령 → exit 0" 0 \
    "make_input 'echo hello' | bash '$HOOK7'"

# C-62: text에 TASK-COO + team → exit 0
run_test "C-62" "TASK-COO + team → exit 0" 0 \
    "make_input 'curl -d '\"'\"'{\"text\":\"TASK-COO 완료 team 보고\"}'\"'\"' https://hooks.slack.com/xxx' | bash '$HOOK7'"

# C-63: TASK_NAME + sdk-pm → exit 0
run_test "C-63" "TASK_NAME + sdk-pm → exit 0" 0 \
    "make_input 'curl -d '\"'\"'{\"text\":\"TASK_NAME: TASK-001, sdk-pm 담당\"}'\"'\"' https://hooks.slack.com/xxx' | bash '$HOOK7'"

# ═══════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════"
echo "결과: $PASS/$TOTAL PASS, $FAIL FAIL"
echo "═══════════════════════════════════════"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
