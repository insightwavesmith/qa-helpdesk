#!/bin/bash
# validate-qa.sh — commit/push 전 QA 검증 (우회 불가)
# PreToolUse hook (Bash)
# exit 2 = 차단 (게이트)
#
# 마커 파일 방식 폐지 — hook 내부에서 직접 tsc+build 실행
# touch로 우회 불가능

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

# git commit/push가 아니면 패스
if ! echo "$COMMAND" | grep -qE 'git (commit|push)'; then
    exit 0
fi

# docs/chore/style 커밋은 패스
if echo "$COMMAND" | grep -qE '(docs:|chore:|style:|config:)'; then
    exit 0
fi

PROJECT_DIR="/Users/smith/projects/bscamp"

# staged 파일 목록
STAGED=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null)

if [ -z "$STAGED" ]; then
    exit 0
fi

# ── 변경 유형 판별 ──
HAS_CODE=false

# 코드 패턴 (백엔드 + 프론트)
if echo "$STAGED" | grep -qE '^(src/|services/|lib/)'; then
    HAS_CODE=true
fi

# 코드 변경 없으면 패스
if [ "$HAS_CODE" = false ]; then
    exit 0
fi

# ── 직접 tsc + build 실행 (우회 불가) ──
echo "🔍 [validate-qa] tsc + build 검증 중..." >&2

# tsc 체크
TSC_OUTPUT=$(cd "$PROJECT_DIR" && npx tsc --noEmit 2>&1)
TSC_EXIT=$?

if [ $TSC_EXIT -ne 0 ]; then
    source "$PROJECT_DIR/.claude/hooks/notify-hook.sh" 2>/dev/null && \
        notify_hook "❌ [게이트 차단] tsc 에러 — commit 차단됨" "validate-qa"
    echo "❌ tsc 에러. 수정 후 다시 커밋하세요:" >&2
    echo "$TSC_OUTPUT" | tail -20 >&2
    exit 2
fi

# build 체크
BUILD_OUTPUT=$(cd "$PROJECT_DIR" && npm run build 2>&1)
BUILD_EXIT=$?

if [ $BUILD_EXIT -ne 0 ]; then
    source "$PROJECT_DIR/.claude/hooks/notify-hook.sh" 2>/dev/null && \
        notify_hook "❌ [게이트 차단] build 에러 — commit 차단됨" "validate-qa"
    echo "❌ build 에러. 수정 후 다시 커밋하세요:" >&2
    echo "$BUILD_OUTPUT" | tail -30 >&2
    exit 2
fi

echo "✅ [validate-qa] tsc + build 통과" >&2
exit 0
