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

# Health check — 0=OK, 1=DOWN
check_broker_health() {
    curl -sf "${_CM_BROKER_URL}/health" >/dev/null 2>&1
    return $?
}

# 메시지 전송 (retry 포함)
# $1: from_id, $2: to_id, $3: payload (JSON string)
# 결과: SEND_STATUS="ok"|"fail"|"broker_down"
send_chain_message() {
    local FROM_ID="$1"
    local TO_ID="$2"
    local PAYLOAD="$3"
    SEND_STATUS="broker_down"
    SEND_DETAIL=""

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
        RESULT=$(curl -sf -X POST "${_CM_BROKER_URL}/send-message" \
            -H 'Content-Type: application/json' \
            -d "{\"from_id\":\"${FROM_ID}\",\"to_id\":\"${TO_ID}\",\"text\":$(echo "$PAYLOAD" | jq -c '.' 2>/dev/null || echo "\"$PAYLOAD\"")}" \
            2>/dev/null || echo '{"ok":false}')

        local OK
        OK=$(echo "$RESULT" | jq -r '.ok // false' 2>/dev/null)

        if [ "$OK" = "true" ]; then
            SEND_STATUS="ok"
            SEND_DETAIL="attempt=$ATTEMPT"
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
