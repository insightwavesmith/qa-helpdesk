#!/bin/bash
# 에이전트팀 세션 종료 알림 — Smith님 슬랙 + 모찌 세션

LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "unknown")
LAST_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
CHANGED_FILES=$(git diff HEAD~1 --name-only 2>/dev/null | wc -l | tr -d ' ')
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# 중복 방지: 이전 알림과 같은 커밋
MARKER="/tmp/agent-team-last-notified-sha"
if [ -f "$MARKER" ] && [ "$(cat "$MARKER")" = "$LAST_SHA" ]; then
  exit 0
fi
echo "$LAST_SHA" > "$MARKER"

MSG="[에이전트팀 세션 종료] ${LAST_COMMIT} (변경 ${CHANGED_FILES}파일, ${BRANCH})"

# 1. Smith님 슬랙 DM
/opt/homebrew/bin/openclaw message send \
  --channel slack \
  --account mozzi \
  --target U06BP49UEJD \
  --message "$MSG" \
  2>/dev/null || true

# 2. 모찌 세션 wake
/opt/homebrew/bin/openclaw cron wake \
  --text "$MSG" \
  2>/dev/null || true

# 3. macOS 알림
osascript -e "display notification \"$LAST_COMMIT\" with title \"에이전트팀 세션 종료\" sound name \"Glass\"" 2>/dev/null || true

# 4. 마커 파일 (모찌 하트비트용)
cat > /tmp/agent-team-completed.json << EOF
{
  "completed_at": "$(date '+%Y-%m-%d %H:%M:%S')",
  "last_commit": "$LAST_COMMIT",
  "changed_files": "$CHANGED_FILES",
  "event": "session_stop"
}
EOF
