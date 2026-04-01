#!/bin/bash
# prevent-tmux-kill.sh — tmux kill 명령 차단 (A0-4)
# PreToolUse:Bash hook
# exit 0 = 허용, exit 2 = 차단

# V3: PID 역추적 자동 등록
source "$(dirname "$0")/helpers/hook-self-register.sh" 2>/dev/null
auto_register_peer 2>/dev/null

# 비-tmux → 허용
[ -z "${TMUX:-}" ] && exit 0

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

# tmux kill-session / kill-pane / kill-server 감지
if echo "$COMMAND" | grep -qE 'tmux[[:space:]]+kill-(session|pane|server)'; then
    KILL_TYPE=$(echo "$COMMAND" | grep -oE 'kill-(session|pane|server)')
    echo "[prevent-tmux-kill] 차단: tmux $KILL_TYPE 감지 (A0-4)" >&2
    echo "   명령어: $COMMAND" >&2
    echo "   /exit 명령으로 정상 종료하세요. tmux kill은 registry 정리를 누락합니다." >&2
    exit 2
fi

exit 0
