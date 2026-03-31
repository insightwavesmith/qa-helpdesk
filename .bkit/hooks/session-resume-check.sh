#!/bin/bash
# session-resume-check.sh — 세션 시작 시 미완료 TASK 자동 감지
# 정보 제공만 (차단 안 함, 항상 exit 0)
set -uo pipefail

PROJECT_DIR="/Users/smith/projects/bscamp"

PDCA_FILE="$PROJECT_DIR/.bkit/state/pdca-status.json"
REGISTRY="$PROJECT_DIR/.bkit/runtime/teammate-registry.json"
BOARD="$PROJECT_DIR/.claude/tasks/BOARD.json"

FOUND_ISSUES=0

# ── 0. 아카이브 자동 정리 (1시간+ 된 team-context 아카이브 삭제) ──
RUNTIME_DIR="$PROJECT_DIR/.bkit/runtime"
find "$RUNTIME_DIR" -name 'team-context-*.archived.json' -mmin +60 -delete 2>/dev/null

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

# ── 5. 좀비 tmux pane 감지 ──
ZOMBIE_DETECTOR="$(dirname "$0")/helpers/zombie-pane-detector.sh"
if [ -f "$ZOMBIE_DETECTOR" ]; then
    source "$ZOMBIE_DETECTOR"
    detect_zombie_panes
    if [ "${ZOMBIE_COUNT:-0}" -gt 0 ]; then
        echo "⚠ 좀비 tmux pane ${ZOMBIE_COUNT}건 감지 (auto-shutdown 미실행):"
        echo -e "$ZOMBIE_DETAILS"
        echo "  → 자동 정리: bash $ZOMBIE_DETECTOR kill"
        echo ""
        FOUND_ISSUES=1
    fi
fi

# ── 7. Living Context 로딩 가이드 ──
LIVING_CONTEXT_LOADER="$(dirname "$0")/helpers/living-context-loader.sh"
if [ -f "$LIVING_CONTEXT_LOADER" ]; then
    source "$LIVING_CONTEXT_LOADER" 2>/dev/null
    _LC_FEATURE=$(jq -r '.primaryFeature // "unknown"' "$PDCA_FILE" 2>/dev/null || echo "unknown")
    _LC_PHASE=$(jq -r ".features[\"$_LC_FEATURE\"].phase // \"do\"" "$PDCA_FILE" 2>/dev/null || echo "do")
    # pdca-status phase명 → loader phase명 정규화
    case "$_LC_PHASE" in implementing|coding) _LC_PHASE="do" ;; reviewing) _LC_PHASE="check" ;; improving) _LC_PHASE="act" ;; planning) _LC_PHASE="plan" ;; designing) _LC_PHASE="design" ;; esac
    load_context "$_LC_FEATURE" "$_LC_PHASE" 2>/dev/null
    if [ "${#CONTEXT_FILES[@]}" -gt 0 ]; then
        echo "📚 Living Context — ${#CONTEXT_FILES[@]}개 문서 로드 대상:"
        for _f in "${CONTEXT_FILES[@]}"; do echo "  → $_f"; done
        echo ""
    fi
fi

# ── 6. 요약 ──
if [ "$FOUND_ISSUES" -eq 0 ]; then
    echo "✅ 이전 세션 잔여 이슈 없음. 깨끗한 상태입니다."
fi

exit 0
