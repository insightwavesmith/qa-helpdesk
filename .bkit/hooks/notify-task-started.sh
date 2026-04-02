#!/bin/bash
# notify-task-started.sh — TaskCreated Slack 알림 (3중 전송)
# 채널 + Smith님 DM + COO webhook
# notify-completion.sh와 동일 구조. 항상 exit 0

# Block logger: 차단(exit 2) 시 자동 기록
_bl_trap() { local e=$?; [ "$e" = "2" ] && source "$(dirname "$0")/helpers/block-logger.sh" 2>/dev/null && log_block "차단" "notify-task-started" "${COMMAND:-unknown}" 2>/dev/null; exit $e; }
trap _bl_trap EXIT

PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"

# V3: PID 역추적 자동 등록 (실패해도 계속)
source "$(dirname "$0")/helpers/hook-self-register.sh" 2>/dev/null
auto_register_peer 2>/dev/null

SLACK_CHANNEL="C0AN7ATS4DD"

# 팀원은 알림 스킵 (리더 완료만 알림)
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0
# SMITH_DM="D09V1NX98SK"  # disabled — Smith님 DM 비활성화
WEBHOOK_URL="${COO_WEBHOOK_URL:-http://localhost:18789}"

# stdin JSON에서 TASK 정보 추출
INPUT=$(cat 2>/dev/null || true)
eval "$(echo "$INPUT" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    subj = d.get('task_subject') or d.get('title') or d.get('taskTitle') or 'TASK 시작'
    mate = d.get('teammate_name') or 'unknown'
    team = d.get('team_name') or ''
    print(f'TASK_SUBJECT=\"{subj}\"')
    print(f'TEAMMATE_NAME=\"{mate}\"')
    print(f'TEAM_FROM_JSON=\"{team}\"')
except:
    print('TASK_SUBJECT=\"TASK 시작\"')
    print('TEAMMATE_NAME=\"unknown\"')
    print('TEAM_FROM_JSON=\"\"')
" 2>/dev/null || echo 'TASK_SUBJECT="TASK 시작"; TEAMMATE_NAME="unknown"; TEAM_FROM_JSON=""')"

# 팀 이름: 환경변수 > JSON > tmux session
TEAM_NAME="${TEAM_FROM_JSON}"
if [ -z "$TEAM_NAME" ] && [ -n "${TMUX:-}" ]; then
    TEAM_NAME=$(tmux display-message -p '#{session_name}' 2>/dev/null || true)
fi
[ -z "$TEAM_NAME" ] && TEAM_NAME="agent"

TASK_LEVEL="${TASK_LEVEL:-L2}"

# 메시지 구성
PREFIX="🚀"
if [ "$TASK_LEVEL" = "L0" ]; then
    PREFIX="🚨 [긴급 TaskStarted]"
else
    PREFIX="🚀 [TaskStarted]"
fi

MSG="$PREFIX $TEAM_NAME: $TASK_SUBJECT | 담당: $TEAMMATE_NAME"

# 결과 추적
RESULT_CHANNEL="skipped"
RESULT_DM="skipped"
RESULT_WEBHOOK="skipped"

# --- 에러 로그 기록 헬퍼 ---
log_error() {
    local TARGET="$1" HTTP="$2"
    mkdir -p "$PROJECT_DIR/.bkit/runtime" 2>/dev/null || true
    echo "{\"error\":\"slack_failed\",\"target\":\"$TARGET\",\"http\":\"$HTTP\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> \
      "$PROJECT_DIR/.bkit/runtime/error-log.json" 2>/dev/null || true
}

# --- 전송 함수 (DRY_RUN 지원) ---
send_slack() {
    local CHANNEL="$1" LABEL="$2"
    local SAFE_MSG
    SAFE_MSG=$(echo "$MSG" | sed "s/\"/'/g")

    if [ "${DRY_RUN:-}" = "true" ]; then
        echo "[DRY_RUN] curl -X POST https://slack.com/api/chat.postMessage channel=$CHANNEL text=$SAFE_MSG"
        if [ "$LABEL" = "channel" ] && [ "${DRY_RUN_CHANNEL_FAIL:-}" = "true" ]; then return 1; fi
        if [ "$LABEL" = "smith-dm" ] && [ "${DRY_RUN_DM_FAIL:-}" = "true" ]; then return 1; fi
        return 0
    fi

    local HTTP
    HTTP=$(curl -sf -X POST https://slack.com/api/chat.postMessage \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"channel\":\"$CHANNEL\",\"text\":\"$SAFE_MSG\"}" \
      --max-time 5 -w "%{http_code}" -o /dev/null 2>/dev/null || echo "000")

    if [ "$HTTP" != "200" ]; then return 1; fi
    return 0
}

send_webhook() {
    local SAFE_MSG
    SAFE_MSG=$(echo "$MSG" | sed "s/\"/'/g")

    if [ "${DRY_RUN:-}" = "true" ]; then
        echo "[DRY_RUN] curl -X POST $WEBHOOK_URL text=$SAFE_MSG"
        if [ "${DRY_RUN_WEBHOOK_FAIL:-}" = "true" ]; then return 1; fi
        return 0
    fi

    curl -sf -X POST "$WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"$SAFE_MSG\"}" \
      --max-time 5 -o /dev/null 2>/dev/null || return 1
    return 0
}

# --- 3중 전송 (각각 독립 실행) ---
if [ -n "${SLACK_BOT_TOKEN:-}" ]; then
    if send_slack "$SLACK_CHANNEL" "channel"; then
        RESULT_CHANNEL="ok"
    else
        RESULT_CHANNEL="failed"
        log_error "channel" "000"
    fi

    #     if send_slack "$SMITH_DM" "smith-dm"; then
    #         RESULT_DM="ok"
    #     else
    #         RESULT_DM="failed"
    #         log_error "smith-dm" "000"
    #     fi

    if send_webhook; then
        RESULT_WEBHOOK="ok"
    else
        RESULT_WEBHOOK="failed"
        log_error "webhook" "000"
    fi
fi

echo "channel:${RESULT_CHANNEL} dm:${RESULT_DM} webhook:${RESULT_WEBHOOK}"

exit 0
