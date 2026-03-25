#!/bin/bash
# agent-slack-notify.sh — TaskCompleted 시 슬랙 알림 전송
# bkit hook: TaskCompleted 이벤트에서 호출

# 설정
API_BASE="http://localhost:3000"
CROSS_TEAM_DIR="/tmp/cross-team"

# stdin에서 이벤트 데이터 읽기
EVENT_DATA=$(cat)

# 팀 식별 (환경변수)
TEAM="${AGENT_TEAM:-cto}"

# 팀 이름 매핑
case "$TEAM" in
  pm) TEAM_NAME="PM팀" ;;
  marketing) TEAM_NAME="마케팅팀" ;;
  cto) TEAM_NAME="CTO팀" ;;
  *) TEAM_NAME="$TEAM" ;;
esac

# TASK 제목 추출 (EVENT_DATA에서 task subject)
TASK_TITLE=$(echo "$EVENT_DATA" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get('task', {}).get('subject', '작업'))
except:
    print('작업')
" 2>/dev/null || echo "작업")

# 1. task.completed 알림 전송
curl -s -X POST "$API_BASE/api/agent-dashboard/slack/notify" \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=$(cat /tmp/bscamp-session-cookie 2>/dev/null || echo '')" \
  -d "{
    \"event\": \"task.completed\",
    \"team\": \"$TEAM\",
    \"title\": \"$TEAM_NAME 작업 완료: $TASK_TITLE\",
    \"message\": \"$TEAM_NAME 에이전트가 작업을 완료했습니다.\",
    \"metadata\": {
      \"dashboardUrl\": \"https://bscamp.app/admin/agent-dashboard\"
    }
  }" > /dev/null 2>&1

# 2. 모든 TASK 완료 여부 확인 → 체인 전달
STATE_FILE="$CROSS_TEAM_DIR/$TEAM/state.json"
if [ -f "$STATE_FILE" ]; then
  ALL_DONE=$(python3 -c "
import json
with open('$STATE_FILE') as f:
    state = json.load(f)
tasks = state.get('tasks', [])
if tasks and all(t.get('status') == 'done' for t in tasks):
    print('true')
else:
    print('false')
" 2>/dev/null || echo "false")

  if [ "$ALL_DONE" = "true" ]; then
    # 체인 전달 알림
    curl -s -X POST "$API_BASE/api/agent-dashboard/slack/notify" \
      -H "Content-Type: application/json" \
      -H "Cookie: __session=$(cat /tmp/bscamp-session-cookie 2>/dev/null || echo '')" \
      -d "{
        \"event\": \"chain.handoff\",
        \"team\": \"$TEAM\",
        \"title\": \"체인 전달: $TEAM_NAME 전체 작업 완료\",
        \"message\": \"$TEAM_NAME 의 모든 TASK가 완료되었습니다. 다음 팀으로 전달합니다.\",
        \"metadata\": {
          \"dashboardUrl\": \"https://bscamp.app/admin/agent-dashboard\"
        }
      }" > /dev/null 2>&1
  fi
fi

exit 0
