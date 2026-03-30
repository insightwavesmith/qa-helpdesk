#!/bin/bash
# on-commit-notify.sh — PostToolUse(Bash) hook
# git commit 감지 시 pdca-chain-handoff.sh 호출 (중복 방지 포함)
set -uo pipefail
trap 'exit 0' ERR

PROJECT_DIR="/Users/smith/projects/bscamp"
RUNTIME_DIR="$PROJECT_DIR/.bkit/runtime"
LAST_COMMIT_FILE="$RUNTIME_DIR/last-chain-commit"
HANDOFF_SCRIPT="$PROJECT_DIR/.bkit/hooks/pdca-chain-handoff.sh"

# ── 1. stdin에서 JSON 읽기 ──
INPUT=$(cat 2>/dev/null || true)
[ -z "$INPUT" ] && exit 0

# ── 2. git commit 명령어인지 감지 ──
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
echo "$COMMAND" | grep -q "git commit" || exit 0

# ── 3. 중복 방지: 마지막 처리 커밋 해시와 비교 ──
mkdir -p "$RUNTIME_DIR" 2>/dev/null
CURRENT_HASH=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || true)
[ -z "$CURRENT_HASH" ] && exit 0

if [ -f "$LAST_COMMIT_FILE" ]; then
    LAST_HASH=$(cat "$LAST_COMMIT_FILE" 2>/dev/null || true)
    [ "$CURRENT_HASH" = "$LAST_HASH" ] && exit 0
fi

# ── 4. pdca-chain-handoff.sh 호출 ──
if [ -x "$HANDOFF_SCRIPT" ]; then
    bash "$HANDOFF_SCRIPT" 2>/dev/null || true
fi

# ── 5. 현재 커밋 해시 기록 ──
echo "$CURRENT_HASH" > "$LAST_COMMIT_FILE" 2>/dev/null || true

exit 0
