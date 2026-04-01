#!/bin/bash
# Block logger: 차단(exit 2) 시 자동 기록
_bl_trap() { local e=$?; [ "$e" = "2" ] && source "$(dirname "$0")/helpers/block-logger.sh" 2>/dev/null && log_block "차단" "validate-task-fields" "${COMMAND:-unknown}" 2>/dev/null; exit $e; }
trap _bl_trap EXIT
# validate-task-fields.sh — spawn.sh 호출 시 TASK 파일의 레벨(L0-L3) + 담당팀(sdk-*) 확인
# PreToolUse:Bash hook
# exit 0 = 통과, exit 2 = 차단

INPUT=$(cat)

# 비-tmux 환경 → 패스
if [ -z "${TMUX:-}" ]; then
    exit 0
fi

# stdin JSON에서 command 추출
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

# spawn.sh 아닌 명령 → 패스
if ! echo "$COMMAND" | grep -q 'spawn\.sh'; then
    exit 0
fi

# TASK 파일 찾기
TASK_DIR="${TASK_DIR:-/Users/smith/projects/bscamp}"
ACTIVE_TASK=""
for f in "$TASK_DIR"/TASK*.md; do
    [ -f "$f" ] || continue
    if [ -z "$ACTIVE_TASK" ] || [ "$f" -nt "$ACTIVE_TASK" ]; then
        ACTIVE_TASK="$f"
    fi
done

# TASK 파일 없음 → 패스 (validate-coo-approval에서 처리)
if [ -z "$ACTIVE_TASK" ]; then
    exit 0
fi

CONTENT=$(cat "$ACTIVE_TASK")

# 레벨 확인: L0~L3
HAS_LEVEL=false
if echo "$CONTENT" | grep -qE '(^|[[:space:]])(L[0-3])([[:space:]]|$|,|기능|버그)'; then
    HAS_LEVEL=true
fi

# 담당팀 확인: sdk-*
HAS_TEAM=false
if echo "$CONTENT" | grep -qE '담당.*sdk-|sdk-(cto|pm|mkt)'; then
    HAS_TEAM=true
fi

# 검증
if [ "$HAS_LEVEL" = "false" ] && [ "$HAS_TEAM" = "false" ]; then
    echo "❌ TASK에 레벨(L0-L3)과 담당팀(sdk-*) 모두 누락" >&2
    exit 2
fi

if [ "$HAS_LEVEL" = "false" ]; then
    echo "❌ TASK에 레벨(L0-L3) 누락" >&2
    exit 2
fi

if [ "$HAS_TEAM" = "false" ]; then
    echo "❌ TASK에 담당팀(sdk-*) 누락" >&2
    exit 2
fi

exit 0
