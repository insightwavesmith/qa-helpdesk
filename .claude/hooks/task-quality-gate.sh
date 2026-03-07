#!/bin/bash
# task-quality-gate.sh — 작업 완료 시 품질 검증
# TaskCompleted hook: 테스트/빌드 통과해야 완료 처리
# exit 0 = 완료 허용, exit 2 = 피드백 보내고 작업 계속

PROJECT_DIR="/Users/smith/projects/qa-helpdesk"

# 1. TypeScript 타입 체크
if ! cd "$PROJECT_DIR" && npx tsc --noEmit --quiet 2>/dev/null; then
  echo "TypeScript 타입 에러가 있습니다. 수정 후 다시 완료 처리하세요."
  exit 2
fi

# 2. Lint 체크
if ! cd "$PROJECT_DIR" && npx next lint --quiet 2>/dev/null; then
  echo "Lint 에러가 있습니다. 수정 후 다시 완료 처리하세요."
  exit 2
fi

# 3. Gap 분석 문서 존재 여부
ANALYSIS_COUNT=$(find "$PROJECT_DIR/docs/03-analysis" -name "*.analysis.md" -newer "$PROJECT_DIR/.claude/settings.json" 2>/dev/null | wc -l | tr -d ' ')
if [ "$ANALYSIS_COUNT" -eq 0 ]; then
  echo "Gap 분석 문서(docs/03-analysis/)가 없습니다. 설계 대비 구현 비교 문서를 작성하세요."
  exit 2
fi

echo "품질 검증 통과: tsc + lint + gap analysis 확인 완료"
exit 0
