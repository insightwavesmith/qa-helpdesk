#!/bin/bash
# teammate-idle.sh — 팀원 idle 시 자동 다음 TASK 배정 또는 종료
# TeammateIdle hook: exit 0 = idle 허용 (종료 가능), exit 2 = 피드백 보내고 계속 작업
#
# v4 (2026-03-25):
#   - 핵심 변경: 모든 TASK 완료 시 즉시 exit 0 (idle 허용 → 종료 가능)
#   - QA 분석 문서 작성은 Leader가 별도 지시 (팀원이 무한 대기하지 않음)
#   - 토큰 낭비 방지: 할 일 없으면 즉시 종료

PROJECT_DIR="/Users/smith/projects/bscamp"
TASKS_DIR="$PROJECT_DIR/.claude/tasks"

# 1. TASK 파일에서 미완료 체크박스 찾기
if [ -d "$TASKS_DIR" ]; then
    UNCHECKED=""
    for f in "$TASKS_DIR"/TASK-*.md; do
        [ -f "$f" ] || continue
        ITEMS=$(grep -n '^\- \[ \]' "$f" 2>/dev/null)
        if [ -n "$ITEMS" ]; then
            BASENAME=$(basename "$f")
            UNCHECKED="${UNCHECKED}\n[${BASENAME}] $(echo "$ITEMS" | head -1 | sed 's/^[0-9]*://' | sed 's/^- \[ \] //')"
        fi
    done

    UNCHECKED_COUNT=$(echo -e "$UNCHECKED" | grep -c '\S' 2>/dev/null || echo "0")

    if [ "$UNCHECKED_COUNT" -gt 0 ]; then
        NEXT=$(echo -e "$UNCHECKED" | head -1)
        echo "미완료 TASK ${UNCHECKED_COUNT}건. 다음: ${NEXT}"
        exit 2
    fi
fi

# 2. PDCA 상태 갱신 체크 제거 (v5, 2026-03-28)
# PDCA 기록은 리더 전용 책임. 팀원이 idle될 때 PDCA 미갱신으로 차단하면
# 팀원이 PDCA 파일 관리 시도 → 권한/로직 충돌 → idle 루프 발생.
# 리더에게는 validate-pdca-before-teamdelete.sh로 TeamDelete 전 강제.

# 3. 모든 TASK 완료 → 즉시 idle 허용 (종료 가능)
# 이전: QA 문서 없으면 exit 2로 계속 작업시킴 → 무한 idle 루프 발생
# 수정: Leader가 TeamDelete로 팀원을 정리. 팀원은 할 일 없으면 바로 종료.
echo "모든 TASK 완료. 작업을 종료하세요. Leader에게 완료 보고 후 shutdown하세요."
exit 0
