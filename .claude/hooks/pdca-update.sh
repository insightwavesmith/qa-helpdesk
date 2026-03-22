#!/bin/bash
# pdca-update.sh — 태스크 완료 시 PDCA 문서 자동 정리 강제
# TaskCompleted hook: PDCA 상태 파일 + 리더 개발 정리 필수

PROJECT_DIR="/Users/smith/projects/bscamp"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# 1. PDCA 상태 파일 존재 확인
PDCA_FILE="$PROJECT_DIR/docs/.pdca-status.json"
if [ ! -f "$PDCA_FILE" ]; then
    echo "PDCA 상태 파일(docs/.pdca-status.json)이 없습니다. 작성하세요."
    echo ""
    echo "필수 형식:"
    echo '{'
    echo '  "lastUpdated": "날짜시간",'
    echo '  "currentTask": "TASK 파일명",'
    echo '  "completedTasks": ["T1", "T2"],'
    echo '  "pendingTasks": ["T3", "T4"],'
    echo '  "blockers": [],'
    echo '  "lastCommit": "해시",'
    echo '  "changedFiles": ["파일1", "파일2"]'
    echo '}'
    exit 2
fi

# 2. PDCA 상태가 최근 업데이트됐는지 확인 (5분 이내)
PDCA_AGE=$(( $(date +%s) - $(stat -f %m "$PDCA_FILE" 2>/dev/null || echo 0) ))
if [ "$PDCA_AGE" -gt 300 ]; then
    echo "PDCA 상태 파일이 오래됐습니다 (${PDCA_AGE}초 전). 현재 작업 결과로 업데이트하세요."
    echo ""
    echo "업데이트할 것:"
    echo "1. docs/.pdca-status.json — completedTasks, pendingTasks, lastCommit 갱신"
    echo "2. docs/03-analysis/ — 이번 작업의 gap 분석 문서 작성"
    echo "3. 변경 파일 목록 + 검증 결과 기록"
    exit 2
fi

# 3. plan + design 문서 존재 확인
PLAN_COUNT=$(find "$PROJECT_DIR/docs/01-plan" -name "*.plan.md" -newer "$PROJECT_DIR/.claude/settings.json" 2>/dev/null | wc -l | tr -d ' ')
DESIGN_COUNT=$(find "$PROJECT_DIR/docs/02-design" -name "*.design.md" -newer "$PROJECT_DIR/.claude/settings.json" 2>/dev/null | wc -l | tr -d ' ')

if [ "$PLAN_COUNT" -eq 0 ] && [ "$DESIGN_COUNT" -eq 0 ]; then
    echo "Plan 또는 Design 문서가 없습니다. 이번 작업의 Plan/Design을 docs/에 정리하세요."
    exit 2
fi

echo "PDCA 검증 통과: 상태 파일(${PDCA_AGE}초 전 업데이트), Plan ${PLAN_COUNT}건, Design ${DESIGN_COUNT}건"
exit 0
