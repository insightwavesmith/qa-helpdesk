#!/bin/bash
# notify-openclaw.sh — 에이전트팀 세션 종료 시 알림
# Stop hook: claude 세션 종료(/quit) 시 실행

PROJECT_DIR="/Users/smith/projects/qa-helpdesk"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
LAST_COMMIT=$(cd "$PROJECT_DIR" 2>/dev/null && git log --oneline -1 2>/dev/null || echo "unknown")
CHANGED_FILES=$(cd "$PROJECT_DIR" 2>/dev/null && git diff HEAD~1 --name-only 2>/dev/null | wc -l | tr -d ' ')

# 마커 파일 생성 (모찌 크론이 5분마다 체크)
cat > /tmp/agent-team-completed.json << EOF
{
  "completed_at": "$TIMESTAMP",
  "project": "$PROJECT_DIR",
  "last_commit": "$LAST_COMMIT",
  "changed_files": "$CHANGED_FILES",
  "event": "session_stop"
}
EOF

# macOS 알림 (즉시 — Smith님에게)
osascript -e "display notification \"$LAST_COMMIT\" with title \"에이전트팀 세션 종료\" sound name \"Glass\"" 2>/dev/null || true

# 슬랙 DM 알림 (모찌 → Smith님)
BRANCH=$(cd "$PROJECT_DIR" 2>/dev/null && git branch --show-current 2>/dev/null || echo "unknown")
/opt/homebrew/bin/openclaw message send \
  --channel slack \
  --account mozzi \
  --target U06BP49UEJD \
  --message "[에이전트팀 세션 종료] ${LAST_COMMIT} (변경 ${CHANGED_FILES}파일, ${BRANCH})" \
  2>/dev/null || true
