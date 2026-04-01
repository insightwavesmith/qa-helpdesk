#!/bin/bash
# notify-completion.sh — TaskCompleted Slack 알림 (3중 전송)
# 채널 + Smith님 DM + COO webhook
# 항상 exit 0

PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"

# V3: PID 역추적 자동 등록 (실패해도 계속)
source "$(dirname "$0")/helpers/hook-self-register.sh" 2>/dev/null
auto_register_peer 2>/dev/null

SLACK_CHANNEL="C0AN7ATS4DD"
SMITH_DM="D09V1NX98SK"
WEBHOOK_URL="${COO_WEBHOOK_URL:-http://localhost:18789}"

# stdin JSON에서 TASK 제목 추출
INPUT=$(cat 2>/dev/null || true)
TASK_TITLE=$(echo "$INPUT" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    print(d.get('title') or d.get('task_title') or d.get('taskTitle') or 'TASK 완료')
except: print('TASK 완료')
" 2>/dev/null || echo "TASK 완료")

# 환경변수 우선, 없으면 stdin JSON 값
TASK_NAME="${TASK_NAME:-$TASK_TITLE}"

# TASK_NAME 자동 감지: "팀명: 작업내용" 형식
if [ "$TASK_NAME" = "TASK 완료" ] || [ -z "$TASK_NAME" ]; then
    _TEAM=""
    if [ -n "${TMUX:-}" ]; then
        _TEAM=$(tmux display-message -p '#{session_name}' 2>/dev/null || true)
    fi
    [ -z "$_TEAM" ] && _TEAM="agent"

    _DESC=$(cd "$PROJECT_DIR" 2>/dev/null && git log --oneline -20 2>/dev/null \
        | grep -v "자동 커밋" | head -1 \
        | sed 's/^[a-f0-9]* //' | sed 's/^[a-z]*: //' || true)
    [ -z "$_DESC" ] && _DESC=$(cd "$PROJECT_DIR" 2>/dev/null && git log --oneline -1 2>/dev/null \
        | sed 's/^[a-f0-9]* //' || echo "작업 완료")

    TASK_NAME="$_TEAM: $_DESC"
fi

TASK_LEVEL="${TASK_LEVEL:-L2}"
MATCH_RATE="${MATCH_RATE:-}"
COMMIT_HASH="${COMMIT_HASH:-}"

# L0 긴급 접두사
PREFIX="✅"
if [ "$TASK_LEVEL" = "L0" ]; then
    PREFIX="🚨 [긴급]"
fi

# 메시지 구성
MSG="$PREFIX [TaskCompleted] $TASK_NAME"
[ -n "$TASK_LEVEL" ] && MSG="$MSG | $TASK_LEVEL"
[ -n "$MATCH_RATE" ] && MSG="$MSG | Match:${MATCH_RATE}%"
[ -n "$COMMIT_HASH" ] && MSG="$MSG | ${COMMIT_HASH}"

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

        # DRY_RUN 실패 시뮬레이션
        if [ "$LABEL" = "channel" ] && [ "${DRY_RUN_CHANNEL_FAIL:-}" = "true" ]; then
            return 1
        fi
        if [ "$LABEL" = "smith-dm" ] && [ "${DRY_RUN_DM_FAIL:-}" = "true" ]; then
            return 1
        fi
        return 0
    fi

    local HTTP
    HTTP=$(curl -sf -X POST https://slack.com/api/chat.postMessage \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"channel\":\"$CHANNEL\",\"text\":\"$SAFE_MSG\"}" \
      --max-time 5 -w "%{http_code}" -o /dev/null 2>/dev/null || echo "000")

    if [ "$HTTP" != "200" ]; then
        return 1
    fi
    return 0
}

send_webhook() {
    local SAFE_MSG
    SAFE_MSG=$(echo "$MSG" | sed "s/\"/'/g")

    if [ "${DRY_RUN:-}" = "true" ]; then
        echo "[DRY_RUN] curl -X POST $WEBHOOK_URL text=$SAFE_MSG"

        if [ "${DRY_RUN_WEBHOOK_FAIL:-}" = "true" ]; then
            return 1
        fi
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
    # 1. 채널
    if send_slack "$SLACK_CHANNEL" "channel"; then
        RESULT_CHANNEL="ok"
    else
        RESULT_CHANNEL="failed"
        log_error "channel" "000"
    fi

    # 2. Smith님 DM
    if send_slack "$SMITH_DM" "smith-dm"; then
        RESULT_DM="ok"
    else
        RESULT_DM="failed"
        log_error "smith-dm" "000"
    fi

    # 3. COO webhook
    if send_webhook; then
        RESULT_WEBHOOK="ok"
    else
        RESULT_WEBHOOK="failed"
        log_error "webhook" "000"
    fi
fi

# 부분 성공 로그 출력
echo "channel:${RESULT_CHANNEL} dm:${RESULT_DM} webhook:${RESULT_WEBHOOK}"

exit 0
