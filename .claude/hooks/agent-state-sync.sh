#!/bin/bash
# agent-state-sync.sh — TaskCompleted 시 팀 state.json 갱신
# bkit hook: TaskCompleted 이벤트에서 호출

CROSS_TEAM_DIR="/tmp/cross-team"

# 디렉토리 초기화
mkdir -p "$CROSS_TEAM_DIR/pm"
mkdir -p "$CROSS_TEAM_DIR/marketing"
mkdir -p "$CROSS_TEAM_DIR/cto"
mkdir -p "$CROSS_TEAM_DIR/logs"
mkdir -p "$CROSS_TEAM_DIR/background"
mkdir -p "$CROSS_TEAM_DIR/slack"

# stdin에서 이벤트 데이터 읽기 (JSON)
EVENT_DATA=$(cat)

# 팀 식별 (환경변수 AGENT_TEAM 사용, 없으면 cto 기본값)
TEAM="${AGENT_TEAM:-cto}"

STATE_FILE="$CROSS_TEAM_DIR/$TEAM/state.json"

# 기존 state.json이 있으면 읽기, 없으면 기본값
if [ -f "$STATE_FILE" ]; then
  CURRENT_STATE=$(cat "$STATE_FILE")
else
  CURRENT_STATE="{\"name\":\"${TEAM}팀\",\"emoji\":\"⚙️\",\"status\":\"active\",\"color\":\"#6366F1\",\"members\":[],\"tasks\":[]}"
fi

# 현재 시각
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S+09:00")

# state.json 업데이트 (updatedAt만 갱신)
echo "$CURRENT_STATE" | python3 -c "
import json, sys
state = json.load(sys.stdin)
state['status'] = 'active'
print(json.dumps(state, ensure_ascii=False, indent=2))
" > "$STATE_FILE" 2>/dev/null || echo "$CURRENT_STATE" > "$STATE_FILE"

exit 0
