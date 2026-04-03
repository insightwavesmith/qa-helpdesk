#!/bin/bash
# helpers/hook-self-register.sh — PID 역추적 자동 등록 (V3)
# source해서 사용: auto_register_peer
#
# PID 역추적으로 현재 hook을 실행한 Claude Code의 broker peer ID를 찾아
# peer-map.json에 자동 등록한다.
#
# 의존: broker /list-peers, team-context 파일, jq
# 안전: 실패해도 exit 0 (호출 hook 중단 방지)

_HSR_PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"
_HSR_RUNTIME_DIR="$_HSR_PROJECT_DIR/.bkit/runtime"
_HSR_PEER_MAP="$_HSR_RUNTIME_DIR/peer-map.json"
_HSR_BROKER_URL="${BROKER_URL:-http://localhost:7899}"

# PID 역추적으로 broker peer ID 찾기
# 현재 $$ → 부모 → 조부모 ... 최대 10단계 탐색
find_my_peer_id() {
    local PID=$$
    local PEERS
    PEERS=$(curl -sf --max-time 2 -X POST "$_HSR_BROKER_URL/list-peers" \
        -H 'Content-Type: application/json' \
        -d "{\"scope\":\"repo\",\"cwd\":\"$_HSR_PROJECT_DIR\",\"git_root\":\"$_HSR_PROJECT_DIR\"}" \
        2>/dev/null || echo "[]")

    # broker 응답이 비어있으면 즉시 종료
    [ "$PEERS" = "[]" ] || [ -z "$PEERS" ] && return 1

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
    local CTX_FILE=""

    # team-context-resolver 사용 (있으면)
    if [ -f "$_HSR_PROJECT_DIR/.bkit/hooks/helpers/team-context-resolver.sh" ]; then
        source "$_HSR_PROJECT_DIR/.bkit/hooks/helpers/team-context-resolver.sh"
        resolve_team_context 2>/dev/null
        CTX_FILE="${TEAM_CONTEXT_FILE:-}"
    fi

    # team-context-*.json 파일 스캔 (resolver 실패 시)
    if [ -z "$CTX_FILE" ] || [ ! -f "$CTX_FILE" ]; then
        # 가장 최근 team-context 파일 사용 (archived 제외)
        CTX_FILE=$(ls -t "$_HSR_RUNTIME_DIR"/team-context-*.json 2>/dev/null | grep -v archived | head -1)
    fi
    [ -z "$CTX_FILE" ] && CTX_FILE="$_HSR_RUNTIME_DIR/team-context.json"
    [ ! -f "$CTX_FILE" ] && { echo ""; return 1; }

    local TEAM
    TEAM=$(jq -r '.team // empty' "$CTX_FILE" 2>/dev/null)
    case "$TEAM" in
        CTO*) echo "CTO_LEADER" ;;
        PM*)  echo "PM_LEADER" ;;
        COO*|hermes*) echo "MOZZI" ;;
        MKT*) echo "MKT_LEADER" ;;
        *)    [ -n "$TEAM" ] && echo "${TEAM}_LEADER" || echo "" ;;
    esac
}

# peer-map.json에 자동 등록 (멱등)
# 성공 시 return 0, 실패해도 호출 hook 중단하지 않음
auto_register_peer() {
    # 전체 함수를 stderr 억제로 감싸서 hook error 표시 방지
    _auto_register_peer_impl "$@" 2>/dev/null
    return 0
}

_auto_register_peer_impl() {
    # jq 필수
    command -v jq >/dev/null 2>&1 || return 0

    # ── Fast path: 이미 등록돼 있으면 broker 호출 스킵 ──
    if [ -f "$_HSR_PEER_MAP" ]; then
        local FAST_ROLE
        FAST_ROLE=$(get_my_role 2>/dev/null)
        if [ -n "$FAST_ROLE" ]; then
            local FAST_EXISTING
            FAST_EXISTING=$(jq -r ".\"$FAST_ROLE\".peerId // empty" "$_HSR_PEER_MAP" 2>/dev/null)
            # 이미 등록된 peerId가 있으면 즉시 리턴 (broker 호출 0)
            [ -n "$FAST_EXISTING" ] && return 0
        fi
    fi

    # ── Full registration: broker 호출 필요 ──
    local PEER_ID
    PEER_ID=$(find_my_peer_id) || return 0

    local ROLE
    ROLE=$(get_my_role 2>/dev/null)
    [ -z "$ROLE" ] && return 0

    mkdir -p "$_HSR_RUNTIME_DIR" 2>/dev/null

    local NOW
    NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local CC_PID
    CC_PID=$(ps -o ppid= -p $$ 2>/dev/null | tr -d ' ')
    [ -z "$CC_PID" ] && CC_PID=0

    # peer-map.json이 없으면 생성
    if [ ! -f "$_HSR_PEER_MAP" ]; then
        echo "{}" > "$_HSR_PEER_MAP"
    fi

    # 같은 역할이 이미 같은 peerId로 등록돼 있으면 스킵 (멱등)
    local EXISTING
    EXISTING=$(jq -r ".\"$ROLE\".peerId // empty" "$_HSR_PEER_MAP" 2>/dev/null)
    [ "$EXISTING" = "$PEER_ID" ] && return 0

    # atomic write: tmp → mv
    jq --arg role "$ROLE" \
       --arg peerId "$PEER_ID" \
       --arg ts "$NOW" \
       --argjson ccPid "${CC_PID}" \
       '.[$role] = {peerId: $peerId, ccPid: $ccPid, registeredAt: $ts}' \
       "$_HSR_PEER_MAP" > "${_HSR_PEER_MAP}.tmp" 2>/dev/null && \
    mv "${_HSR_PEER_MAP}.tmp" "$_HSR_PEER_MAP" 2>/dev/null

    return 0
}
