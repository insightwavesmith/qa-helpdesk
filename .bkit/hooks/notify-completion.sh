#!/bin/bash
# notify-completion.sh — TaskCompleted Slack 알림
# 항상 exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
SLACK_CHANNEL="C0AN7ATS4DD"

INPUT=$(cat 2>/dev/null || true)
TASK_TITLE=$(echo "$INPUT" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    print(d.get('title') or d.get('task_title') or d.get('taskTitle') or 'TASK 완료')
except: print('TASK 완료')
" 2>/dev/null || echo "TASK 완료")

MSG="✅ [TaskCompleted] ${TASK_TITLE}"

if [ -n "${SLACK_BOT_TOKEN:-}" ]; then
    HTTP=$(curl -sf -X POST https://slack.com/api/chat.postMessage \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"channel\":\"$SLACK_CHANNEL\",\"text\":\"$(echo "$MSG" | sed "s/\"/'/g")\"}" \
      --max-time 5 -w "%{http_code}" -o /dev/null 2>/dev/null || echo "000")
    if [ "$HTTP" != "200" ]; then
        echo "{\"error\":\"slack_failed\",\"http\":\"$HTTP\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> \
          "$PROJECT_DIR/.bkit/runtime/error-log.json" 2>/dev/null || true
    fi
fi
exit 0
