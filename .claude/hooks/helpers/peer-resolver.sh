#!/bin/bash
# peer-resolver.sh — 역할명으로 broker peer ID 찾기
# source해서 사용: resolve_peer "PM_LEADER" → RESOLVED_PEER_ID 설정
#
# 3단계 전략:
#   1. peer-map.json (명시적 등록)
#   2. tmux 세션명 → PID 트리 → broker peer 매칭
#   3. broker summary 텍스트 매칭 (레거시)

_PR_PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"
_PR_BROKER_URL="${BROKER_URL:-http://localhost:7899}"

_role_to_session_pattern() {
    case "$1" in
        PM_LEADER|PM) echo "sdk-pm" ;;
        MOZZI|COO)    echo "hermes" ;;
        CTO_LEADER|CTO) echo "sdk-cto" ;;
        *) echo "" ;;
    esac
}

# broker /list-peers (캐시)
_PEERS_CACHE=""
_fetch_peers() {
    if [ -z "$_PEERS_CACHE" ]; then
        _PEERS_CACHE=$(curl -sf -X POST "$_PR_BROKER_URL/list-peers" \
            -H 'Content-Type: application/json' \
            -d "{\"scope\":\"repo\",\"cwd\":\"$_PR_PROJECT_DIR\",\"git_root\":\"$_PR_PROJECT_DIR\"}" \
            2>/dev/null || echo "[]")
    fi
    echo "$_PEERS_CACHE"
}

resolve_peer() {
    local ROLE="$1"
    RESOLVED_PEER_ID=""

    # Strategy 1: peer-map.json
    local MAP_FILE="$_PR_PROJECT_DIR/.claude/runtime/peer-map.json"
    if [ -f "$MAP_FILE" ]; then
        local MAPPED_ID=$(jq -r ".\"$ROLE\".peerId // empty" "$MAP_FILE" 2>/dev/null)
        if [ -n "$MAPPED_ID" ]; then
            local PEERS=$(_fetch_peers)
            if echo "$PEERS" | jq -e ".[] | select(.id == \"$MAPPED_ID\")" >/dev/null 2>&1; then
                RESOLVED_PEER_ID="$MAPPED_ID"
                return 0
            fi
        fi
    fi

    # Strategy 2: tmux 세션명 → PID 트리 → broker peer
    local PATTERN=$(_role_to_session_pattern "$ROLE")
    if [ -n "$PATTERN" ] && command -v tmux >/dev/null 2>&1 && [ -n "${TMUX:-}" ]; then
        local PEERS=$(_fetch_peers)
        local PANE_PIDS=$(tmux list-panes -a -F '#{session_name} #{pane_pid}' 2>/dev/null | \
            grep "^${PATTERN}" | awk '{print $2}')

        for PANE_P in $PANE_PIDS; do
            for CPID in $(pgrep -P "$PANE_P" 2>/dev/null); do
                local MATCH=$(echo "$PEERS" | jq -r "[.[] | select(.pid == $CPID)][0].id // empty" 2>/dev/null)
                [ -n "$MATCH" ] && { RESOLVED_PEER_ID="$MATCH"; return 0; }
                for GCPID in $(pgrep -P "$CPID" 2>/dev/null); do
                    MATCH=$(echo "$PEERS" | jq -r "[.[] | select(.pid == $GCPID)][0].id // empty" 2>/dev/null)
                    [ -n "$MATCH" ] && { RESOLVED_PEER_ID="$MATCH"; return 0; }
                done
            done
        done
    fi

    # Strategy 3: summary 텍스트 매칭 (레거시)
    local PEERS=$(_fetch_peers)
    RESOLVED_PEER_ID=$(echo "$PEERS" | jq -r "[.[] | select(.summary | test(\"$ROLE\"))][0].id // empty" 2>/dev/null)
    [ -n "$RESOLVED_PEER_ID" ] && return 0

    return 1
}

resolve_self() {
    RESOLVED_SELF_ID=""
    local PEERS=$(_fetch_peers)

    # Strategy 1: peer-map.json
    local MAP_FILE="$_PR_PROJECT_DIR/.claude/runtime/peer-map.json"
    # team-context resolver (팀별 파일 분리)
    local _PR_RESOLVER="$_PR_PROJECT_DIR/.claude/hooks/helpers/team-context-resolver.sh"
    if [ -f "$_PR_RESOLVER" ]; then
        local _OLD_PD="${PROJECT_DIR:-}"
        PROJECT_DIR="$_PR_PROJECT_DIR"
        source "$_PR_RESOLVER"
        resolve_team_context 2>/dev/null
        PROJECT_DIR="${_OLD_PD:-}"
    fi
    local CONTEXT_FILE="${TEAM_CONTEXT_FILE:-$_PR_PROJECT_DIR/.claude/runtime/team-context.json}"
    if [ -f "$MAP_FILE" ] && [ -f "$CONTEXT_FILE" ]; then
        local MY_TEAM=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null)
        if [ -n "$MY_TEAM" ]; then
            # CTO-2 → CTO 접두사로 매핑
            local BASE_TEAM=$(echo "$MY_TEAM" | sed 's/-[0-9]*//')
            local MAPPED_ID=$(jq -r ".\"${BASE_TEAM}_LEADER\".peerId // empty" "$MAP_FILE" 2>/dev/null)
            if [ -n "$MAPPED_ID" ]; then
                RESOLVED_SELF_ID="$MAPPED_ID"
                return 0
            fi
        fi
    fi

    # Strategy 2: 현재 tmux 세션 PID 트리
    if command -v tmux >/dev/null 2>&1 && [ -n "${TMUX:-}" ]; then
        local MY_PANE_PID=$(tmux display-message -p '#{pane_pid}' 2>/dev/null)
        if [ -n "$MY_PANE_PID" ]; then
            for CPID in $(pgrep -P "$MY_PANE_PID" 2>/dev/null); do
                local MATCH=$(echo "$PEERS" | jq -r "[.[] | select(.pid == $CPID)][0].id // empty" 2>/dev/null)
                [ -n "$MATCH" ] && { RESOLVED_SELF_ID="$MATCH"; return 0; }
                for GCPID in $(pgrep -P "$CPID" 2>/dev/null); do
                    MATCH=$(echo "$PEERS" | jq -r "[.[] | select(.pid == $GCPID)][0].id // empty" 2>/dev/null)
                    [ -n "$MATCH" ] && { RESOLVED_SELF_ID="$MATCH"; return 0; }
                done
            done
        fi
    fi

    # Strategy 3: CTO summary 매칭
    RESOLVED_SELF_ID=$(echo "$PEERS" | jq -r "[.[] | select(.summary | test(\"CTO\"))][0].id // empty" 2>/dev/null)
    [ -n "$RESOLVED_SELF_ID" ] && return 0

    return 1
}
