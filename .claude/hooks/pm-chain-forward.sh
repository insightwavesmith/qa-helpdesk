#!/bin/bash
# pm-chain-forward.sh — PM 검수 완료 후 체인 전달
# PM TaskCompleted hook으로 사용 — PM이 CTO 보고를 검수한 후:
#   pass → COO(MOZZI)에게 COMPLETION_REPORT 전달
#   reject → CTO에게 FEEDBACK 전달
#
# 입력: $PROJECT_DIR/.claude/runtime/last-completion-report.json (CTO가 보낸 원본)
#       $PROJECT_DIR/.claude/runtime/pm-verdict.json (PM 검수 결과)
# 동작: verdict에 따라 자동 라우팅

set -uo pipefail

# 팀원 bypass
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
cd "$PROJECT_DIR" || exit 0

# PM 팀만 대상
source "$(dirname "$0")/helpers/team-context-resolver.sh" 2>/dev/null
resolve_team_context 2>/dev/null
CONTEXT_FILE="${TEAM_CONTEXT_FILE:-$PROJECT_DIR/.claude/runtime/team-context.json}"
if [ ! -f "$CONTEXT_FILE" ]; then
    exit 0
fi
TEAM=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null)
[[ "$TEAM" != PM* ]] && exit 0

# 검수 결과 파일 확인
VERDICT_FILE="$PROJECT_DIR/.claude/runtime/pm-verdict.json"
if [ ! -f "$VERDICT_FILE" ]; then
    exit 0
fi

VERDICT=$(jq -r '.verdict // empty' "$VERDICT_FILE" 2>/dev/null)
PM_NOTES=$(jq -r '.notes // ""' "$VERDICT_FILE" 2>/dev/null)
ISSUES=$(jq -c '.issues // []' "$VERDICT_FILE" 2>/dev/null)

if [ -z "$VERDICT" ]; then
    exit 0
fi

# 원본 보고서 로드
REPORT_FILE="$PROJECT_DIR/.claude/runtime/last-completion-report.json"
if [ ! -f "$REPORT_FILE" ]; then
    echo "pm-chain-forward: 원본 보고서 없음 ($REPORT_FILE)"
    exit 0
fi

# helpers 로드
HELPERS_DIR="$(dirname "$0")/helpers"
if [ -f "$HELPERS_DIR/peer-resolver.sh" ]; then
    source "$HELPERS_DIR/peer-resolver.sh"
fi
if [ -f "$HELPERS_DIR/chain-messenger.sh" ]; then
    source "$HELPERS_DIR/chain-messenger.sh"
fi

# ── 수신 측 dedup (D6) ──
_RECEIVED_LOG="${PROJECT_DIR}/.claude/runtime/chain-received.log"

_check_received() {
    local MSG_ID="$1"
    [ ! -f "$_RECEIVED_LOG" ] && return 1
    local NOW
    NOW=$(date +%s)
    while IFS='|' read -r TS ID; do
        [ -z "$TS" ] && continue
        [ $((NOW - TS)) -lt 300 ] && [ "$ID" = "$MSG_ID" ] && return 0
    done < "$_RECEIVED_LOG"
    return 1
}

_record_received() {
    local MSG_ID="$1"
    mkdir -p "$(dirname "$_RECEIVED_LOG")" 2>/dev/null
    echo "$(date +%s)|$MSG_ID" >> "$_RECEIVED_LOG"
    local NOW TMP
    NOW=$(date +%s)
    TMP="${_RECEIVED_LOG}.tmp"
    while IFS='|' read -r TS ID; do
        [ -z "$TS" ] && continue
        [ $((NOW - TS)) -lt 300 ] && echo "$TS|$ID"
    done < "$_RECEIVED_LOG" > "$TMP" 2>/dev/null
    mv "$TMP" "$_RECEIVED_LOG" 2>/dev/null
}

# msg_id 추출 + dedup
INCOMING_MSG_ID=$(jq -r '.msg_id // empty' "$REPORT_FILE" 2>/dev/null)
if [ -n "$INCOMING_MSG_ID" ] && _check_received "$INCOMING_MSG_ID"; then
    echo "SKIP: dedup msg_id=$INCOMING_MSG_ID (이미 처리됨)"
    exit 0
fi
[ -n "$INCOMING_MSG_ID" ] && _record_received "$INCOMING_MSG_ID"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MSG_ID="chain-pm-$(date +%s)-$$"

# 원본에서 필요한 필드 추출
TASK_FILE=$(jq -r '.payload.task_file // ""' "$REPORT_FILE" 2>/dev/null)
MATCH_RATE=$(jq -r '.payload.match_rate // 0' "$REPORT_FILE" 2>/dev/null)
PROCESS_LEVEL=$(jq -r '.payload.process_level // "L2"' "$REPORT_FILE" 2>/dev/null)
COMMIT_HASH=$(jq -r '.payload.commit_hash // ""' "$REPORT_FILE" 2>/dev/null)

case "$VERDICT" in
    pass)
        # COO(MOZZI)에게 전달
        TO_ROLE="MOZZI"
        CHAIN_STEP="pm_to_coo"
        PAYLOAD=$(cat <<EOFPAYLOAD
{
  "protocol": "bscamp-team/v1",
  "type": "COMPLETION_REPORT",
  "from_role": "PM_LEADER",
  "to_role": "${TO_ROLE}",
  "payload": {
    "task_file": "${TASK_FILE}",
    "match_rate": ${MATCH_RATE},
    "process_level": "${PROCESS_LEVEL}",
    "commit_hash": "${COMMIT_HASH}",
    "chain_step": "${CHAIN_STEP}",
    "pm_verdict": "pass",
    "pm_notes": "${PM_NOTES}"
  },
  "ts": "${TIMESTAMP}",
  "msg_id": "${MSG_ID}"
}
EOFPAYLOAD
)
        ;;
    reject)
        # CTO에게 FEEDBACK
        TO_ROLE="CTO_LEADER"
        CHAIN_STEP="pm_to_cto"
        PAYLOAD=$(cat <<EOFPAYLOAD
{
  "protocol": "bscamp-team/v1",
  "type": "FEEDBACK",
  "from_role": "PM_LEADER",
  "to_role": "${TO_ROLE}",
  "payload": {
    "task_file": "${TASK_FILE}",
    "chain_step": "${CHAIN_STEP}",
    "verdict": "reject",
    "issues": ${ISSUES},
    "pm_notes": "${PM_NOTES}"
  },
  "ts": "${TIMESTAMP}",
  "msg_id": "${MSG_ID}"
}
EOFPAYLOAD
)
        ;;
    *)
        echo "pm-chain-forward: 알 수 없는 verdict: $VERDICT"
        exit 0
        ;;
esac

# 전송 시도
BROKER_URL="${BROKER_URL:-http://localhost:7899}"

if ! check_broker_health 2>/dev/null; then
    echo "pm-chain-forward: broker 미기동. 수동 전달 필요."
    echo "ACTION_REQUIRED: send_message(${TO_ROLE}, ${VERDICT})"
    echo "PAYLOAD: ${PAYLOAD}"
    exit 0
fi

# peer 검색
if type resolve_peer >/dev/null 2>&1; then
    resolve_peer "$TO_ROLE"
    TARGET_ID="$RESOLVED_PEER_ID"
    resolve_self
    MY_ID="$RESOLVED_SELF_ID"
else
    # fallback: summary matching
    PEERS_JSON=$(curl -sf -X POST "${BROKER_URL}/list-peers" \
        -H 'Content-Type: application/json' \
        -d "{\"scope\":\"repo\",\"cwd\":\"${PROJECT_DIR}\",\"git_root\":\"${PROJECT_DIR}\"}" \
        2>/dev/null || echo "[]")
    TARGET_ID=$(echo "$PEERS_JSON" | jq -r "[.[] | select(.summary | test(\"${TO_ROLE}\"))][0].id // empty" 2>/dev/null)
    MY_ID=$(echo "$PEERS_JSON" | jq -r "[.[] | select(.summary | test(\"PM\"))][0].id // empty" 2>/dev/null)
fi

if [ -z "$TARGET_ID" ]; then
    echo "pm-chain-forward: ${TO_ROLE} peer 미발견. 수동 전달 필요."
    echo "ACTION_REQUIRED: send_message(${TO_ROLE}, ${VERDICT})"
    echo "PAYLOAD: ${PAYLOAD}"
    exit 0
fi

if [ -z "$MY_ID" ]; then
    echo "pm-chain-forward: 자기 peer ID 미발견."
    echo "ACTION_REQUIRED: send_message(${TO_ROLE}, ${VERDICT})"
    echo "PAYLOAD: ${PAYLOAD}"
    exit 0
fi

# 전송
if type send_chain_message >/dev/null 2>&1; then
    send_chain_message "$MY_ID" "$TARGET_ID" "$PAYLOAD"
    if [ "$SEND_STATUS" = "ok" ]; then
        echo "pm-chain-forward: ${VERDICT} → ${TO_ROLE} 자동 전송 완료 (${CHAIN_STEP})"
        # verdict 파일 정리
        rm -f "$VERDICT_FILE"
        exit 0
    else
        echo "pm-chain-forward: 전송 실패 (${SEND_STATUS}). 수동 전달 필요."
        echo "ACTION_REQUIRED: send_message(${TO_ROLE}, ${VERDICT})"
        echo "PAYLOAD: ${PAYLOAD}"
        exit 0
    fi
else
    # fallback: direct curl
    SEND_RESULT=$(curl -sf -X POST "${BROKER_URL}/send-message" \
        -H 'Content-Type: application/json' \
        -d "{\"from_id\":\"${MY_ID}\",\"to_id\":\"${TARGET_ID}\",\"text\":$(echo "$PAYLOAD" | jq -c '.')}" \
        2>/dev/null || echo '{"ok":false}')
    SEND_OK=$(echo "$SEND_RESULT" | jq -r '.ok // false' 2>/dev/null)
    if [ "$SEND_OK" = "true" ]; then
        echo "pm-chain-forward: ${VERDICT} → ${TO_ROLE} 자동 전송 완료 (${CHAIN_STEP})"
        rm -f "$VERDICT_FILE"
    else
        echo "pm-chain-forward: 전송 실패. 수동 전달 필요."
        echo "ACTION_REQUIRED: send_message(${TO_ROLE}, ${VERDICT})"
        echo "PAYLOAD: ${PAYLOAD}"
    fi
    exit 0
fi
