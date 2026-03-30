#!/bin/bash
# task-completed.sh — 태스크 완료 시 알림 + QA 게이트
# TaskCompleted hook: 에이전트팀 태스크 완료 시 실행
#
# 강화 v2 (2026-03-22):
#   - bscamp 프로젝트 경로
#   - 슬랙 알림 + macOS 알림
#   - 마커 파일 생성 (모찌 하트비트용)

PROJECT_DIR="/Users/smith/projects/bscamp"

# Hook 출력 최소화 (D8-1)
source "$(dirname "$0")/helpers/hook-output.sh" 2>/dev/null && hook_init

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
LAST_COMMIT=$(cd "$PROJECT_DIR" 2>/dev/null && git log --oneline -1 2>/dev/null || echo "unknown")
CHANGED_FILES=$(cd "$PROJECT_DIR" 2>/dev/null && git diff HEAD~1 --name-only 2>/dev/null | wc -l | tr -d ' ')
BRANCH=$(cd "$PROJECT_DIR" 2>/dev/null && git branch --show-current 2>/dev/null || echo "unknown")

# 마커 파일 생성 (모찌 크론이 5분마다 체크)
cat > /tmp/agent-team-completed.json << EOF
{
  "completed_at": "$TIMESTAMP",
  "project": "$PROJECT_DIR",
  "last_commit": "$LAST_COMMIT",
  "changed_files": "$CHANGED_FILES",
  "branch": "$BRANCH",
  "event": "task_completed"
}
EOF

# macOS 알림 (즉시 — Smith님에게)
osascript -e "display notification \"${LAST_COMMIT}\" with title \"에이전트팀 태스크 완료\" sound name \"Glass\"" 2>/dev/null || true

# 슬랙 DM 알림 (모찌 → Smith님)

# --- BOARD.json 갱신 (v3 추가) ---
BOARD_FILE="$PROJECT_DIR/.claude/tasks/BOARD.json"
source "$(dirname "$0")/helpers/team-context-resolver.sh" 2>/dev/null
resolve_team_context 2>/dev/null
CONTEXT_FILE="${TEAM_CONTEXT_FILE:-$PROJECT_DIR/.bkit/runtime/team-context.json}"

# 프론트매터 제외 체크박스 집계 함수
count_checkboxes() {
    local file="$1"
    local body
    body=$(awk '/^---$/{n++; next} n>=2 || n==0{print}' "$file")
    local completed
    completed=$(echo "$body" | grep -c '\- \[x\]' 2>/dev/null || echo "0")
    local unchecked
    unchecked=$(echo "$body" | grep -c '\- \[ \]' 2>/dev/null || echo "0")
    local total=$((completed + unchecked))
    echo "$completed $total"
}

# BOARD.json 갱신 함수
update_board_json() {
    local team="$1" completed="$2" total="$3"
    local board_file="$PROJECT_DIR/.claude/tasks/BOARD.json"
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    if [ ! -f "$board_file" ]; then
        return 1
    fi

    local tmp
    tmp=$(mktemp)
    jq --arg team "$team" \
       --argjson completed "$completed" \
       --argjson total "$total" \
       --arg now "$now" \
       '.teams[$team].completedCount = $completed |
        .teams[$team].totalCount = $total |
        .updatedAt = $now' \
       "$board_file" > "$tmp" 2>/dev/null

    if [ $? -eq 0 ] && [ -s "$tmp" ]; then
        mv "$tmp" "$board_file"
        return 0
    else
        rm -f "$tmp"
        return 1
    fi
}

if [ -f "$BOARD_FILE" ] && [ -f "$CONTEXT_FILE" ]; then
    CURRENT_TEAM=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null)
    if [ -n "$CURRENT_TEAM" ]; then
        # 팀 소속 TASK 파일들의 체크박스 집계
        TOTAL_COMPLETED=0
        TOTAL_ALL=0
        TASK_LIST=$(jq -r '.taskFiles[]?' "$CONTEXT_FILE" 2>/dev/null)
        while IFS= read -r fname; do
            [ -f "$PROJECT_DIR/.claude/tasks/$fname" ] || continue
            COUNTS=$(count_checkboxes "$PROJECT_DIR/.claude/tasks/$fname")
            C=$(echo "$COUNTS" | awk '{print $1}')
            T=$(echo "$COUNTS" | awk '{print $2}')
            TOTAL_COMPLETED=$((TOTAL_COMPLETED + C))
            TOTAL_ALL=$((TOTAL_ALL + T))
        done <<< "$TASK_LIST"

        update_board_json "$CURRENT_TEAM" "$TOTAL_COMPLETED" "$TOTAL_ALL"
    fi
fi
