#!/bin/bash
# validate-coo-approval.sh — spawn.sh 호출 시 coo_approved 검증 (A0-1)
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

# spawn.sh 아닌 명령 → 패스
echo "$COMMAND" | grep -q 'spawn\.sh' || exit 0

# TASK 파일 찾기 (TASK_DIR 오버라이드 지원)
TASK_DIR="${TASK_DIR:-/Users/smith/projects/bscamp}"
ACTIVE_TASK=""
for f in "$TASK_DIR"/TASK*.md; do
    [ -f "$f" ] || continue
    if [ -z "$ACTIVE_TASK" ] || [ "$f" -nt "$ACTIVE_TASK" ]; then
        ACTIVE_TASK="$f"
    fi
done

# TASK 파일 없음 → 차단
if [ -z "$ACTIVE_TASK" ]; then
    echo "[validate-coo-approval] 차단: TASK 파일 미존재" >&2
    echo "   TASK_DIR: $TASK_DIR" >&2
    exit 2
fi

# coo_approved: true 확인
if ! grep -qE 'coo_approved:[[:space:]]*true' "$ACTIVE_TASK"; then
    echo "[validate-coo-approval] 차단: Smith님 승인 필요 (A0-1)" >&2
    echo "   TASK: $(basename "$ACTIVE_TASK")" >&2
    echo "   coo_approved: true가 없습니다." >&2
    exit 2
fi

exit 0
