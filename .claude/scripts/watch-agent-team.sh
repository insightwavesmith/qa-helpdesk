#!/bin/bash
# watch-agent-team.sh — 에이전트팀 감시 스크립트
# 사용: watch-agent-team.sh [슬랙봇토큰] [채널ID]
# 백그라운드 실행: nohup watch-agent-team.sh TOKEN CHANNEL &

SLACK_TOKEN="$1"
CHANNEL="${2:-D09V1NX98SK}"  # Smith님 DM 기본
OPENCLAW_HOOK_URL="http://localhost:18789/hooks"
OPENCLAW_HOOK_TOKEN="$3"
MAX_CHECKS=60  # 30초 × 60 = 30분
CHECK_INTERVAL=30

send_slack() {
  local msg="$1"
  curl -s -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$CHANNEL\",\"text\":\"$msg\"}" > /dev/null 2>&1
}

send_openclaw() {
  local msg="$1"
  if [ -n "$OPENCLAW_HOOK_TOKEN" ]; then
    curl -s -X POST "$OPENCLAW_HOOK_URL" \
      -H "Authorization: Bearer $OPENCLAW_HOOK_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"$msg\"}" > /dev/null 2>&1
  fi
}

for i in $(seq 1 $MAX_CHECKS); do
  # tmux 세션 존재 확인
  if ! tmux has-session -t agent-team 2>/dev/null; then
    send_slack "에이전트팀: 세션 없음 — tmux agent-team 세션이 종료됨"
    exit 0
  fi

  # 마지막 5줄 체크
  TAIL=$(tmux capture-pane -t agent-team -p 2>/dev/null | tail -5)
  
  # 프롬프트 대기 감지 (❯ 뒤에 빈칸 또는 줄끝)
  if echo "$TAIL" | grep -qE "^❯ *$"; then
    # 상세 컨텍스트 읽기
    CONTEXT=$(tmux capture-pane -t agent-team -p 2>/dev/null | tail -30)
    
    # 상황 판단
    STATUS="대기"
    if echo "$CONTEXT" | grep -qi "cogitat\|build.*success\|완료\|finished"; then
      STATUS="완료"
    elif echo "$CONTEXT" | grep -qi "error\|fail\|에러\|실패"; then
      STATUS="에러 발생"
    elif echo "$CONTEXT" | grep -qi "plan mode\|plan.*preview\|승인"; then
      STATUS="Plan 대기"
    elif echo "$CONTEXT" | grep -qi "?\|질문\|어떻게"; then
      STATUS="질문 대기"
    fi
    
    # 핵심 출력 추출 (마지막 의미있는 5줄)
    SUMMARY=$(echo "$CONTEXT" | grep -v "^$\|^─\|^\s*$" | tail -5 | head -3)
    
    MSG="에이전트팀: ${STATUS}
${SUMMARY}"
    
    send_slack "$MSG"
    send_openclaw "[에이전트팀 감시봇] $MSG"
    
    # 완료면 종료, 아니면 계속 감시
    if [ "$STATUS" = "완료" ]; then
      exit 0
    fi
  fi
  
  sleep $CHECK_INTERVAL
done

send_slack "에이전트팀: 감시 타임아웃 (30분) — 아직 작업 중"
