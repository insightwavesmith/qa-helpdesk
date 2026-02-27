#!/bin/bash
# 에이전트팀 TaskCompleted 알림 — Smith님 슬랙 + 모찌 세션
# 중복 방지: 같은 상태 OR 3분 이내 = 스킵

TIMESTAMP=$(date '+%H:%M')
LAST_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
DIRTY_COUNT=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
STAGED_COUNT=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')

STATE="${LAST_SHA}-dirty${DIRTY_COUNT}-staged${STAGED_COUNT}"
MARKER="/tmp/agent-team-last-task-state"
TIME_MARKER="/tmp/agent-team-last-task-time"

# 중복 방지 1: 같은 상태
if [ -f "$MARKER" ] && [ "$(cat "$MARKER")" = "$STATE" ]; then
  exit 0
fi

# 중복 방지 2: 3분 이내
if [ -f "$TIME_MARKER" ]; then
  LAST_TIME=$(cat "$TIME_MARKER")
  NOW=$(date +%s)
  DIFF=$((NOW - LAST_TIME))
  if [ "$DIFF" -lt 180 ]; then
    exit 0
  fi
fi

echo "$STATE" > "$MARKER"
date +%s > "$TIME_MARKER"

# 메시지 구성
if [ "$STAGED_COUNT" -gt 0 ]; then
  MSG="[에이전트팀] 커밋 준비 완료 (${STAGED_COUNT}파일 staged) · ${TIMESTAMP}"
elif [ "$DIRTY_COUNT" -gt 0 ]; then
  MSG="[에이전트팀] 코드 수정 중 (${DIRTY_COUNT}파일 변경) · ${TIMESTAMP}"
else
  LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "unknown")
  MSG="[에이전트팀] Task 완료 — ${LAST_COMMIT} · ${TIMESTAMP}"
fi

# 1. Smith님 슬랙 DM
/opt/homebrew/bin/openclaw message send \
  --channel slack \
  --account mozzi \
  --target U06BP49UEJD \
  --message "$MSG" \
  2>/dev/null || true

# 2. 모찌 세션 wake (모찌가 자동 확인 + 상세 보고)
/opt/homebrew/bin/openclaw cron wake \
  --text "$MSG" \
  2>/dev/null || true

# 3. macOS 알림
osascript -e "display notification \"$MSG\" with title \"에이전트팀\"" 2>/dev/null || true
