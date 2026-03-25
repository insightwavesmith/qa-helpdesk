#!/bin/bash
# enforce-qa-before-merge.sh — Check(QA) 없이 커밋/푸시 차단
# PreToolUse hook (Bash): git commit/push 시 QA 검증 강제
# exit 2 = 차단 (게이트)

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

# docs/chore/config 커밋은 패스
if echo "$COMMAND" | grep -qE '(docs:|chore:|style:|config:|ci:)'; then
    exit 0
fi

PROJECT_DIR="/Users/smith/projects/bscamp"

# 스테이지된 파일에 src/ 코드가 있는지 확인
STAGED=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null)
HAS_CODE=false
if echo "$STAGED" | grep -qE '^(src/|scripts/|services/)'; then
    HAS_CODE=true
fi

# 코드 변경 없으면 패스
if [ "$HAS_CODE" = false ]; then
    exit 0
fi

ERRORS=0
MESSAGES=""

# 1. TypeScript 타입 체크
if ! (cd "$PROJECT_DIR" && npx tsc --noEmit 2>/dev/null); then
    MESSAGES="${MESSAGES}\n❌ TypeScript 타입 에러"
    ERRORS=$((ERRORS + 1))
fi

# 2. 빌드 체크
if ! (cd "$PROJECT_DIR" && npm run build 2>/dev/null 1>/dev/null); then
    MESSAGES="${MESSAGES}\n❌ npm run build 실패"
    ERRORS=$((ERRORS + 1))
fi

# 3. lint 체크 (있으면)
if (cd "$PROJECT_DIR" && npm run lint 2>/dev/null 1>/dev/null); then
    : # 통과
else
    MESSAGES="${MESSAGES}\n⚠️ lint 경고 있음 (차단하지 않음)"
fi

# 4. Gap 분석 문서 확인 (최근 24시간)
GAP_COUNT=$(find "$PROJECT_DIR/docs/03-analysis" -name "*.analysis.md" -mtime -1 2>/dev/null | wc -l | tr -d ' ')
if [ "${GAP_COUNT:-0}" -eq 0 ]; then
    MESSAGES="${MESSAGES}\n❌ QA 분석 문서(docs/03-analysis/)가 없습니다. Check 단계를 수행하세요."
    ERRORS=$((ERRORS + 1))
fi

if [ "$ERRORS" -gt 0 ]; then
    echo "🚫 [PDCA Check 강제] QA 검증 실패 (${ERRORS}건):" >&2
    echo -e "$MESSAGES" >&2
    echo "" >&2
    echo "Do 끝나면 반드시 Check(QA)를 수행하세요:" >&2
    echo "1. tsc --noEmit 통과" >&2
    echo "2. npm run build 통과" >&2  
    echo "3. docs/03-analysis/에 QA 분석 문서 작성" >&2
    exit 2
fi

echo "✅ [PDCA Check] QA 검증 통과: tsc ✓ build ✓ 분석문서 ${GAP_COUNT}건 ✓"
exit 0
