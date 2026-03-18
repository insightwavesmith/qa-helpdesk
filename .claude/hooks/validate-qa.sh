#!/bin/bash
# validate-qa.sh — main 브랜치 push 전 preview QA 검증 강제
# PreToolUse hook (Bash): git push/git merge 시 QA 마커 확인
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

PROJECT_DIR="/Users/smith/projects/qa-helpdesk"
CURRENT_BRANCH=$(cd "$PROJECT_DIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null)

# git push origin main / git merge / git checkout main && git merge 감지
IS_MAIN_PUSH=false
IS_MERGE_TO_MAIN=false

if echo "$COMMAND" | grep -qE 'git push.*(origin\s+)?main'; then
    IS_MAIN_PUSH=true
fi

if echo "$COMMAND" | grep -qE 'git merge' && [ "$CURRENT_BRANCH" = "main" ]; then
    IS_MERGE_TO_MAIN=true
fi

if echo "$COMMAND" | grep -qE 'git checkout main.*&&.*git merge'; then
    IS_MERGE_TO_MAIN=true
fi

# main push 또는 main merge가 아니면 패스
if [ "$IS_MAIN_PUSH" = false ] && [ "$IS_MERGE_TO_MAIN" = false ]; then
    exit 0
fi

# feature 브랜치에서 직접 main push도 패스 (revert 등 긴급 대응)
# → 긴급 시 git push -f 또는 직접 push 가능

# QA 마커 확인: /tmp/agent-qa-passed-{branch} 파일 존재 여부
# 마커는 report-stage.sh QA_DONE으로 생성
QA_MARKER="/tmp/agent-qa-passed"

if [ -f "$QA_MARKER" ]; then
    # 마커 있으면 통과 + 마커 삭제 (1회성)
    rm -f "$QA_MARKER"
    exit 0
fi

# QA 마커 없음 → 차단
source /Users/smith/projects/qa-helpdesk/.claude/hooks/notify-hook.sh && \
    notify_hook "⚠️ [게이트 차단] preview QA 미완료 — main merge/push 차단됨" "validate-qa"

echo "❌ main 브랜치에 merge/push하려면 preview URL QA가 필요합니다." >&2
echo "" >&2
echo "프로세스:" >&2
echo "  1. feature 브랜치에서 PR push (git push origin feat/xxx)" >&2
echo "  2. Vercel preview URL에서 브라우저 QA 실행" >&2
echo "  3. QA 통과 후 마커 생성: touch /tmp/agent-qa-passed" >&2
echo "  4. 그 후 main merge + push 가능" >&2
exit 2
