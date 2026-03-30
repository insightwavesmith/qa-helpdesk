#!/bin/bash
# heartbeat-watchdog.sh — heartbeat 미발동 감지
# cron 또는 session-resume-check.sh에서 호출
# heartbeat.log의 마지막 기록이 15분 이상 전이면 경고

PROJECT_DIR="/Users/smith/projects/bscamp"
HEARTBEAT_LOG="$PROJECT_DIR/.claude/runtime/heartbeat.log"

[ ! -f "$HEARTBEAT_LOG" ] && { echo "heartbeat.log 미존재 — heartbeat 미설정 의심" >&2; exit 1; }

LAST_LINE=$(tail -1 "$HEARTBEAT_LOG")
LAST_TS=$(echo "$LAST_LINE" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}')
[ -z "$LAST_TS" ] && { echo "heartbeat.log 타임스탬프 파싱 실패" >&2; exit 1; }

LAST_EPOCH=$(date -j -f '%Y-%m-%d %H:%M:%S' "$LAST_TS" +%s 2>/dev/null)
NOW=$(date +%s)
AGE=$((NOW - LAST_EPOCH))

# 15분 (900초) 이상이면 경고
if [ "$AGE" -gt 900 ]; then
    echo "heartbeat 미발동 ${AGE}초 (마지막: $LAST_TS)" >&2
    exit 1
fi

echo "heartbeat 정상 (${AGE}초 전 마지막 기록)"
exit 0
