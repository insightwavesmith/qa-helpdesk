#!/bin/bash
# helpers/team-context-resolver.sh — 팀별 team-context 파일 경로 해석
# source해서 사용: resolve_team_context, list_all_team_contexts
#
# 병렬 팀(CTO/PM/COO) 동시 운영 시 파일 충돌 방지.
# 각 팀은 team-context-{session}.json 독립 파일 사용.

# resolve_team_context() — TEAM_CONTEXT_FILE 변수에 경로 설정
#
# 탐색 순서:
# 1. TEAM_CONTEXT_FILE 환경변수 이미 설정 + 파일 존재 → 그대로 (테스트/외부 주입)
# 2. tmux 세션명 → team-context-{session}.json
# 3. tmux 없음 → team-context-local.json
# 4. 신규 파일 없고 레거시 team-context.json 존재 → 레거시 (하위 호환)
# 5. 아카이브 파일 존재 → 아카이브 (TeamDelete 후 체인 참조)
resolve_team_context() {
    local _RTC_PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"
    local _RTC_RUNTIME_DIR="$_RTC_PROJECT_DIR/.claude/runtime"

    # 1. 환경변수 override (테스트 환경)
    if [ -n "${TEAM_CONTEXT_FILE:-}" ] && [ -f "$TEAM_CONTEXT_FILE" ]; then
        return 0
    fi

    # 2/3. 세션명 결정
    local SESSION_NAME="${_MOCK_SESSION_NAME:-}"
    if [ -z "$SESSION_NAME" ] && [ -n "${TMUX:-}" ]; then
        SESSION_NAME=$(tmux display-message -p '#{session_name}' 2>/dev/null || echo "")
    fi

    if [ -n "$SESSION_NAME" ]; then
        TEAM_CONTEXT_FILE="$_RTC_RUNTIME_DIR/team-context-${SESSION_NAME}.json"
    else
        TEAM_CONTEXT_FILE="$_RTC_RUNTIME_DIR/team-context-local.json"
    fi

    # 파일 존재하면 즉시 반환
    [ -f "$TEAM_CONTEXT_FILE" ] && return 0

    # 4. 레거시 fallback
    local LEGACY="$_RTC_RUNTIME_DIR/team-context.json"
    if [ -f "$LEGACY" ]; then
        TEAM_CONTEXT_FILE="$LEGACY"
        return 0
    fi

    # 5. 아카이브 fallback (TeamDelete 후 체인 참조)
    local ARCHIVED="${TEAM_CONTEXT_FILE%.json}.archived.json"
    if [ -f "$ARCHIVED" ]; then
        TEAM_CONTEXT_FILE="$ARCHIVED"
        return 0
    fi

    # 파일 없으면 경로만 설정 (호출자가 -f 체크)
    return 0
}

# list_all_team_contexts() — 모든 활성 team-context 파일 목록
list_all_team_contexts() {
    local _RTC_RUNTIME_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}/.claude/runtime"
    ls "$_RTC_RUNTIME_DIR"/team-context-*.json 2>/dev/null | grep -v '.archived.'
}
