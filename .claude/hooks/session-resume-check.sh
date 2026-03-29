#!/bin/bash
# session-resume-check.sh — 세션 시작 시 미완료 TASK 자동 감지
# 정보 제공만 (차단 안 함, 항상 exit 0)
set -uo pipefail

PROJECT_DIR="/Users/smith/projects/bscamp"

PDCA_FILE="$PROJECT_DIR/.bkit/state/pdca-status.json"
REGISTRY="$PROJECT_DIR/.claude/runtime/teammate-registry.json"
BOARD="$PROJECT_DIR/.claude/tasks/BOARD.json"

FOUND_ISSUES=0

# ── 1. 미완료 피처 감지 ──
if [ -f "$PDCA_FILE" ]; then
    INCOMPLETE=$(jq -r '
        .features // {} | to_entries[] |
        select(.value.currentState != null and .value.currentState != "completed") |
        "  - \(.key): \(.value.currentState // "unknown") (phase: \(.value.phase // "?"))"
    ' "$PDCA_FILE" 2>/dev/null)

    if [ -n "$INCOMPLETE" ]; then
        echo "⚠ 미완료 피처 감지:"
        echo "$INCOMPLETE"
        echo ""
        FOUND_ISSUES=1
    fi
fi

# ── 2. 좀비 팀원 감지 ──
if [ -f "$REGISTRY" ]; then
    SHUTDOWN_STATE=$(jq -r '.shutdownState // "unknown"' "$REGISTRY" 2>/dev/null)

    if [ "$SHUTDOWN_STATE" = "running" ]; then
        ACTIVE_MEMBERS=$(jq -r '
            .members // {} | to_entries[] |
            select(.value.state == "active") |
            "  - \(.key): state=\(.value.state), task=\(.value.currentTask // "none")"
        ' "$REGISTRY" 2>/dev/null)

        if [ -n "$ACTIVE_MEMBERS" ]; then
            echo "⚠ 이전 세션 팀원 잔존 (registry 정리 필요):"
            echo "$ACTIVE_MEMBERS"
            echo "  → teammate-registry.json의 members를 비우거나 state를 terminated로 변경하세요."
            echo ""
            FOUND_ISSUES=1
        fi
    fi
fi

# ── 3. 미할당 TASK 감지 ──
if [ -d "$PROJECT_DIR/.claude/tasks" ]; then
    UNASSIGNED=0
    for TASK_FILE in "$PROJECT_DIR/.claude/tasks"/TASK-*.md; do
        [ -f "$TASK_FILE" ] || continue
        STATUS=$(awk '/^---$/{f=!f;next}f' "$TASK_FILE" | grep -E "^status:" | head -1 | awk '{print $2}')
        if [ "$STATUS" = "pending" ] || [ -z "$STATUS" ]; then
            UNASSIGNED=$((UNASSIGNED + 1))
        fi
    done

    if [ "$UNASSIGNED" -gt 0 ]; then
        echo "⚠ 미착수 TASK ${UNASSIGNED}건 감지"
        echo "  → .claude/tasks/ 폴더에서 status: pending인 TASK를 확인하세요."
        echo ""
        FOUND_ISSUES=1
    fi
fi

# ── 4. pdca-status 마지막 업데이트 시간 ──
if [ -f "$PDCA_FILE" ]; then
    LAST_UPDATE=$(jq -r '.updatedAt // empty' "$PDCA_FILE" 2>/dev/null)
    if [ -n "$LAST_UPDATE" ]; then
        # macOS stat
        FILE_EPOCH=$(stat -f %m "$PDCA_FILE" 2>/dev/null || echo 0)
        NOW_EPOCH=$(date +%s)
        AGE_HOURS=$(( (NOW_EPOCH - FILE_EPOCH) / 3600 ))
        if [ "$AGE_HOURS" -gt 24 ]; then
            echo "⚠ pdca-status.json 마지막 수정: ${AGE_HOURS}시간 전"
            echo "  → 오래된 상태일 수 있습니다. 현재 진행 상황을 확인하세요."
            echo ""
            FOUND_ISSUES=1
        fi
    fi
fi

# ── 5. 요약 ──
if [ "$FOUND_ISSUES" -eq 0 ]; then
    echo "✅ 이전 세션 잔여 이슈 없음. 깨끗한 상태입니다."
fi

exit 0
