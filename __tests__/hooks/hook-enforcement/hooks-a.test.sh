#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PASS=0; FAIL=0; TOTAL=22

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

make_input() { echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"$(echo "$1" | sed 's/"/\\"/g')\"}}"; }

HOOK_DIR="$PROJECT_DIR/.bkit/hooks"

# ═══════════════════════════════════════════
echo "=== Hook #2: enforce-spawn.sh ==="
# ═══════════════════════════════════════════

HOOK2="$HOOK_DIR/enforce-spawn.sh"

# C-21: claude --resume → exit 2
run_test "C-21" "claude --resume → exit 2" 2 \
    "make_input 'claude --resume abc123' | TMUX=fake CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 bash '$HOOK2'"

# C-22: claude -p → exit 2
run_test "C-22" "claude -p → exit 2" 2 \
    "make_input 'claude -p \"hello\"' | TMUX=fake CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 bash '$HOOK2'"

# C-23: spawn.sh 경유 → exit 0
run_test "C-23" "spawn.sh 경유 → exit 0" 0 \
    "make_input 'bash .bkit/hooks/spawn.sh test' | TMUX=fake CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 bash '$HOOK2'"

# C-24: claude-peers → exit 0
run_test "C-24" "claude-peers → exit 0" 0 \
    "make_input 'claude-peers list' | TMUX=fake CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 bash '$HOOK2'"

# C-25: claude --version → exit 0
run_test "C-25" "claude --version → exit 0" 0 \
    "make_input 'claude --version' | TMUX=fake CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 bash '$HOOK2'"

# C-26: 비-tmux → exit 0
run_test "C-26" "비-tmux → exit 0" 0 \
    "make_input 'claude --resume abc123' | TMUX= bash '$HOOK2'"

# C-27: 비-TEAMS → exit 0
run_test "C-27" "비-TEAMS → exit 0" 0 \
    "make_input 'claude --resume abc123' | TMUX=fake CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS= bash '$HOOK2'"

# C-28: claude --continue → exit 2
run_test "C-28" "claude --continue → exit 2" 2 \
    "make_input 'claude --continue' | TMUX=fake CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 bash '$HOOK2'"

# ═══════════════════════════════════════════
echo ""
echo "=== Hook #3: prevent-tmux-kill.sh ==="
# ═══════════════════════════════════════════

HOOK3="$HOOK_DIR/prevent-tmux-kill.sh"

# C-29: tmux kill-session → exit 2
run_test "C-29" "tmux kill-session → exit 2" 2 \
    "make_input 'tmux kill-session -t myteam' | TMUX=fake bash '$HOOK3'"

# C-30: tmux kill-pane → exit 2
run_test "C-30" "tmux kill-pane → exit 2" 2 \
    "make_input 'tmux kill-pane -t myteam' | TMUX=fake bash '$HOOK3'"

# C-31: tmux kill-server → exit 2
run_test "C-31" "tmux kill-server → exit 2" 2 \
    "make_input 'tmux kill-server' | TMUX=fake bash '$HOOK3'"

# C-32: tmux list-panes → exit 0
run_test "C-32" "tmux list-panes → exit 0" 0 \
    "make_input 'tmux list-panes' | TMUX=fake bash '$HOOK3'"

# C-33: tmux send-keys → exit 0
run_test "C-33" "tmux send-keys → exit 0" 0 \
    "make_input 'tmux send-keys -t myteam \"ls\"' | TMUX=fake bash '$HOOK3'"

# C-34: echo → exit 0
run_test "C-34" "echo → exit 0" 0 \
    "make_input 'echo \"hello\"' | TMUX=fake bash '$HOOK3'"

# C-35: 비-tmux → exit 0
run_test "C-35" "비-tmux → exit 0" 0 \
    "make_input 'tmux kill-session -t myteam' | TMUX= bash '$HOOK3'"

# ═══════════════════════════════════════════
echo ""
echo "=== Hook #4: validate-coo-approval.sh ==="
# ═══════════════════════════════════════════

HOOK4="$HOOK_DIR/validate-coo-approval.sh"

# C-36: coo_approved: true → exit 0
TASK_C36="$TMP_DIR/TASK-C36.md"
cat > "$TASK_C36" << 'EOF'
## TASK-C36
coo_approved: true
EOF
run_test "C-36" "coo_approved: true → exit 0" 0 \
    "make_input 'bash spawn.sh' | TMUX=fake TASK_DIR='$TMP_DIR' bash '$HOOK4'"

# C-37: coo_approved: false → exit 2
rm -f "$TMP_DIR"/TASK-C36.md
TASK_C37="$TMP_DIR/TASK-C37.md"
cat > "$TASK_C37" << 'EOF'
## TASK-C37
coo_approved: false
EOF
run_test "C-37" "coo_approved: false → exit 2" 2 \
    "make_input 'bash spawn.sh' | TMUX=fake TASK_DIR='$TMP_DIR' bash '$HOOK4'"

# C-38: coo_approved 없음 → exit 2
rm -f "$TMP_DIR"/TASK-C37.md
TASK_C38="$TMP_DIR/TASK-C38.md"
cat > "$TASK_C38" << 'EOF'
## TASK-C38
담당: cto-team
EOF
run_test "C-38" "coo_approved 없음 → exit 2" 2 \
    "make_input 'bash spawn.sh' | TMUX=fake TASK_DIR='$TMP_DIR' bash '$HOOK4'"

# C-39: TASK 파일 미존재 → exit 2
rm -f "$TMP_DIR"/TASK*.md
run_test "C-39" "TASK 파일 미존재 → exit 2" 2 \
    "make_input 'bash spawn.sh' | TMUX=fake TASK_DIR='$TMP_DIR' bash '$HOOK4'"

# C-40: spawn.sh 아닌 명령 → exit 0
run_test "C-40" "spawn.sh 아닌 명령 → exit 0" 0 \
    "make_input 'npm run build' | TMUX=fake TASK_DIR='$TMP_DIR' bash '$HOOK4'"

# C-41: 비-tmux → exit 0
TASK_C41="$TMP_DIR/TASK-C41.md"
cat > "$TASK_C41" << 'EOF'
## TASK-C41
coo_approved: false
EOF
run_test "C-41" "비-tmux → exit 0" 0 \
    "make_input 'bash spawn.sh' | TMUX= TASK_DIR='$TMP_DIR' bash '$HOOK4'"

# C-42: coo_approved:  true (공백) → exit 0
rm -f "$TMP_DIR"/TASK*.md
TASK_C42="$TMP_DIR/TASK-C42.md"
cat > "$TASK_C42" << 'EOF'
## TASK-C42
coo_approved:  true
EOF
run_test "C-42" "coo_approved: (공백)true → exit 0" 0 \
    "make_input 'bash spawn.sh' | TMUX=fake TASK_DIR='$TMP_DIR' bash '$HOOK4'"

# ═══════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════"
echo "결과: $PASS/$TOTAL PASS, $FAIL FAIL"
echo "═══════════════════════════════════════"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
