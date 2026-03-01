#!/bin/bash
# validate-task.sh — TASK.md 포맷 검증
# 포맷: "현재 동작 / 기대 동작 / 하지 말 것" (What/Why 중심)
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

# 1. ## 목표 섹션 존재
if ! grep -q '^## 목표' "$ACTIVE_TASK" 2>/dev/null; then
    ERRORS="$ERRORS\n  - '## 목표' 섹션 없음"
fi

# 2. 작업 항목 존재 (U1/T1/A1/B1/Part 등)
TOTAL_TASKS=$(grep -cE '^## (U[0-9]+\.|T[0-9]+\.|A[0-9]+\.|B[0-9]+\.|Part )' "$ACTIVE_TASK" 2>/dev/null || true)
TOTAL_TASKS=${TOTAL_TASKS:-0}
if [ "$TOTAL_TASKS" -eq 0 ]; then
    ERRORS="$ERRORS\n  - 작업 항목(U1/T1 등)이 없음"
fi

# 3. "현재 동작" 섹션 존재
CURRENT_COUNT=$(grep -c '### 현재 동작\|### 현재$\|### 현상' "$ACTIVE_TASK" 2>/dev/null || echo "0")
if [ "$CURRENT_COUNT" -eq 0 ]; then
    ERRORS="$ERRORS\n  - '### 현재 동작' 섹션이 하나도 없음 (사용자 관점 현재 상태 필수)"
fi

# 4. "기대 동작" 섹션 존재
EXPECTED_COUNT=$(grep -c '### 기대 동작\|### 기대$\|### 변경' "$ACTIVE_TASK" 2>/dev/null || echo "0")
if [ "$EXPECTED_COUNT" -eq 0 ]; then
    ERRORS="$ERRORS\n  - '### 기대 동작' 섹션이 하나도 없음 (수정 후 사용자가 볼 것 필수)"
fi

# 5. "하지 말 것" 경계 존재 (전역 또는 항목별 1개 이상)
BOUNDARY_COUNT=$(grep -c '하지 말 것\|금지\|건드리지' "$ACTIVE_TASK" 2>/dev/null || echo "0")
if [ "$BOUNDARY_COUNT" -eq 0 ]; then
    ERRORS="$ERRORS\n  - '하지 말 것' 경계가 없음 (에이전트 행동 범위 제한 필수)"
fi

# 6. 실행 순서 존재
if ! grep -q '## 실행 순서' "$ACTIVE_TASK" 2>/dev/null; then
    ERRORS="$ERRORS\n  - '## 실행 순서' 섹션 없음"
fi

# 7. 리뷰 결과 섹션 체크
if ! grep -q '^## 리뷰 결과' "$ACTIVE_TASK" 2>/dev/null; then
    ERRORS="$ERRORS\n  - '## 리뷰 결과' 섹션 없음 (코드리뷰 미완료)"
fi

if [ -n "$ERRORS" ]; then
    echo "VALIDATE 실패 ($TASK_NAME):" >&2
    echo -e "$ERRORS" >&2
    echo "" >&2
    echo "TASK.md 포맷: ## 목표 / ### 현재 동작 / ### 기대 동작 / 하지 말 것 / ## 실행 순서" >&2
    echo "규칙 참조: rules/task-format.md" >&2
    exit 2
fi

echo "VALIDATE 통과: $TASK_NAME (${TOTAL_TASKS}개 항목, 포맷 검증 완료)"
exit 0
