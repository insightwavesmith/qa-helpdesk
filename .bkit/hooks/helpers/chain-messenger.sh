#!/bin/bash
# chain-messenger.sh — broker 메시지 전송 헬퍼 (retry + ACK)
# source해서 사용: send_chain_message "$FROM_ID" "$TARGET_ID" "$PAYLOAD"
#
# 기능:
#   - broker health check
#   - send-message with retry (최대 3회)
#   - 결과 상태 반환

_CM_BROKER_URL="${BROKER_URL:-http://localhost:7899}"
_CM_MAX_RETRY="${CHAIN_MAX_RETRY:-3}"
_CM_RETRY_DELAY="${CHAIN_RETRY_DELAY:-2}"
_CM_SENT_LOG="${PROJECT_DIR:-.}/.bkit/runtime/chain-sent.log"

# dedup check — 5분 이내 동일 msg_id 있으면 중복 (return 0=중복, 1=신규)
_check_dedup() {
    local MSG_ID="$1"
    if [ ! -f "$_CM_SENT_LOG" ]; then
        return 1
    fi
    local NOW
    NOW=$(date +%s)
    while IFS='|' read -r TS ID; do
        [ -z "$TS" ] && continue
        local AGE=$((NOW - TS))
        if [ "$AGE" -lt 300 ] && [ "$ID" = "$MSG_ID" ]; then
            return 0
        fi
    done < "$_CM_SENT_LOG"
    return 1
}

# 전송 기록 + stale 정리
_record_sent() {
    local MSG_ID="$1"
    mkdir -p "$(dirname "$_CM_SENT_LOG")" 2>/dev/null
    echo "$(date +%s)|$MSG_ID" >> "$_CM_SENT_LOG"
    # stale 정리 (300초 이상 된 항목 제거)
    local NOW
    NOW=$(date +%s)
    if [ -f "$_CM_SENT_LOG" ]; then
        local TMP="${_CM_SENT_LOG}.tmp"
        while IFS='|' read -r TS ID; do
            [ -z "$TS" ] && continue
            [ $((NOW - TS)) -lt 300 ] && echo "$TS|$ID"
        done < "$_CM_SENT_LOG" > "$TMP"
        mv "$TMP" "$_CM_SENT_LOG"
    fi
}

# Health check — 0=OK, 1=DOWN
check_broker_health() {
    curl -sf --connect-timeout 2 --max-time 3 "${_CM_BROKER_URL}/health" >/dev/null 2>&1
    return $?
}

# 메시지 전송 (retry + dedup 포함)
# $1: from_id, $2: to_id, $3: payload (JSON string), $4: msg_id (선택적)
# 결과: SEND_STATUS="ok"|"fail"|"broker_down"|"dedup_skip"
send_chain_message() {
    local FROM_ID="$1"
    local TO_ID="$2"
    local PAYLOAD="$3"
    local MSG_ID="${4:-}"
    SEND_STATUS="broker_down"
    SEND_DETAIL=""

    # dedup check (msg_id 있을 때만)
    if [ -n "$MSG_ID" ] && _check_dedup "$MSG_ID"; then
        SEND_STATUS="dedup_skip"
        SEND_DETAIL="msg_id=$MSG_ID already sent within 5min"
        return 0
    fi

    # health check
    if ! check_broker_health; then
        SEND_STATUS="broker_down"
        SEND_DETAIL="broker 미기동"
        return 1
    fi

    # retry loop
    local ATTEMPT=0
    while [ "$ATTEMPT" -lt "$_CM_MAX_RETRY" ]; do
        ATTEMPT=$((ATTEMPT + 1))

        local RESULT
        RESULT=$(curl -sf --connect-timeout 2 --max-time 3 -X POST "${_CM_BROKER_URL}/send-message" \
            -H 'Content-Type: application/json' \
            -d "{\"from_id\":\"${FROM_ID}\",\"to_id\":\"${TO_ID}\",\"text\":$(echo "$PAYLOAD" | jq -c '.' 2>/dev/null || echo "\"$PAYLOAD\"")}" \
            2>/dev/null || echo '{"ok":false}')

        local OK
        OK=$(echo "$RESULT" | jq -r '.ok // false' 2>/dev/null)

        if [ "$OK" = "true" ]; then
            SEND_STATUS="ok"
            SEND_DETAIL="attempt=$ATTEMPT"
            # 전송 성공 기록 (dedup용)
            if [ -n "$MSG_ID" ]; then
                _record_sent "$MSG_ID"
            fi
            return 0
        fi

        # 마지막 시도가 아니면 대기
        if [ "$ATTEMPT" -lt "$_CM_MAX_RETRY" ]; then
            sleep "$_CM_RETRY_DELAY"
        fi
    done

    SEND_STATUS="fail"
    SEND_DETAIL="max_retry=${_CM_MAX_RETRY} exhausted"
    return 1
}

# webhook wake 전송 (OpenClaw)
# $1: webhook URL, $2: payload
send_webhook_wake() {
    local WEBHOOK_URL="${1:-http://127.0.0.1:18789/hooks/wake}"
    local PAYLOAD="$2"
    local WEBHOOK_TOKEN="${OPENCLAW_WEBHOOK_TOKEN:-mz-hook-Kx9mP4vR7nWqZj2026}"
    WEBHOOK_STATUS="fail"

    local RESULT
    RESULT=$(curl -sf -X POST "$WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -H "Authorization: Bearer ${WEBHOOK_TOKEN}" \
        -d "$PAYLOAD" \
        2>/dev/null)

    if [ $? -eq 0 ]; then
        WEBHOOK_STATUS="ok"
        return 0
    fi

    WEBHOOK_STATUS="fail"
    return 1
}
