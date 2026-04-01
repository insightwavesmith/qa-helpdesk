#!/bin/bash
# validate-slack-payload.sh — curl + hooks.slack.com 전송 시 TASK_NAME + 팀명 확인
# PreToolUse:Bash hook
# exit 0 = 통과, exit 2 = 차단

INPUT=$(cat)

# stdin JSON에서 command 추출
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

# 비-curl 명령 → 패스
if ! echo "$COMMAND" | grep -q '^curl '; then
    if ! echo "$COMMAND" | grep -q ' curl '; then
        exit 0
    fi
fi

# 슬랙 webhook 아닌 curl → 패스
if ! echo "$COMMAND" | grep -q 'hooks\.slack\.com'; then
    exit 0
fi

# TASK_NAME 확인 (TASK[-_]NAME 또는 TASK-[A-Z0-9_-]+)
HAS_TASK=false
if echo "$COMMAND" | grep -qE 'TASK[-_]NAME|TASK-[A-Z0-9_-]+'; then
    HAS_TASK=true
fi

# 팀명 확인 (team|팀|sdk-)
HAS_TEAM=false
if echo "$COMMAND" | grep -qE 'team|팀|sdk-'; then
    HAS_TEAM=true
fi

# 검증
if [ "$HAS_TASK" = "false" ] && [ "$HAS_TEAM" = "false" ]; then
    echo "❌ 슬랙 메시지에 TASK_NAME과 팀명 모두 누락" >&2
    exit 2
fi

if [ "$HAS_TASK" = "false" ]; then
    echo "❌ 슬랙 메시지에 TASK_NAME 누락" >&2
    exit 2
fi

if [ "$HAS_TEAM" = "false" ]; then
    echo "❌ 슬랙 메시지에 팀명 누락" >&2
    exit 2
fi

exit 0
