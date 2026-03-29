#!/bin/bash
# helpers/context-checkpoint.sh — compaction 대비 상태 자동 저장
# source해서 사용: save_checkpoint
#
# 목적: auto-compaction 시 SESSION-STATE.md를 참조하여 핵심 컨텍스트 복원 가능

_CKP_PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"

save_checkpoint() {
    local STATE_FILE="$_CKP_PROJECT_DIR/.claude/runtime/SESSION-STATE.md"
    # team-context resolver (팀별 파일 분리 — 없으면 레거시 경로 사용)
    local _CKP_RESOLVER="$_CKP_PROJECT_DIR/.claude/hooks/helpers/team-context-resolver.sh"
    if [ -f "$_CKP_RESOLVER" ]; then
        local _OLD_PD="${PROJECT_DIR:-}"
        PROJECT_DIR="$_CKP_PROJECT_DIR"
        source "$_CKP_RESOLVER"
        resolve_team_context 2>/dev/null
        PROJECT_DIR="${_OLD_PD:-}"
    fi
    local CONTEXT_FILE="${TEAM_CONTEXT_FILE:-$_CKP_PROJECT_DIR/.claude/runtime/team-context.json}"
    local TIMESTAMP
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null

    # team-context에서 정보 추출
    local TEAM="unknown"
    local TASK_FILES=""
    if [ -f "$CONTEXT_FILE" ]; then
        TEAM=$(jq -r '.team // "unknown"' "$CONTEXT_FILE" 2>/dev/null || echo "unknown")
        TASK_FILES=$(jq -r '.taskFiles[]? // empty' "$CONTEXT_FILE" 2>/dev/null | head -3)
    fi

    # TASK 파일에서 현재 진행 상태 추출
    local TASK_STATUS=""
    for TF in $TASK_FILES; do
        local FULL_PATH="$_CKP_PROJECT_DIR/.claude/tasks/$TF"
        if [ -f "$FULL_PATH" ]; then
            local DONE
            DONE=$(grep -c '\- \[x\]' "$FULL_PATH" 2>/dev/null || echo 0)
            local TOTAL
            TOTAL=$(grep -c '\- \[' "$FULL_PATH" 2>/dev/null || echo 0)
            TASK_STATUS="${TASK_STATUS}\n- ${TF}: ${DONE}/${TOTAL} done"
        fi
    done

    # 팀원 상태 (registry)
    local REGISTRY="$_CKP_PROJECT_DIR/.claude/runtime/teammate-registry.json"
    local TEAMMATES="none"
    if [ -f "$REGISTRY" ]; then
        TEAMMATES=$(jq -r '.members // {} | to_entries[] | "\(.key): \(.value.state)"' "$REGISTRY" 2>/dev/null || echo "no registry")
    fi

    cat > "$STATE_FILE" << EOF
## Session State (auto-saved)
- Timestamp: $TIMESTAMP
- Team: $TEAM
- Tasks:$(echo -e "$TASK_STATUS")
- Teammates: $TEAMMATES
- Note: This file is auto-generated. Current state may differ.
EOF

    echo "CHECKPOINT: SESSION-STATE.md saved at $TIMESTAMP"
}

# 직접 실행 시
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    save_checkpoint
fi
