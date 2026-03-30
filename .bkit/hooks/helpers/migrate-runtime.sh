#!/bin/bash
# helpers/migrate-runtime.sh — 런타임 경로 마이그레이션 (멱등)
# .claude/runtime/ → .bkit/runtime/ 파일 복사 (원본 유지)
# 모든 hook의 최상단에서 source 가능

PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"
OLD_RUNTIME="$PROJECT_DIR/.claude/runtime"
NEW_RUNTIME="$PROJECT_DIR/.bkit/runtime"

if [ -d "$OLD_RUNTIME" ] && [ ! -f "$NEW_RUNTIME/.migrated" ]; then
    mkdir -p "$NEW_RUNTIME/approvals/pending" "$NEW_RUNTIME/hook-logs" 2>/dev/null

    # 파일 복사 (기존 유지)
    for F in peer-roles.json teammate-registry.json \
             heartbeat.log SESSION-STATE.md last-completion-report.json \
             chain-sent.log; do
        [ -f "$OLD_RUNTIME/$F" ] && cp "$OLD_RUNTIME/$F" "$NEW_RUNTIME/$F" 2>/dev/null
    done

    # team-context glob (디렉토리 기준 확장)
    for F in "$OLD_RUNTIME"/team-context*.json; do
        [ -f "$F" ] && cp "$F" "$NEW_RUNTIME/" 2>/dev/null
    done

    # approvals 복사
    cp "$OLD_RUNTIME/approvals/pending/"*.json "$NEW_RUNTIME/approvals/pending/" 2>/dev/null

    date -u +"%Y-%m-%dT%H:%M:%SZ" > "$NEW_RUNTIME/.migrated"
fi
