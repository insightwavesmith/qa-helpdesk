#!/bin/bash
# teammate-idle.sh — 팀원 idle 시 자기 팀 TASK만 배정
# TeammateIdle hook: exit 0 = idle 허용, exit 2 = 피드백 + 계속 작업
# v6 (2026-03-28): 소유권 필터링 도입

PROJECT_DIR="/Users/smith/projects/bscamp"
TASKS_DIR="$PROJECT_DIR/.claude/tasks"
source "$(dirname "$0")/helpers/team-context-resolver.sh" 2>/dev/null
resolve_team_context 2>/dev/null
CONTEXT_FILE="${TEAM_CONTEXT_FILE:-$PROJECT_DIR/.claude/runtime/team-context.json}"

# --- heartbeat 로그 (idle 트리거 기록) ---
_HB_RUNTIME="$PROJECT_DIR/.claude/runtime"
_HB_LOG="$_HB_RUNTIME/heartbeat.log"
mkdir -p "$_HB_RUNTIME" 2>/dev/null
echo "$(date '+%Y-%m-%d %H:%M:%S') heartbeat fired" >> "$_HB_LOG"

# 팀원 상태 수집
if [ -f "${CONTEXT_FILE:-}" ]; then
    _HB_TEAM=$(jq -r '.team // "unknown"' "$CONTEXT_FILE" 2>/dev/null || echo "unknown")
    _HB_PANES=$(tmux list-panes -t "$(tmux display-message -p '#{session_name}' 2>/dev/null || true)" -F '#{pane_index} #{pane_current_command}' 2>/dev/null | tail -n +2 || true)
    echo "$(date '+%Y-%m-%d %H:%M:%S') team=$_HB_TEAM panes: $_HB_PANES" >> "$_HB_LOG"
fi

# 좀비 pane 감지
if [ -f "$(dirname "$0")/helpers/zombie-pane-detector.sh" ]; then
    source "$(dirname "$0")/helpers/zombie-pane-detector.sh" 2>/dev/null || true
    if type detect_zombie_panes >/dev/null 2>&1; then
        detect_zombie_panes 2>/dev/null || true
        if [ "${ZOMBIE_COUNT:-0}" -gt 0 ]; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') ZOMBIE ${ZOMBIE_COUNT}건" >> "$_HB_LOG"
        fi
    fi
fi

# --- 프론트매터 파싱 헬퍼 ---
parse_frontmatter_field() {
    local file="$1" key="$2"
    awk '/^---$/{n++; next} n==1{print}' "$file" | grep "^${key}:" | sed "s/^${key}: *//"
}

# 프론트매터 이후 영역에서만 체크박스 스캔
scan_unchecked() {
    local file="$1"
    awk '/^---$/{n++; next} n>=2 || n==0{print NR": "$0}' "$file" | grep '^[0-9]*: *- \[ \]'
}

# --- 1단계: 자기 팀 TASK 파일 목록 결정 ---
FILTERED_FILES=""

if [ -f "$CONTEXT_FILE" ]; then
    # 방법 A: team-context.json에서 taskFiles 추출
    TASK_LIST=$(jq -r '.taskFiles[]?' "$CONTEXT_FILE" 2>/dev/null)
    if [ -n "$TASK_LIST" ]; then
        while IFS= read -r fname; do
            [ -f "$TASKS_DIR/$fname" ] && FILTERED_FILES="$FILTERED_FILES $TASKS_DIR/$fname"
        done <<< "$TASK_LIST"
    fi
fi

if [ -z "$FILTERED_FILES" ]; then
    # 방법 B: TASK 프론트매터에서 team 필드로 필터링
    CURRENT_TEAM=""
    if [ -f "$CONTEXT_FILE" ]; then
        CURRENT_TEAM=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null)
    fi

    for f in "$TASKS_DIR"/TASK-*.md; do
        [ -f "$f" ] || continue
        TASK_TEAM=$(parse_frontmatter_field "$f" "team")
        TASK_STATUS=$(parse_frontmatter_field "$f" "status")

        # completed/archived는 스킵
        [ "$TASK_STATUS" = "completed" ] || [ "$TASK_STATUS" = "archived" ] && continue
        # unassigned는 스킵
        [ "$TASK_TEAM" = "unassigned" ] && continue

        if [ -z "$CURRENT_TEAM" ]; then
            # 팀 컨텍스트 완전 부재 → 전체 스캔 (레거시 호환)
            FILTERED_FILES="$FILTERED_FILES $f"
        elif [ "$TASK_TEAM" = "$CURRENT_TEAM" ] || [ -z "$TASK_TEAM" ]; then
            # 같은 팀이거나 프론트매터 없는 레거시 TASK
            FILTERED_FILES="$FILTERED_FILES $f"
        fi
    done
fi

# --- 2단계: 필터된 TASK에서 미완료 체크박스 스캔 ---
UNCHECKED=""
for f in $FILTERED_FILES; do
    [ -f "$f" ] || continue

    # status: completed/archived인 TASK는 체크박스 무관하게 스킵
    FILE_STATUS=$(parse_frontmatter_field "$f" "status")
    [ "$FILE_STATUS" = "completed" ] || [ "$FILE_STATUS" = "archived" ] && continue

    ITEMS=$(scan_unchecked "$f")
    if [ -n "$ITEMS" ]; then
        BASENAME=$(basename "$f")
        FIRST=$(echo "$ITEMS" | head -1 | sed 's/^[0-9]*: *//' | sed 's/^- \[ \] //')
        UNCHECKED="${UNCHECKED}\n[${BASENAME}] ${FIRST}"
    fi
done

UNCHECKED_COUNT=$(echo -e "$UNCHECKED" | grep -c '\S' 2>/dev/null || true)
UNCHECKED_COUNT=${UNCHECKED_COUNT:-0}
UNCHECKED_COUNT=$(echo "$UNCHECKED_COUNT" | tr -d '[:space:]')

if [ "$UNCHECKED_COUNT" -gt 0 ]; then
    NEXT=$(echo -e "$UNCHECKED" | grep '\S' | head -1)
    echo "자기 팀 미완료 TASK ${UNCHECKED_COUNT}건. 다음: ${NEXT}"
    exit 2
fi

# --- 3단계: 모든 TASK 완료 → idle 허용 ---
echo "자기 팀 TASK 모두 완료. Leader에게 보고 후 종료하세요."
exit 0
