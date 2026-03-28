#!/bin/bash
# auto-team-cleanup.sh — 모든 TASK 완료 시 팀원 자동 종료 트리거
# TaskCompleted hook에서 호출
#
# v1 (2026-03-25):
#   - TaskList에서 pending/in_progress TASK가 0이면
#   - 팀원에게 "종료하세요" 피드백을 exit 2로 전달
#   - Leader에게 "TeamDelete 실행하세요" 알림
#
# 원리: TaskCompleted hook은 exit 2로 피드백을 줄 수 있음
#        → "모든 TASK 완료. TeamDelete로 팀을 종료하세요" 메시지 전달

# 팀원은 팀 정리 책임 없음 → 즉시 통과
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
TASKS_DIR="$PROJECT_DIR/.claude/tasks"

# 팀 task 디렉토리 찾기 (가장 최근 팀)
TEAM_TASKS=""
if [ -d "$HOME/.claude/tasks" ]; then
    TEAM_TASKS=$(ls -td "$HOME/.claude/tasks"/*/ 2>/dev/null | head -1)
fi

# 프론트매터 파서 로드
source "$(dirname "$0")/helpers/frontmatter-parser.sh" 2>/dev/null

# .claude/tasks/TASK-*.md에서 미완료 체크 (팀 소속만)
UNCHECKED_COUNT=0
if [ -d "$TASKS_DIR" ]; then
    if load_team_context; then
        # team-context.json의 taskFiles만 스캔
        for f in $TASK_FILES; do
            FULL_PATH="$TASKS_DIR/$f"
            [ -f "$FULL_PATH" ] || continue
            COUNT=$(scan_unchecked "$FULL_PATH" | wc -l | tr -d '[:space:]')
            UNCHECKED_COUNT=$((UNCHECKED_COUNT + ${COUNT:-0}))
        done
    else
        # 폴백: 전체 TASK 파일 스캔
        for f in "$TASKS_DIR"/TASK-*.md; do
            [ -f "$f" ] || continue
            COUNT=$(scan_unchecked "$f" | wc -l | tr -d '[:space:]')
            UNCHECKED_COUNT=$((UNCHECKED_COUNT + ${COUNT:-0}))
        done
    fi
fi

# 모든 TASK 완료 → 알림 (차단하지 않음)
if [ "$UNCHECKED_COUNT" -eq 0 ]; then
    echo "✅ 모든 TASK가 완료되었습니다."
    echo "Leader: TeamDelete를 실행하여 팀원을 종료하세요."

    # macOS 알림
    osascript -e 'display notification "모든 TASK 완료 — TeamDelete 실행 필요" with title "✅ 팀원 종료 필요" sound name "Ping"' 2>/dev/null || true

    # exit 0: 차단하지 않음 (이전 exit 2는 팀원 완료 루프 원인)
    exit 0
fi

# 아직 미완료 TASK 있음 → 통과
exit 0
