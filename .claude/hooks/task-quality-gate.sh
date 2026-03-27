#!/bin/bash
# task-quality-gate.sh — 태스크 완료 시 품질 검증 (QA 강제)
# TaskCompleted hook: 검증 실패 시 exit 2로 차단
#
# 강화 v2 (2026-03-22):
#   - tsc --noEmit
#   - npm run build
#   - Gap 분석 문서 존재 확인
#   - .pdca-status.json 업데이트 확인

# 팀원은 PDCA 게이팅 패스 (리더 전용 검증)
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
cd "$PROJECT_DIR" || exit 0

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
PDCA_DOCS="$PROJECT_DIR/docs/.pdca-status.json"
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
