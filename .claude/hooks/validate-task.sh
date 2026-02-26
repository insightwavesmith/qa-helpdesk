#!/bin/bash
# validate-task.sh — 개발 시작 전 TASK.md 형식 + 목업/기획서 첨부 검증
# PreToolUse hook: Bash 도구 실행 시 체크

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

# npm run build, npm run dev 등 개발 관련 명령만 체크
if ! echo "$COMMAND" | grep -qE '(npm run (build|dev)|npx |next )'; then
    exit 0
fi

PROJECT_DIR="/Users/smith/projects/qa-helpdesk"

# TASK.md 존재 확인
TASK_FILES=$(find "$PROJECT_DIR" -maxdepth 1 -name "TASK*.md" -type f 2>/dev/null)
if [ -z "$TASK_FILES" ]; then
    echo "VALIDATE 경고: TASK.md 파일이 없습니다."
    exit 2
fi

# 가장 최근 TASK 파일 찾기
ACTIVE_TASK=""
for f in $TASK_FILES; do
    if [ -z "$ACTIVE_TASK" ] || [ "$f" -nt "$ACTIVE_TASK" ]; then
        ACTIVE_TASK="$f"
    fi
done

TASK_NAME=$(basename "$ACTIVE_TASK")
ERRORS=""

# 1. T항목 존재 체크
TOTAL_TASKS=$(grep -cE '^## (T[0-9]+\.|A[0-9]+\.|B[0-9]+\.|Part )' "$ACTIVE_TASK" 2>/dev/null || true)
TOTAL_TASKS=${TOTAL_TASKS:-0}
if [ "$TOTAL_TASKS" -eq 0 ]; then
    ERRORS="$ERRORS\n  - T/A/B/Part 항목이 없음"
fi

# 2. 리뷰 결과 섹션 체크
if ! grep -q '^## 리뷰 결과' "$ACTIVE_TASK" 2>/dev/null; then
    ERRORS="$ERRORS\n  - '## 리뷰 결과' 섹션 없음 (코드리뷰 미완료)"
fi

# 3. 목업/기획서 참조 체크 (핵심!)
HAS_DESIGN_REF=false

# docs/design/ 폴더에 HTML 파일 있는지
DESIGN_FILES=$(find "$PROJECT_DIR/docs/design" -name "*.html" -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$DESIGN_FILES" -gt 0 ]; then
    HAS_DESIGN_REF=true
fi

# TASK.md 안에 목업/기획서 경로 언급 있는지
if grep -qiE '(mockup|목업|기획서|design/|\.html)' "$ACTIVE_TASK" 2>/dev/null; then
    HAS_DESIGN_REF=true
fi

if [ "$HAS_DESIGN_REF" = false ]; then
    ERRORS="$ERRORS\n  - 목업/기획서 참조 없음! docs/design/에 HTML 파일이 없고, TASK.md에도 목업/기획서 경로가 없습니다."
    ERRORS="$ERRORS\n    → TASK.md에 목업 HTML 경로를 명시하거나, docs/design/에 목업 파일을 넣으세요."
fi

# 4. 각 항목에 "현재/목업/변경" 구체 기술 있는지
HAS_DETAIL=$(grep -cE '(현재:|목업:|변경:|현재 |목업 )' "$ACTIVE_TASK" 2>/dev/null || echo "0")
if [ "$HAS_DETAIL" -lt 2 ]; then
    ERRORS="$ERRORS\n  - 항목별 '현재/목업/변경' 구체 기술 부족 (${HAS_DETAIL}건만 발견)"
    ERRORS="$ERRORS\n    → 각 항목마다 '현재: ~, 목업: ~, 변경: ~' 형태로 작성하세요."
fi

if [ -n "$ERRORS" ]; then
    echo "VALIDATE 실패 ($TASK_NAME):" >&2
    echo -e "$ERRORS" >&2
    echo "" >&2
    echo "목업/기획서 없이 개발을 시작할 수 없습니다." >&2
    exit 2
fi

echo "VALIDATE 통과: $TASK_NAME (${TOTAL_TASKS}개 항목, 목업 참조 확인, 리뷰 완료)"
exit 0
