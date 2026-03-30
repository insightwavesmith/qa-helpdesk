#!/bin/bash
# helpers/hook-self-register.sh — PID 역추적 자동 등록
# source해서 사용: auto_register_peer
#
# PID 역추적으로 현재 hook을 실행한 Claude Code의 broker peer ID를 찾아
# peer-map.json에 자동 등록한다.
#
# 의존: broker /list-peers, team-context 파일, jq

_HSR_RUNTIME_DIR="${PROJECT_DIR:-.}/.bkit/runtime"
_HSR_PEER_MAP="$_HSR_RUNTIME_DIR/peer-map.json"
_HSR_BROKER_URL="${BROKER_URL:-http://localhost:7899}"

# PID 역추적으로 broker peer ID 찾기
# 현재 $$ → 부모 → 조부모 ... 최대 10단계 탐색
find_my_peer_id() {
    local PID=$$
    local PEERS
    PEERS=$(curl -sf -X POST "$_HSR_BROKER_URL/list-peers" \
        -H 'Content-Type: application/json' \
        -d "{\"scope\":\"repo\",\"cwd\":\"$PROJECT_DIR\",\"git_root\":\"$PROJECT_DIR\"}" \
        2>/dev/null || echo "[]")

    local I=0
    while [ "$I" -lt 10 ]; do
        local MATCH
        MATCH=$(echo "$PEERS" | jq -r ".[] | select(.pid == $PID) | .id" 2>/dev/null)
        if [ -n "$MATCH" ] && [ "$MATCH" != "null" ]; then
            echo "$MATCH"
            return 0
        fi
        PID=$(ps -o ppid= -p "$PID" 2>/dev/null | tr -d ' ')
        [ -z "$PID" ] || [ "$PID" = "1" ] || [ "$PID" = "0" ] && break
        I=$((I + 1))
    done
    return 1
}

# 현재 세션 역할을 team-context에서 추출
get_my_role() {
    local CTX_FILE
    # team-context-resolver 사용 (있으면)
    if [ -f "$PROJECT_DIR/.claude/hooks/helpers/team-context-resolver.sh" ]; then
        source "$PROJECT_DIR/.claude/hooks/helpers/team-context-resolver.sh"
        resolve_team_context 2>/dev/null
        CTX_FILE="${TEAM_CONTEXT_FILE:-}"
    fi
    [ -z "$CTX_FILE" ] && CTX_FILE="$_HSR_RUNTIME_DIR/team-context.json"
    [ ! -f "$CTX_FILE" ] && { echo ""; return 1; }

    local TEAM
    TEAM=$(jq -r '.team // empty' "$CTX_FILE" 2>/dev/null)
    case "$TEAM" in
        CTO*) echo "CTO_LEADER" ;;
        PM*)  echo "PM_LEADER" ;;
        COO*|hermes*) echo "MOZZI" ;;
        *)    [ -n "$TEAM" ] && echo "${TEAM}_LEADER" || echo "" ;;
    esac
}

# peer-map.json에 자동 등록 (멱등)
auto_register_peer() {
    # jq 필수
    command -v jq >/dev/null 2>&1 || return 0

    local PEER_ID
    PEER_ID=$(find_my_peer_id) || return 1

    local ROLE
    ROLE=$(get_my_role)
    [ -z "$ROLE" ] && return 1

    mkdir -p "$_HSR_RUNTIME_DIR" 2>/dev/null

    local NOW
    NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local CC_PID
    CC_PID=$(ps -o ppid= -p $$ 2>/dev/null | tr -d ' ')

    # peer-map.json이 없으면 생성
    if [ ! -f "$_HSR_PEER_MAP" ]; then
        echo "{}" > "$_HSR_PEER_MAP"
    fi

    # 같은 역할이 이미 같은 peerId로 등록돼 있으면 스킵 (멱등)
    local EXISTING
    EXISTING=$(jq -r ".\"$ROLE\".peerId // empty" "$_HSR_PEER_MAP" 2>/dev/null)
    [ "$EXISTING" = "$PEER_ID" ] && return 0

    # 등록/업데이트
    jq --arg role "$ROLE" \
       --arg peerId "$PEER_ID" \
       --arg ts "$NOW" \
       --argjson ccPid "${CC_PID:-0}" \
       '.[$role] = {peerId: $peerId, ccPid: $ccPid, registeredAt: $ts}' \
       "$_HSR_PEER_MAP" > "${_HSR_PEER_MAP}.tmp" && \
    mv "${_HSR_PEER_MAP}.tmp" "$_HSR_PEER_MAP"

    return 0
}
