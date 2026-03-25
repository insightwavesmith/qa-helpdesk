#!/bin/bash
# enforce-plan-before-do.sh — Plan 없이 Do(코딩) 진입 차단
# PreToolUse hook (Edit|Write): src/ 수정 시 해당 기능의 Plan+Design 존재 강제
# exit 2 = 차단 (게이트)

INPUT=$(cat)

FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', {})
    print(ti.get('file_path', '') or ti.get('path', '') or '')
except:
    print('')
" 2>/dev/null)

# src/ 파일이 아니면 패스
if ! echo "$FILE" | grep -q "^src/"; then
    exit 0
fi

PROJECT_DIR="/Users/smith/projects/bscamp"

# 현재 TASK 파일에서 기능명 추출
TASK_FILES=$(find "$PROJECT_DIR/.claude/tasks" -name "TASK-*.md" -type f 2>/dev/null)
if [ -z "$TASK_FILES" ]; then
    echo "❌ [PDCA 강제] .claude/tasks/에 TASK 파일이 없습니다." >&2
    echo "TASK 파일을 먼저 작성하세요." >&2
    exit 2
fi

# 최근 24시간 내 Plan 문서 존재 확인
RECENT_PLANS=$(find "$PROJECT_DIR/docs/01-plan/features" -name "*.plan.md" -mtime -1 -type f 2>/dev/null | wc -l | tr -d ' ')

# 최근 24시간 내 Design 문서 존재 확인
RECENT_DESIGNS=$(find "$PROJECT_DIR/docs/02-design/features" -name "*.design.md" -mtime -1 -type f 2>/dev/null | wc -l | tr -d ' ')

if [ "${RECENT_PLANS:-0}" -eq 0 ]; then
    echo "❌ [PDCA 강제] 최근 Plan 문서가 없습니다." >&2
    echo "docs/01-plan/features/에 Plan 문서를 먼저 작성하세요." >&2
    echo "Plan → Design → Do → Check 순서를 지키세요." >&2
    exit 2
fi

if [ "${RECENT_DESIGNS:-0}" -eq 0 ]; then
    echo "❌ [PDCA 강제] 최근 Design 문서가 없습니다." >&2
    echo "docs/02-design/features/에 Design 문서를 먼저 작성하세요." >&2
    echo "Plan → Design → Do → Check 순서를 지키세요." >&2
    exit 2
fi

echo "✅ [PDCA] Plan ${RECENT_PLANS}건, Design ${RECENT_DESIGNS}건 확인 → Do 진입 허용"
exit 0
