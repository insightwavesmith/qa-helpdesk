#!/bin/bash
# coo-chain-report.sh — COO(MOZZI) 보고서 생성 + webhook wake
# COO가 PM으로부터 COMPLETION_REPORT 수신 후:
#   1. Smith님 보고용 요약 생성
#   2. OpenClaw webhook wake 호출 (슬랙 자동 보고)
#   3. Smith님 판단 대기 (승인/반려)
#
# 입력: $PROJECT_DIR/.claude/runtime/last-pm-report.json
# 출력: 슬랙 보고 + pm-verdict.json 또는 coo-feedback

set -uo pipefail

PROJECT_DIR="/Users/smith/projects/bscamp"
cd "$PROJECT_DIR" || exit 0

# helpers 로드
HELPERS_DIR="$(dirname "$0")/helpers"
[ -f "$HELPERS_DIR/chain-messenger.sh" ] && source "$HELPERS_DIR/chain-messenger.sh"
[ -f "$HELPERS_DIR/peer-resolver.sh" ] && source "$HELPERS_DIR/peer-resolver.sh"

# PM 보고서 확인
REPORT_FILE="$PROJECT_DIR/.claude/runtime/last-pm-report.json"
if [ ! -f "$REPORT_FILE" ]; then
    exit 0
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

INCOMING_MSG_ID=$(jq -r '.msg_id // empty' "$REPORT_FILE" 2>/dev/null)
if [ -n "$INCOMING_MSG_ID" ] && _check_received "$INCOMING_MSG_ID"; then
    echo "SKIP: dedup msg_id=$INCOMING_MSG_ID (이미 처리됨)"
    exit 0
fi
[ -n "$INCOMING_MSG_ID" ] && _record_received "$INCOMING_MSG_ID"

# 필드 추출
TASK_FILE=$(jq -r '.payload.task_file // ""' "$REPORT_FILE" 2>/dev/null)
MATCH_RATE=$(jq -r '.payload.match_rate // 0' "$REPORT_FILE" 2>/dev/null)
PROCESS_LEVEL=$(jq -r '.payload.process_level // "L2"' "$REPORT_FILE" 2>/dev/null)
PM_VERDICT=$(jq -r '.payload.pm_verdict // ""' "$REPORT_FILE" 2>/dev/null)
PM_NOTES=$(jq -r '.payload.pm_notes // ""' "$REPORT_FILE" 2>/dev/null)
COMMIT_HASH=$(jq -r '.payload.commit_hash // ""' "$REPORT_FILE" 2>/dev/null)

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Smith님 보고 JSON
SMITH_REPORT=$(cat <<EOFREPORT
{
  "protocol": "bscamp-team/v1",
  "type": "COO_REPORT",
  "payload": {
    "task_file": "${TASK_FILE}",
    "match_rate": ${MATCH_RATE},
    "process_level": "${PROCESS_LEVEL}",
    "pm_verdict": "${PM_VERDICT}",
    "pm_notes": "${PM_NOTES}",
    "commit_hash": "${COMMIT_HASH}",
    "chain_step": "coo_report",
    "action_required": "smith_approval"
  },
  "ts": "${TIMESTAMP}"
}
EOFREPORT
)

# 보고 파일 저장
REPORT_OUT="$PROJECT_DIR/.claude/runtime/coo-smith-report.json"
echo "$SMITH_REPORT" | jq '.' > "$REPORT_OUT" 2>/dev/null

echo "coo-chain-report: Smith님 보고서 생성 완료"
echo "  task: ${TASK_FILE}"
echo "  match_rate: ${MATCH_RATE}%"
echo "  pm_verdict: ${PM_VERDICT}"

# OpenClaw webhook wake
WEBHOOK_URL="${OPENCLAW_WEBHOOK_URL:-http://127.0.0.1:18789/hooks/wake}"

WAKE_PAYLOAD=$(cat <<EOFWAKE
{
  "text": "개발 완료 보고: ${TASK_FILE} (Match Rate ${MATCH_RATE}%, PM: ${PM_VERDICT})",
  "mode": "now"
}
EOFWAKE
)

if type send_webhook_wake >/dev/null 2>&1; then
    send_webhook_wake "$WEBHOOK_URL" "$WAKE_PAYLOAD"
    if [ "$WEBHOOK_STATUS" = "ok" ]; then
        echo "coo-chain-report: OpenClaw webhook wake 성공"
    else
        echo "coo-chain-report: webhook wake 실패. 수동 보고 필요."
        echo "ACTION_REQUIRED: Smith님에게 직접 보고"
        echo "REPORT: ${SMITH_REPORT}"
    fi
else
    # direct curl
    WEBHOOK_TOKEN="${OPENCLAW_WEBHOOK_TOKEN:-mz-hook-Kx9mP4vR7nWqZj2026}"
    if curl -sf -X POST "$WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -H "Authorization: Bearer ${WEBHOOK_TOKEN}" \
        -d "$WAKE_PAYLOAD" >/dev/null 2>&1; then
        echo "coo-chain-report: OpenClaw webhook wake 성공"
    else
        echo "coo-chain-report: webhook wake 실패. 수동 보고 필요."
        echo "ACTION_REQUIRED: Smith님에게 직접 보고"
        echo "REPORT: ${SMITH_REPORT}"
    fi
fi

# COO 반려 처리 (Smith님 반려 시)
# coo-feedback.json이 있으면 PM에게 FEEDBACK 전달
FEEDBACK_FILE="$PROJECT_DIR/.claude/runtime/coo-feedback.json"
if [ -f "$FEEDBACK_FILE" ]; then
    FEEDBACK_VERDICT=$(jq -r '.verdict // empty' "$FEEDBACK_FILE" 2>/dev/null)
    if [ "$FEEDBACK_VERDICT" = "reject" ]; then
        FEEDBACK_NOTES=$(jq -r '.notes // ""' "$FEEDBACK_FILE" 2>/dev/null)
        FEEDBACK_ISSUES=$(jq -c '.issues // []' "$FEEDBACK_FILE" 2>/dev/null)

        FEEDBACK_PAYLOAD=$(cat <<EOFFB
{
  "protocol": "bscamp-team/v1",
  "type": "FEEDBACK",
  "from_role": "COO",
  "to_role": "PM_LEADER",
  "payload": {
    "task_file": "${TASK_FILE}",
    "chain_step": "coo_to_pm",
    "verdict": "reject",
    "issues": ${FEEDBACK_ISSUES},
    "notes": "${FEEDBACK_NOTES}"
  },
  "ts": "${TIMESTAMP}",
  "msg_id": "chain-coo-$(date +%s)-$$"
}
EOFFB
)

        BROKER_URL="${BROKER_URL:-http://localhost:7899}"
        if type resolve_peer >/dev/null 2>&1 && type send_chain_message >/dev/null 2>&1; then
            resolve_peer "PM_LEADER"
            resolve_self
            if [ -n "$RESOLVED_PEER_ID" ] && [ -n "$RESOLVED_SELF_ID" ]; then
                send_chain_message "$RESOLVED_SELF_ID" "$RESOLVED_PEER_ID" "$FEEDBACK_PAYLOAD"
                if [ "$SEND_STATUS" = "ok" ]; then
                    echo "coo-chain-report: 반려 → PM 자동 전달 완료"
                    rm -f "$FEEDBACK_FILE"
                else
                    echo "coo-chain-report: PM 전달 실패. 수동 전달 필요."
                    echo "ACTION_REQUIRED: send_message(PM_LEADER, FEEDBACK)"
                    echo "PAYLOAD: ${FEEDBACK_PAYLOAD}"
                fi
            else
                echo "coo-chain-report: peer 미발견. 수동 전달 필요."
                echo "ACTION_REQUIRED: send_message(PM_LEADER, FEEDBACK)"
                echo "PAYLOAD: ${FEEDBACK_PAYLOAD}"
            fi
        else
            echo "coo-chain-report: chain-messenger 미사용. 수동 전달 필요."
            echo "ACTION_REQUIRED: send_message(PM_LEADER, FEEDBACK)"
            echo "PAYLOAD: ${FEEDBACK_PAYLOAD}"
        fi
    fi
fi

exit 0
