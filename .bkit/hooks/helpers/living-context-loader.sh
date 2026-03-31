#!/bin/bash
# living-context-loader.sh — PDCA 단계별 상류 문서 자동 로딩
PROJECT_DIR="/Users/smith/projects/bscamp"

load_context() {
    local feature="$1" phase="$2"
    CONTEXT_FILES=()

    # 공통 (모든 phase)
    local commons=(
        "$PROJECT_DIR/CLAUDE.md"
        "$PROJECT_DIR/docs/adr/ADR-001-account-ownership.md"
        "$PROJECT_DIR/docs/adr/ADR-002-service-context.md"
        "$HOME/.openclaw/workspace/SERVICE-VISION.md"
    )
    for f in "${commons[@]}"; do [ -f "$f" ] && CONTEXT_FILES+=("$f"); done

    # phase별 추가
    case "$phase" in
        design)
            local pf="$PROJECT_DIR/docs/01-plan/features/${feature}.plan.md"
            [ -f "$pf" ] && CONTEXT_FILES+=("$pf") ;;
        do)
            local pf="$PROJECT_DIR/docs/01-plan/features/${feature}.plan.md"
            local df="$PROJECT_DIR/docs/02-design/features/${feature}.design.md"
            [ -f "$pf" ] && CONTEXT_FILES+=("$pf")
            [ -f "$df" ] && CONTEXT_FILES+=("$df") ;;
        check)
            local df="$PROJECT_DIR/docs/02-design/features/${feature}.design.md"
            [ -f "$df" ] && CONTEXT_FILES+=("$df") ;;
        act)
            local df="$PROJECT_DIR/docs/02-design/features/${feature}.design.md"
            local af="$PROJECT_DIR/docs/03-analysis/${feature}.analysis.md"
            [ -f "$df" ] && CONTEXT_FILES+=("$df")
            [ -f "$af" ] && CONTEXT_FILES+=("$af") ;;
    esac

    # 관련 postmortem (feature명 grep, 최대 2개)
    if [ -d "$PROJECT_DIR/docs/postmortem" ]; then
        local pm_files
        pm_files=$(grep -rl "$feature" "$PROJECT_DIR/docs/postmortem/" 2>/dev/null | head -2)
        while IFS= read -r pm; do
            [ -f "$pm" ] && CONTEXT_FILES+=("$pm")
        done <<< "$pm_files"
    fi

    # task-state JSON
    local ts="$PROJECT_DIR/.bkit/runtime/task-state-${feature}.json"
    [ -f "$ts" ] && CONTEXT_FILES+=("$ts")

    echo "LIVING_CONTEXT: ${#CONTEXT_FILES[@]}개 문서 로드 대상"
    for f in "${CONTEXT_FILES[@]}"; do echo "  → $f"; done
}
