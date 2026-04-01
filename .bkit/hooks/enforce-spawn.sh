#!/bin/bash
# enforce-spawn.sh — spawn.sh 미경유 claude 직접 실행 차단 (A0-8)
# PreToolUse:Bash hook
# exit 0 = 허용, exit 2 = 차단

# V3: PID 역추적 자동 등록
source "$(dirname "$0")/helpers/hook-self-register.sh" 2>/dev/null
auto_register_peer 2>/dev/null

# 비-tmux → 허용
[ -z "${TMUX:-}" ] && exit 0
# 비-TEAMS → 허용
[ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" != "1" ] && exit 0

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool = data.get('tool_name', '')
    if tool != 'Bash':
        sys.exit(0)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

[ -z "$COMMAND" ] && exit 0

# spawn.sh 경유 → 허용
echo "$COMMAND" | grep -qE 'spawn\.sh' && exit 0

# claude 유틸리티 → 허용
echo "$COMMAND" | grep -qE 'claude-peers|claude-code|claude\s+--version|claude\s+--help' && exit 0

# bare claude 실행 감지 → 차단
if echo "$COMMAND" | grep -qE '(^|\s|/)(claude)\s+(--resume|-p\s|--print|-c\s|--continue)'; then
    echo "[enforce-spawn] 차단: claude 직접 실행 감지 (A0-8)" >&2
    echo "   명령어: $COMMAND" >&2
    echo "   spawn.sh를 사용하세요: bash .bkit/hooks/spawn.sh" >&2
    exit 2
fi

exit 0
