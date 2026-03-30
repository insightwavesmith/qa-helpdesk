#!/bin/bash
# on-commit-notify.sh — PostToolUse(Bash) hook
# git commit 감지 시 webhook wake 직접 전송 (중복 방지 포함)
set -uo pipefail
trap 'exit 0' ERR

PROJECT_DIR="/Users/smith/projects/bscamp"
RUNTIME_DIR="$PROJECT_DIR/.bkit/runtime"
LAST_COMMIT_FILE="$RUNTIME_DIR/last-chain-commit"

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

# ── 4. webhook wake 직접 전송 ──
COMMIT_MSG=$(git -C "$PROJECT_DIR" log -1 --pretty=format:"%s" 2>/dev/null || true)
SHORT_HASH=$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || true)
curl -s -X POST http://127.0.0.1:18789/hooks/wake \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer mz-hook-Kx9mP4vR7nWqZj2026' \
  -d "{\"text\":\"[COMMIT] ${SHORT_HASH} — ${COMMIT_MSG}\",\"mode\":\"agent\",\"agentId\":\"main\"}" \
  --connect-timeout 2 --max-time 5 2>/dev/null || true

# ── 5. 현재 커밋 해시 기록 ──
echo "$CURRENT_HASH" > "$LAST_COMMIT_FILE" 2>/dev/null || true

exit 0
