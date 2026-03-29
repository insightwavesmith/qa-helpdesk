#!/bin/bash
# validate-pdca-before-teamdelete.sh — TeamDelete 전 PDCA 기록 강제
# PreToolUse hook (TeamDelete matcher): 리더가 팀 해산 전 PDCA 상태 갱신했는지 확인
# exit 2 = 차단, exit 0 = 허용
#
# 원칙: PDCA 기록은 리더 전용 의무. 팀원은 해당 없음.
# TeamDelete 시도 시 docs/.pdca-status.json이 10분+ 미갱신이면 차단.
#
# v1.0 (2026-03-28)

trap 'exit 0' ERR

# 팀원은 TeamDelete 사용 안 하지만 혹시 모를 상황 → 통과
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
PDCA_FILE="$PROJECT_DIR/docs/.pdca-status.json"

# PDCA 파일 없으면 → 경고만 (최초 상태일 수 있음)
if [ ! -f "$PDCA_FILE" ]; then
    echo "⚠️ docs/.pdca-status.json 없음. PDCA 상태 파일 생성 후 TeamDelete하세요."
    exit 2
fi

# PDCA 파일 갱신 시간 체크 (10분 = 600초)
PDCA_AGE=$(( $(date +%s) - $(stat -f %m "$PDCA_FILE" 2>/dev/null || echo 0) ))

if [ "$PDCA_AGE" -gt 600 ]; then
    echo "❌ [PDCA 게이트] docs/.pdca-status.json이 ${PDCA_AGE}초(10분+) 미갱신."
    echo ""
    echo "TeamDelete 전에 PDCA 기록을 완료하세요:"
    echo "  1. docs/.pdca-status.json — updatedAt, phase, notes 갱신"
    echo "  2. .claude/tasks/TASK-*.md — 완료 체크박스 처리"
    echo "  3. 다시 TeamDelete 실행"
    echo ""
    echo "PDCA 기록은 리더 전용 의무입니다."
    exit 2
fi

echo "[PDCA 게이트] docs/.pdca-status.json ${PDCA_AGE}초 전 갱신 확인. TeamDelete 허용."

# --- team-context 아카이빙 (v1.2: rm → mv 아카이빙 — 체인 핸드오프용) ---
source "$(dirname "$0")/helpers/team-context-resolver.sh" 2>/dev/null
resolve_team_context 2>/dev/null
CONTEXT_FILE="${TEAM_CONTEXT_FILE:-$PROJECT_DIR/.claude/runtime/team-context.json}"
if [ -f "$CONTEXT_FILE" ]; then
    DELETED_TEAM=$(jq -r '.team // "unknown"' "$CONTEXT_FILE" 2>/dev/null)
    ARCHIVED="${CONTEXT_FILE%.json}.archived.json"
    mv "$CONTEXT_FILE" "$ARCHIVED"
    echo "[PDCA 게이트] team-context 아카이빙 완료 (팀: $DELETED_TEAM)"
fi

exit 0
