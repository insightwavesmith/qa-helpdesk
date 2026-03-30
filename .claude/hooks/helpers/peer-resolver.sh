#!/bin/bash
# peer-resolver.sh V3 — 역할명으로 broker peer ID 찾기
# source해서 사용: resolve_peer "PM_LEADER" → RESOLVED_PEER_ID 설정
#
# V3 4단계 전략:
#   1. peer-map.json (자동 등록 결과)          ← 가장 빠르고 확실
#   2. PID 역추적 → broker peer 매칭           ← resolve_self에서만
#   3. tmux 세션명 → PID 트리 → broker peer    ← TMUX 환경변수 불필요
#   4. broker summary 텍스트 매칭              ← 레거시 fallback

_PR_PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"
_PR_RUNTIME_DIR="$_PR_PROJECT_DIR/.bkit/runtime"
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

    # Strategy 1: peer-map.json (자동 등록 결과)
    local MAP_FILE="$_PR_RUNTIME_DIR/peer-map.json"
    if [ -f "$MAP_FILE" ]; then
        local MAPPED_ID=$(jq -r ".\"$ROLE\".peerId // empty" "$MAP_FILE" 2>/dev/null)
        if [ -n "$MAPPED_ID" ]; then
            # broker에 아직 살아있는지 확인
            local PEERS=$(_fetch_peers)
            if echo "$PEERS" | jq -e ".[] | select(.id == \"$MAPPED_ID\")" >/dev/null 2>&1; then
                RESOLVED_PEER_ID="$MAPPED_ID"
                return 0
            fi
            # 등록은 있는데 broker에 없음 → stale entry 삭제
            jq "del(.\"$ROLE\")" "$MAP_FILE" > "${MAP_FILE}.tmp" && \
            mv "${MAP_FILE}.tmp" "$MAP_FILE" 2>/dev/null
        fi
    fi

    # Strategy 2: PID 역추적 — target의 PID를 알 수 없으므로 self에만 적용
    # target은 Strategy 3, 4로 fallback

    # Strategy 3: tmux 세션명 → PID 트리 → broker peer
    local PATTERN=$(_role_to_session_pattern "$ROLE")
    if [ -n "$PATTERN" ] && command -v tmux >/dev/null 2>&1; then
        # TMUX 환경변수 체크 제거 — tmux server가 있으면 시도
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

    # Strategy 4: summary 텍스트 매칭 (레거시)
    local PEERS=$(_fetch_peers)
    RESOLVED_PEER_ID=$(echo "$PEERS" | jq -r "[.[] | select(.summary | test(\"$ROLE\"))][0].id // empty" 2>/dev/null)
    [ -n "$RESOLVED_PEER_ID" ] && return 0

    return 1
}

resolve_self() {
    RESOLVED_SELF_ID=""

    # Strategy 1: peer-map.json
    local ROLE
    ROLE=$(get_my_role 2>/dev/null)
    if [ -n "$ROLE" ]; then
        local MAP_FILE="$_PR_RUNTIME_DIR/peer-map.json"
        if [ -f "$MAP_FILE" ]; then
            local MAPPED_ID=$(jq -r ".\"$ROLE\".peerId // empty" "$MAP_FILE" 2>/dev/null)
            if [ -n "$MAPPED_ID" ]; then
                RESOLVED_SELF_ID="$MAPPED_ID"
                return 0
            fi
        fi
    fi

    # Strategy 2: PID 역추적 (핵심 개선)
    RESOLVED_SELF_ID=$(find_my_peer_id 2>/dev/null)
    [ -n "$RESOLVED_SELF_ID" ] && return 0

    # Strategy 3: 현재 tmux 세션 PID 트리
    if command -v tmux >/dev/null 2>&1; then
        local PEERS=$(_fetch_peers)
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

    # Strategy 4: CTO summary 매칭 (레거시)
    local PEERS=$(_fetch_peers)
    RESOLVED_SELF_ID=$(echo "$PEERS" | jq -r "[.[] | select(.summary | test(\"CTO\"))][0].id // empty" 2>/dev/null)
    [ -n "$RESOLVED_SELF_ID" ] && return 0

    return 1
}
