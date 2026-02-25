#!/bin/bash
# notify-openclaw.sh — 에이전트팀 세션 종료 시 마커 파일 생성
# Stop hook: claude 세션 종료(/quit, 작업 완료) 시 실행

PROJECT_DIR="/Users/smith/projects/qa-helpdesk"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
LAST_COMMIT=$(cd "$PROJECT_DIR" 2>/dev/null && git log --oneline -1 2>/dev/null || echo "unknown")
CHANGED_FILES=$(cd "$PROJECT_DIR" 2>/dev/null && git diff HEAD~1 --name-only 2>/dev/null | wc -l | tr -d ' ')

cat > /tmp/agent-team-completed.json << EOF
{
  "completed_at": "$TIMESTAMP",
  "project": "$PROJECT_DIR",
  "last_commit": "$LAST_COMMIT",
  "changed_files": "$CHANGED_FILES"
}
EOF

# macOS 알림 (즉시)
osascript -e "display notification \"$LAST_COMMIT\" with title \"에이전트팀 완료\" sound name \"Glass\"" 2>/dev/null || true
