#!/bin/bash
# validate-qa.sh — 밤새 작업용 (tsc만, build 생략)
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

if ! echo "$COMMAND" | grep -qE 'git (commit|push)'; then
    exit 0
fi

if echo "$COMMAND" | grep -qE '(docs:|chore:|style:|config:)'; then
    exit 0
fi

PROJECT_DIR="/Users/smith/projects/bscamp"
STAGED=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null)
if [ -z "$STAGED" ]; then
    exit 0
fi

HAS_CODE=false
if echo "$STAGED" | grep -qE '^(src/|services/|lib/|scripts/)'; then
    HAS_CODE=true
fi

if [ "$HAS_CODE" = false ]; then
    exit 0
fi

# tsc만 체크 (build 생략 — 밤새 작업 속도 위해)
echo "🔍 [validate-qa] tsc 검증 중..." >&2
TSC_OUTPUT=$(cd "$PROJECT_DIR" && npx tsc --noEmit 2>&1)
TSC_EXIT=$?

if [ $TSC_EXIT -ne 0 ]; then
    echo "❌ tsc 에러. 수정 후 다시 커밋하세요:" >&2
    echo "$TSC_OUTPUT" | tail -20 >&2
    exit 2
fi

echo "✅ [validate-qa] tsc 통과 (밤새 모드 — build 생략)" >&2
exit 0
