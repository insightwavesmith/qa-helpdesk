#!/bin/bash
# helpers/migrate-runtime.sh — V3 런타임 경로 마이그레이션 (멱등)
# .claude/runtime/ → .bkit/runtime/ 안전 마이그레이션
# 모든 hook의 최상단에서 source 가능
#
# V3 (2026-04-01):
#   - 전체 런타임 파일 커버리지 (agent-state, coo-state, error-log, peer-map 등)
#   - 디렉토리 구조 완전 생성 (coo-ack, coo-answers, smith-report 등)
#   - 파일 권한 644/755 설정
#   - 병합 전략: 신규 경로에 이미 파일 있으면 스킵 (덮어쓰기 방지)

PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"
OLD_RUNTIME="$PROJECT_DIR/.claude/runtime"
NEW_RUNTIME="$PROJECT_DIR/.bkit/runtime"

# ── 1. .bkit/runtime/ 디렉토리 구조 보장 (항상 실행, 마이그레이션 무관) ──
ensure_runtime_dirs() {
    mkdir -p "$NEW_RUNTIME/approvals/pending" \
             "$NEW_RUNTIME/hook-logs" \
             "$NEW_RUNTIME/coo-ack" \
             "$NEW_RUNTIME/coo-answers" \
             "$NEW_RUNTIME/coo-watchdog-debounce" \
             "$NEW_RUNTIME/smith-report" 2>/dev/null
    chmod 755 "$NEW_RUNTIME" 2>/dev/null
}
ensure_runtime_dirs

# ── 2. .claude/runtime/ → .bkit/runtime/ 마이그레이션 (1회만) ──
migrate_runtime_path() {
    # 이미 마이그레이션 완료면 스킵
    [ -f "$NEW_RUNTIME/.migrated" ] && return 0
    # 소스 디렉토리 없으면 스킵
    [ -d "$OLD_RUNTIME" ] || { date -u +"%Y-%m-%dT%H:%M:%SZ" > "$NEW_RUNTIME/.migrated"; return 0; }

    # 단일 파일 복사 (신규 경로에 없을 때만)
    local FILES=(
        peer-roles.json
        peer-map.json
        teammate-registry.json
        agent-state.json
        coo-state.json
        state.json
        error-log.json
        heartbeat.log
        last-completion-report.json
        chain-sent.log
        SESSION-STATE.md
        .state-hash
    )
    for F in "${FILES[@]}"; do
        [ -f "$OLD_RUNTIME/$F" ] && [ ! -f "$NEW_RUNTIME/$F" ] && \
            cp "$OLD_RUNTIME/$F" "$NEW_RUNTIME/$F" 2>/dev/null
    done

    # team-context glob (디렉토리 기준 확장)
    for F in "$OLD_RUNTIME"/team-context*.json; do
        [ -f "$F" ] || continue
        local BASENAME=$(basename "$F")
        [ ! -f "$NEW_RUNTIME/$BASENAME" ] && cp "$F" "$NEW_RUNTIME/$BASENAME" 2>/dev/null
    done

    # chain-status glob
    for F in "$OLD_RUNTIME"/chain-status-*.json; do
        [ -f "$F" ] || continue
        local BASENAME=$(basename "$F")
        [ ! -f "$NEW_RUNTIME/$BASENAME" ] && cp "$F" "$NEW_RUNTIME/$BASENAME" 2>/dev/null
    done

    # task-state glob
    for F in "$OLD_RUNTIME"/task-state-*.json; do
        [ -f "$F" ] || continue
        local BASENAME=$(basename "$F")
        [ ! -f "$NEW_RUNTIME/$BASENAME" ] && cp "$F" "$NEW_RUNTIME/$BASENAME" 2>/dev/null
    done

    # approvals 복사
    for F in "$OLD_RUNTIME"/approvals/pending/*.json; do
        [ -f "$F" ] || continue
        local BASENAME=$(basename "$F")
        [ ! -f "$NEW_RUNTIME/approvals/pending/$BASENAME" ] && \
            cp "$F" "$NEW_RUNTIME/approvals/pending/$BASENAME" 2>/dev/null
    done

    # hook-logs 복사
    for F in "$OLD_RUNTIME"/hook-logs/*; do
        [ -f "$F" ] || continue
        local BASENAME=$(basename "$F")
        [ ! -f "$NEW_RUNTIME/hook-logs/$BASENAME" ] && \
            cp "$F" "$NEW_RUNTIME/hook-logs/$BASENAME" 2>/dev/null
    done

    # 파일 권한 설정
    find "$NEW_RUNTIME" -type f -name "*.json" -exec chmod 644 {} \; 2>/dev/null
    find "$NEW_RUNTIME" -type f -name "*.log" -exec chmod 644 {} \; 2>/dev/null

    # 마이그레이션 완료 마커
    date -u +"%Y-%m-%dT%H:%M:%SZ" > "$NEW_RUNTIME/.migrated"
}

# source 시 자동 실행
migrate_runtime_path
