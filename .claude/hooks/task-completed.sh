#!/bin/bash
# task-completed.sh — 태스크 완료 시 알림 + QA 게이트
# TaskCompleted hook: 에이전트팀 태스크 완료 시 실행
#
# 강화 v2 (2026-03-22):
#   - bscamp 프로젝트 경로
#   - 슬랙 알림 + macOS 알림
#   - 마커 파일 생성 (모찌 하트비트용)

PROJECT_DIR="/Users/smith/projects/bscamp"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
LAST_COMMIT=$(cd "$PROJECT_DIR" 2>/dev/null && git log --oneline -1 2>/dev/null || echo "unknown")
CHANGED_FILES=$(cd "$PROJECT_DIR" 2>/dev/null && git diff HEAD~1 --name-only 2>/dev/null | wc -l | tr -d ' ')
BRANCH=$(cd "$PROJECT_DIR" 2>/dev/null && git branch --show-current 2>/dev/null || echo "unknown")

# 마커 파일 생성 (모찌 크론이 5분마다 체크)
cat > /tmp/agent-team-completed.json << EOF
{
  "completed_at": "$TIMESTAMP",
  "project": "$PROJECT_DIR",
  "last_commit": "$LAST_COMMIT",
  "changed_files": "$CHANGED_FILES",
  "branch": "$BRANCH",
  "event": "task_completed"
}
EOF

# macOS 알림 (즉시 — Smith님에게)
osascript -e "display notification \"${LAST_COMMIT}\" with title \"에이전트팀 태스크 완료\" sound name \"Glass\"" 2>/dev/null || true

# 슬랙 DM 알림 (모찌 → Smith님)
