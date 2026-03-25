#!/bin/bash
# teammate-idle.sh — 팀원 idle 시 자동 다음 TASK 배정 (강화 v3)
# TeammateIdle hook: exit 2 = 피드백 보내고 계속 작업
#
# v3 (2026-03-25):
#   - .claude/tasks/ 폴더의 TASK 파일에서 미완료 항목 자동 탐색
#   - TASK 파일 없으면 → PDCA 상태 확인 → 다음 단계 지시
#   - 모든 TASK 완료면 → QA 분석 문서 작성 지시

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
        echo "아직 미완료 TASK가 ${UNCHECKED_COUNT}건 남아있습니다."
        echo "다음 작업: ${NEXT}"
        echo ".claude/tasks/ 폴더의 TASK 파일을 확인하고 다음 항목을 진행하세요."
        exit 2
    fi
fi

# 2. TASK 파일의 체크박스가 전부 완료 → QA 분석 문서 작성 지시
ANALYSIS_COUNT=$(find "$PROJECT_DIR/docs/03-analysis" -name "*.analysis.md" -mtime -1 2>/dev/null | wc -l | tr -d ' ')
if [ "${ANALYSIS_COUNT:-0}" -eq 0 ]; then
    echo "코딩은 완료됐지만 QA 분석 문서가 없습니다."
    echo "docs/03-analysis/에 QA 분석 문서를 작성하세요:"
    echo "- 변경 사항 요약"
    echo "- 테스트 결과 (tsc, build, 수동 검증)"
    echo "- 알려진 이슈"
    echo "PDCA Check 단계입니다."
    exit 2
fi

# 3. 전부 완료 → idle 허용
echo "모든 TASK와 QA가 완료됐습니다. idle 허용."
exit 0
