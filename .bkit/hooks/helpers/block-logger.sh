#!/bin/bash
# block-logger.sh — hook exit 2 차단 시 자동 로깅
# 모든 hook에서 source하여 사용
# log_block "차단사유" "hook명" → .bkit/runtime/block-log.json에 append

BLOCK_LOG="${PROJECT_DIR:-/Users/smith/projects/bscamp}/.bkit/runtime/block-log.json"

log_block() {
    local REASON="${1:-unknown}"
    local HOOK_NAME="${2:-unknown}"
    local COMMAND="${3:-}"
    local TIMESTAMP
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local SESSION=""
    if [ -n "${TMUX:-}" ]; then
        SESSION=$(tmux display-message -p '#S' 2>/dev/null || true)
    fi

    mkdir -p "$(dirname "$BLOCK_LOG")" 2>/dev/null

    # 초기 파일 생성
    [ ! -f "$BLOCK_LOG" ] && echo '{"blocks":[]}' > "$BLOCK_LOG"

    # JSON append
    if command -v jq >/dev/null 2>&1; then
        local ENTRY
        ENTRY=$(jq -nc \
            --arg ts "$TIMESTAMP" \
            --arg hook "$HOOK_NAME" \
            --arg reason "$REASON" \
            --arg cmd "$COMMAND" \
            --arg session "$SESSION" \
            '{ts:$ts, hook:$hook, reason:$reason, command:$cmd, session:$session}')
        jq --argjson entry "$ENTRY" '.blocks += [$entry]' "$BLOCK_LOG" > "${BLOCK_LOG}.tmp" 2>/dev/null \
            && mv "${BLOCK_LOG}.tmp" "$BLOCK_LOG" \
            || echo "$ENTRY" >> "${BLOCK_LOG}.raw"
    else
        echo "{\"ts\":\"$TIMESTAMP\",\"hook\":\"$HOOK_NAME\",\"reason\":\"$REASON\"}" >> "${BLOCK_LOG}.raw"
    fi
}

# 차단 통계 (세션 시작 시 사용)
block_stats() {
    [ ! -f "$BLOCK_LOG" ] && echo "차단 이력 없음" && return
    local TOTAL TODAY TOP_HOOK
    TOTAL=$(jq '.blocks | length' "$BLOCK_LOG" 2>/dev/null || echo 0)
    TODAY=$(jq --arg d "$(date +%Y-%m-%d)" '[.blocks[] | select(.ts | startswith($d))] | length' "$BLOCK_LOG" 2>/dev/null || echo 0)
    TOP_HOOK=$(jq -r '[.blocks[].hook] | group_by(.) | sort_by(-length) | .[0] | "\(.[0]) (\(length)건)"' "$BLOCK_LOG" 2>/dev/null || echo "-")
    echo "차단 통계: 총 ${TOTAL}건, 오늘 ${TODAY}건, 최다: ${TOP_HOOK}"
}
