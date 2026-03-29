#!/bin/bash
# task-quality-gate.sh — 태스크 완료 시 품질 검증 (QA 강제)
# TaskCompleted hook: 검증 실패 시 exit 2로 차단
#
# v3 (2026-03-29): 프로세스 레벨별 분기 추가
#   L0: 전부 스킵
#   L1: 산출물(docs/) 존재 확인만
#   L2/L3: 기존대로 (tsc + build + gap + pdca)

# 팀원은 PDCA 게이팅 패스 (리더 전용 검증)
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
cd "$PROJECT_DIR" || exit 0

# ── 프로세스 레벨 판단 ──
CHANGED_FILES=$(git diff HEAD~1 --name-only 2>/dev/null || echo "")
LAST_MSG=$(git log --oneline -1 2>/dev/null || echo "")

# L0: fix:/hotfix: 커밋
if echo "$LAST_MSG" | grep -qE '^[a-f0-9]+ (fix|hotfix):'; then
    echo "✅ [L0 응급] 품질 검증 스킵"
    exit 0
fi

# L1: src/ 변경 없음
HAS_SRC=$(echo "$CHANGED_FILES" | grep -c "^src/" || true)
if [ "$HAS_SRC" -eq 0 ]; then
    # L1: 산출물 존재 확인만 (docs/ 하위 최근 60분 이내 변경)
    DELIVERABLE_COUNT=$(find "$PROJECT_DIR/docs" -name "*.md" -mmin -60 2>/dev/null | wc -l | tr -d ' ')
    # TASK 파일 변경도 산출물로 인정
    TASK_COUNT=$(find "$PROJECT_DIR/.claude/tasks" -name "TASK-*.md" -mmin -60 2>/dev/null | wc -l | tr -d ' ')
    TOTAL_DELIVERABLES=$((DELIVERABLE_COUNT + TASK_COUNT))

    if [ "$TOTAL_DELIVERABLES" -gt 0 ]; then
        echo "✅ [L1 경량] 산출물 ${TOTAL_DELIVERABLES}건 확인. 품질 검증 통과."
    else
        echo "⚠ [L1 경량] 산출물 없음 (docs/ 또는 tasks/ 60분 이내 변경 없음). 작업 결과를 확인하세요."
    fi
    exit 0
fi

# ── L2/L3: 기존 검증 로직 ──
ERRORS=0
MESSAGES=""

# 1. TypeScript 타입 체크
if ! npx tsc --noEmit 2>/dev/null; then
  MESSAGES="${MESSAGES}\n- TypeScript 타입 에러가 있습니다."
  ERRORS=$((ERRORS + 1))
fi

# 2. 빌드 체크
if ! npm run build 2>/dev/null 1>/dev/null; then
  MESSAGES="${MESSAGES}\n- npm run build 실패. 빌드 에러를 수정하세요."
  ERRORS=$((ERRORS + 1))
fi

# 3. Gap 분석 문서 존재 여부 (최근 1일 이내)
ANALYSIS_COUNT=$(find "$PROJECT_DIR/docs/03-analysis" -name "*.analysis.md" -mtime -1 2>/dev/null | wc -l | tr -d ' ')
if [ "$ANALYSIS_COUNT" -eq 0 ]; then
  MESSAGES="${MESSAGES}\n- Gap 분석 문서(docs/03-analysis/)가 없습니다."
  ERRORS=$((ERRORS + 1))
fi

# 4. .pdca-status.json 업데이트 확인 (최근 1시간 이내 수정)
PDCA_ROOT="$PROJECT_DIR/.pdca-status.json"
if [ -f "$PDCA_ROOT" ]; then
  PDCA_AGE=$(( $(date +%s) - $(stat -f %m "$PDCA_ROOT" 2>/dev/null || echo "0") ))
  if [ "$PDCA_AGE" -gt 3600 ]; then
    MESSAGES="${MESSAGES}\n- .pdca-status.json이 1시간 이상 업데이트되지 않았습니다."
    ERRORS=$((ERRORS + 1))
  fi
fi

# 결과 출력
if [ "$ERRORS" -gt 0 ]; then
  echo "품질 검증 실패 (${ERRORS}개 항목):"
  echo -e "$MESSAGES"
  echo ""
  echo "위 항목을 수정한 후 다시 완료 처리하세요."
  exit 2
fi

echo "품질 검증 통과: tsc + build + gap analysis + pdca-status 확인 완료"
exit 0
