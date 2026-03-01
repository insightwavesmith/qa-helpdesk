#!/bin/bash
# watch-agent-team.sh v3 — 완료 시에만 종료

SLACK_TOKEN="$1"
CHANNEL="${2:-D09V1NX98SK}"
MAX_MINUTES=60
CHECK_INTERVAL=15
ELAPSED=0

send_slack() {
  curl -s -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$CHANNEL\",\"text\":\"$1\"}" > /dev/null 2>&1
}

while [ $ELAPSED -lt $((MAX_MINUTES * 60)) ]; do
  if ! tmux has-session -t agent-team 2>/dev/null; then
    send_slack "에이전트팀: 세션 종료됨"
    exit 0
  fi

  PANE=$(tmux capture-pane -t agent-team -p 2>/dev/null)
  LAST=$(echo "$PANE" | tail -10)

  # 완료 감지: ❯ 프롬프트 + 메모리 저장 or build success
  if echo "$LAST" | grep -q "? for shortcuts"; then
    CONTEXT=$(echo "$PANE" | tail -30)
    if echo "$CONTEXT" | grep -qi "메모리 저장\|build.*succe\|완료\|finish\|npm run build"; then
      SUMMARY=$(echo "$CONTEXT" | grep -v "^$" | grep -v "^─" | grep -v "shortcuts" | tail -3 | tr '\n' ' ' | cut -c1-200)
      send_slack "에이전트팀 완료: ${SUMMARY}"
      exit 0
    fi
    # Plan 대기 (실행 필요)
    if echo "$LAST" | grep -q "Would you like to proceed"; then
      send_slack "에이전트팀: Plan 승인 대기 중"
      sleep 60
    fi
  fi

  sleep $CHECK_INTERVAL
  ELAPSED=$((ELAPSED + CHECK_INTERVAL))
done

send_slack "에이전트팀: 감시 타임아웃 (${MAX_MINUTES}분)"
