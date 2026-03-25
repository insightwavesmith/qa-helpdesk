#!/bin/bash
# agent-slack-notify.sh — TaskCompleted 시 슬랙 알림 전송 (Phase 2)
# bkit hook: TaskCompleted 이벤트에서 호출
# 개선: chain.handoff targetTeam 자동 결정, 빌드 실패 감지, PDCA phase 변경 감지

# 설정
API_BASE="http://localhost:3000"
CROSS_TEAM_DIR="/tmp/cross-team"
PDCA_FILE="/Users/smith/projects/bscamp/.pdca-status.json"

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

# chain.handoff 대상 팀 자동 결정 (chain-detector.ts 규칙과 동기화)
case "$TEAM" in
  pm) TARGET_TEAM="cto" ;;
  cto) TARGET_TEAM="marketing" ;;
  marketing) TARGET_TEAM="pm" ;;
  *) TARGET_TEAM="" ;;
esac

# 공통 인증 쿠키
SESSION_COOKIE=$(cat /tmp/bscamp-session-cookie 2>/dev/null || echo "")

# ── 1. 빌드 실패 마커 감지 ──────────────────────────────────────────────────
# /tmp/agent-build-failed 파일이 존재하면 error.critical 전송 후 마커 삭제
if [ -f "/tmp/agent-build-failed" ]; then
  ERROR_MSG=$(cat /tmp/agent-build-failed 2>/dev/null | head -5 | tr '\n' ' ' | sed 's/"/\\"/g' || echo "빌드 실패")
  curl -s -X POST "$API_BASE/api/agent-dashboard/slack/notify" \
    -H "Content-Type: application/json" \
    -H "Cookie: __session=$SESSION_COOKIE" \
    -d "{
      \"event\": \"error.critical\",
      \"team\": \"$TEAM\",
      \"title\": \"$TEAM_NAME 빌드 실패\",
      \"message\": \"빌드 에러가 발생했습니다.\",
      \"metadata\": {
        \"errorMessage\": \"$ERROR_MSG\",
        \"dashboardUrl\": \"https://bscamp.app/admin/agent-dashboard\"
      }
    }" > /dev/null 2>&1
  rm -f /tmp/agent-build-failed
fi

# ── 2. PDCA phase 변경 감지 ──────────────────────────────────────────────────
# last-pdca-phase 파일과 현재 .pdca-status.json 비교 → 변경 시 pdca.phase_change 전송
LAST_PHASE_FILE="$CROSS_TEAM_DIR/$TEAM/last-pdca-phase"
if [ -f "$PDCA_FILE" ]; then
  # python3 heredoc: 변수 주입은 환경변수로만 (bash 치환 방지)
  export _PDCA_FILE="$PDCA_FILE"
  CURRENT_PHASE=$(python3 << 'PYEOF'
import json, os, sys
try:
    with open(os.environ['_PDCA_FILE']) as f:
        data = json.load(f)
    status = data.get('status', 'unknown')
    print(status)
except Exception:
    print('unknown')
PYEOF
  )

  LAST_PHASE=$(cat "$LAST_PHASE_FILE" 2>/dev/null || echo "")

  # phase가 실제로 변경된 경우에만 알림 전송
  if [ -n "$CURRENT_PHASE" ] && [ "$CURRENT_PHASE" != "unknown" ] && [ "$CURRENT_PHASE" != "$LAST_PHASE" ]; then
    # 갱신 전에 last-pdca-phase 저장 (디렉토리 없으면 생성)
    mkdir -p "$CROSS_TEAM_DIR/$TEAM"
    echo "$CURRENT_PHASE" > "$LAST_PHASE_FILE"

    curl -s -X POST "$API_BASE/api/agent-dashboard/slack/notify" \
      -H "Content-Type: application/json" \
      -H "Cookie: __session=$SESSION_COOKIE" \
      -d "{
        \"event\": \"pdca.phase_change\",
        \"team\": \"$TEAM\",
        \"title\": \"$TEAM_NAME PDCA 단계 변경: $CURRENT_PHASE\",
        \"message\": \"PDCA 단계가 *$LAST_PHASE* → *$CURRENT_PHASE*로 변경되었습니다.\",
        \"metadata\": {
          \"previousPhase\": \"$LAST_PHASE\",
          \"currentPhase\": \"$CURRENT_PHASE\",
          \"dashboardUrl\": \"https://bscamp.app/admin/agent-dashboard\"
        }
      }" > /dev/null 2>&1
  fi
fi

# ── 3. task.completed 알림 전송 ──────────────────────────────────────────────
# TASK 제목 추출 (EVENT_DATA의 task.subject 필드)
TASK_TITLE=$(echo "$EVENT_DATA" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get('task', {}).get('subject', '작업'))
except:
    print('작업')
" 2>/dev/null || echo "작업")

curl -s -X POST "$API_BASE/api/agent-dashboard/slack/notify" \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=$SESSION_COOKIE" \
  -d "{
    \"event\": \"task.completed\",
    \"team\": \"$TEAM\",
    \"title\": \"$TEAM_NAME 작업 완료: $TASK_TITLE\",
    \"message\": \"$TEAM_NAME 에이전트가 작업을 완료했습니다.\",
    \"metadata\": {
      \"dashboardUrl\": \"https://bscamp.app/admin/agent-dashboard\"
    }
  }" > /dev/null 2>&1

# ── 4. 모든 TASK 완료 시 chain.handoff 전송 (targetTeam 포함) ─────────────────
STATE_FILE="$CROSS_TEAM_DIR/$TEAM/state.json"
if [ -f "$STATE_FILE" ]; then
  export _STATE_FILE="$STATE_FILE"
  ALL_DONE=$(python3 << 'PYEOF'
import json, os
try:
    with open(os.environ['_STATE_FILE']) as f:
        state = json.load(f)
    tasks = state.get('tasks', [])
    if tasks and all(t.get('status') == 'done' for t in tasks):
        print('true')
    else:
        print('false')
except Exception:
    print('false')
PYEOF
  )

  if [ "$ALL_DONE" = "true" ]; then
    # targetTeam 필드 구성 (빈 문자열이면 필드 생략)
    if [ -n "$TARGET_TEAM" ]; then
      TARGET_FIELD="\"targetTeam\": \"$TARGET_TEAM\","
    else
      TARGET_FIELD=""
    fi

    curl -s -X POST "$API_BASE/api/agent-dashboard/slack/notify" \
      -H "Content-Type: application/json" \
      -H "Cookie: __session=$SESSION_COOKIE" \
      -d "{
        \"event\": \"chain.handoff\",
        \"team\": \"$TEAM\",
        \"title\": \"체인 전달: $TEAM_NAME 전체 작업 완료\",
        \"message\": \"$TEAM_NAME 의 모든 TASK가 완료되었습니다. 다음 팀으로 전달합니다.\",
        \"metadata\": {
          $TARGET_FIELD
          \"dashboardUrl\": \"https://bscamp.app/admin/agent-dashboard\"
        }
      }" > /dev/null 2>&1
  fi
fi

exit 0
