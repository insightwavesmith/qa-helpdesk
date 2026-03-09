#!/bin/bash
# protect-stage.sh — stage 마커 직접 생성 차단
# PreToolUse hook (Bash): touch /tmp/agent-stage-* 실행 차단
# exit 2 = 차단 (게이트)
# 마커는 report-stage.sh를 통해서만 생성 가능

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

# agent-stage 마커 직접 생성 시도 차단
if echo "$COMMAND" | grep -qE 'touch.*/tmp/agent-stage|echo.*>/tmp/agent-stage|cat.*>/tmp/agent-stage'; then
    source /Users/smith/projects/qa-helpdesk/.claude/hooks/notify-hook.sh && \
        notify_hook "⚠️ [게이트 차단] stage 마커 직접 생성 시도됨" "protect-stage"
    
    echo "❌ stage 마커를 직접 생성할 수 없습니다." >&2
    echo "report-stage.sh를 통해 정상 프로세스로 진행하세요:" >&2
    echo "  ~/.claude/scripts/report-stage.sh REVIEW_DONE '리뷰 요약'" >&2
    echo "  ~/.claude/scripts/report-stage.sh QA_DONE 'QA 요약'" >&2
    echo "  ~/.claude/scripts/report-stage.sh BUILD_PASS '빌드 결과'" >&2
    exit 2
fi

exit 0
