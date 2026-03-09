#!/bin/bash
# notify-hook.sh — hook 차단/완료 시 모찌 + Smith님 슬랙 동시 알림
# 사용법: source notify-hook.sh && notify_hook "메시지"

notify_hook() {
  local MSG="$1"
  local COOLDOWN_KEY="${2:-default}"
  local COOLDOWN_FILE="/tmp/hook-notify-cooldown-${COOLDOWN_KEY}"
  
  # 60초 쿨다운 (같은 hook에서 반복 알림 방지)
  if [ -f "$COOLDOWN_FILE" ]; then
    local LAST=$(cat "$COOLDOWN_FILE")
    local NOW=$(date +%s)
    local DIFF=$((NOW - LAST))
    if [ "$DIFF" -lt 60 ]; then
      return 0
    fi
  fi
  date +%s > "$COOLDOWN_FILE"

  # 1. 모찌 슬랙 DM (모찌가 wake되면 대응)
  /opt/homebrew/bin/openclaw message send \
    --channel slack \
    --account mozzi \
    --target U06BP49UEJD \
    --message "$MSG" \
    2>/dev/null &

  # 2. Smith님 슬랙 DM (모찌 wake 안 되면 직접 확인)
  /opt/homebrew/bin/openclaw message send \
    --channel slack \
    --account dev-lead \
    --target U06BP49UEJD \
    --message "$MSG" \
    2>/dev/null &

  wait
}
