#!/bin/bash
# notify-task-completed.sh — 에이전트팀 TaskCompleted 시 알림
# Plan 완료, 코드 수정 완료, 리뷰 완료 등 중간 단계 알림
# 중복 방지: 같은 이벤트+상태면 스킵

PROJECT_DIR="/Users/smith/projects/qa-helpdesk"
TIMESTAMP=$(date '+%H:%M')

# 현재 상태 스냅샷 (커밋 + diff 파일 수)
LAST_SHA=$(cd "$PROJECT_DIR" 2>/dev/null && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
DIRTY_COUNT=$(cd "$PROJECT_DIR" 2>/dev/null && git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
STAGED_COUNT=$(cd "$PROJECT_DIR" 2>/dev/null && git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')

# 상태 해시 생성 (커밋+변경파일수 조합)
STATE="${LAST_SHA}-dirty${DIRTY_COUNT}-staged${STAGED_COUNT}"
MARKER="/tmp/agent-team-last-task-state"

if [ -f "$MARKER" ] && [ "$(cat "$MARKER")" = "$STATE" ]; then
  exit 0
fi
echo "$STATE" > "$MARKER"

# 메시지 구성
if [ "$STAGED_COUNT" -gt 0 ]; then
  MSG="[에이전트팀] 커밋 준비 완료 (${STAGED_COUNT}파일 staged) · ${TIMESTAMP}"
elif [ "$DIRTY_COUNT" -gt 0 ]; then
  MSG="[에이전트팀] 코드 수정 중 (${DIRTY_COUNT}파일 변경) · ${TIMESTAMP}"
else
  LAST_COMMIT=$(cd "$PROJECT_DIR" 2>/dev/null && git log --oneline -1 2>/dev/null || echo "unknown")
  MSG="[에이전트팀] Task 완료 — ${LAST_COMMIT} · ${TIMESTAMP}"
fi

# macOS 알림
osascript -e "display notification \"$MSG\" with title \"에이전트팀\"" 2>/dev/null || true

# 슬랙 DM
/opt/homebrew/bin/openclaw message send \
  --channel slack \
  --account mozzi \
  --target U06BP49UEJD \
  --message "$MSG" \
  2>/dev/null || true
