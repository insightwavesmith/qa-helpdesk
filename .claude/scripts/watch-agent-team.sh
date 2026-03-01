#!/bin/bash
# watch-agent-team.sh — 에이전트팀 감시 스크립트 v2

SLACK_TOKEN="$1"
CHANNEL="${2:-D09V1NX98SK}"
MAX_CHECKS=60
CHECK_INTERVAL=10

send_slack() {
  curl -s -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$CHANNEL\",\"text\":\"$1\"}" > /dev/null 2>&1
}

for i in $(seq 1 $MAX_CHECKS); do
  if ! tmux has-session -t agent-team 2>/dev/null; then
    send_slack "에이전트팀: 세션 없음"
    exit 0
  fi

  # 마지막 3줄에서 프롬프트 확인
  LAST=$(tmux capture-pane -t agent-team -p 2>/dev/null | tail -3)
  
  # "? for shortcuts" 또는 "esc to interrupt" 없이 ❯만 있으면 = 입력 대기
  if echo "$LAST" | grep -q "? for shortcuts"; then
    CONTEXT=$(tmux capture-pane -t agent-team -p 2>/dev/null | tail -30)
    
    STATUS="대기"
    if echo "$CONTEXT" | grep -qi "cogitat\|build.*succe\|완료\|finish\|메모리 저장"; then
      STATUS="완료"
    elif echo "$CONTEXT" | grep -qi "error\|fail\|에러\|실패"; then
      STATUS="에러"
    elif echo "$CONTEXT" | grep -qi "plan mode\|plan.*preview"; then
      STATUS="Plan 대기"
    fi
    
    SUMMARY=$(echo "$CONTEXT" | grep -v "^$" | grep -v "^─" | tail -5 | tr '\n' ' ' | cut -c1-200)
    
    send_slack "에이전트팀: ${STATUS} — ${SUMMARY}"
    
    if [ "$STATUS" = "완료" ]; then
      exit 0
    fi
    
    # 보고 후 다음 대기까지 좀 더 기다림
    sleep 60
  fi
  
  sleep $CHECK_INTERVAL
done

send_slack "에이전트팀: 감시 타임아웃 (10분) — 아직 작업 중"
