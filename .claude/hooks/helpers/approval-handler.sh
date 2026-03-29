#!/bin/bash
# helpers/approval-handler.sh — 팀원 위험 파일 수정 승인 게이트
# B1 requireApproval: exit 2 차단 → 승인 파일 기반 게이트
#
# 사용: source approval-handler.sh
#   check_approval "$REL_FILE"  → return 0 (승인) / return 1 (미승인)
#   request_approval "$REL_FILE" "$TOOL_NAME"  → 요청 파일 생성

_APPROVAL_DIR="${PROJECT_DIR:-.}/.claude/runtime/approvals"

# 승인 대상 파일 판별
is_approval_required() {
    local REL_FILE="$1"
    echo "$REL_FILE" | grep -qE '\.claude/|migration|\.env' && return 0
    return 1
}

# 파일 경로 → 안전한 키
_approval_key() {
    echo "$1" | sed 's/[^a-zA-Z0-9]/_/g'
}

# 승인 확인 (return 0 = 승인됨, return 1 = 미승인/만료)
check_approval() {
    local REL_FILE="$1"
    local KEY
    KEY=$(_approval_key "$REL_FILE")
    local GRANT_FILE="${_APPROVAL_DIR}/granted/${KEY}"

    [ ! -f "$GRANT_FILE" ] && return 1

    local GRANT_TS
    GRANT_TS=$(cat "$GRANT_FILE" 2>/dev/null)

    # "rejected" 문자열이면 거부
    [ "$GRANT_TS" = "rejected" ] && return 1

    # 숫자가 아니면 미승인
    [ -z "$GRANT_TS" ] && return 1
    echo "$GRANT_TS" | grep -qE '^[0-9]+$' || return 1

    # TTL 300초 (5분) 초과 시 만료
    local NOW
    NOW=$(date +%s)
    [ $((NOW - GRANT_TS)) -gt 300 ] && return 1

    return 0
}

# 승인 요청 생성
request_approval() {
    local REL_FILE="$1"
    local TOOL_NAME="${2:-Edit}"
    local KEY
    KEY=$(_approval_key "$REL_FILE")

    mkdir -p "${_APPROVAL_DIR}/pending" 2>/dev/null
    cat > "${_APPROVAL_DIR}/pending/${KEY}.json" <<EOFREQ
{"file":"${REL_FILE}","tool":"${TOOL_NAME}","ts":$(date +%s)}
EOFREQ

    # Slack 알림 (실패해도 무시)
    if type notify_hook >/dev/null 2>&1; then
        notify_hook "🔐 승인 요청: 팀원이 ${REL_FILE} 수정 시도. 승인 필요." "approval-gate" 2>/dev/null
    fi
}
