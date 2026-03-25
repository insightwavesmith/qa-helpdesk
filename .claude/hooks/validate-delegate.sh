#!/bin/bash
# validate-delegate.sh — delegate 모드(팀원) 없이 src/ 수정 차단
# PreToolUse hook (Edit|Write): src/ 파일 수정 시 팀원 존재 확인
# exit 2 = 차단 (게이트)

INPUT=$(cat)

FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', {})
    print(ti.get('file_path', '') or ti.get('path', '') or '')
except:
    print('')
" 2>/dev/null)

# src/ 파일이 아니면 패스
if ! echo "$FILE" | grep -q "^src/"; then
    exit 0
fi

# .claude/ .md docs/ 등은 패스
if echo "$FILE" | grep -qE '^\.(claude|md)|^docs/|^TASK|^CLAUDE'; then
    exit 0
fi

# 현재 tmux 세션 이름 자동 감지 (sdk-cto, sdk-pm, sdk-mkt 등)
if [ -n "$TMUX" ]; then
    CURRENT_SESSION=$(tmux display-message -p '#S' 2>/dev/null)
else
    # tmux 밖이면 sdk- 세션 찾기
    CURRENT_SESSION=$(tmux list-sessions -F '#S' 2>/dev/null | grep "^sdk-" | head -1)
fi

if [ -z "$CURRENT_SESSION" ]; then
    exit 0  # tmux 세션 감지 안 되면 패스
fi

# tmux pane 수로 팀원 존재 확인
PANE_COUNT=$(tmux list-panes -t "$CURRENT_SESSION" 2>/dev/null | wc -l | tr -d ' ')
PANE_COUNT=${PANE_COUNT:-0}

if [ "$PANE_COUNT" -le 1 ]; then
    echo "❌ delegate 모드(팀원)가 없습니다. (세션: $CURRENT_SESSION, pane: $PANE_COUNT)" >&2
    echo "Shift+Tab → delegate 모드로 전환하고 팀원을 만드세요." >&2
    echo "CLAUDE.md 절대규칙 0번: 팀 없이 단독 작업 금지" >&2
    exit 2
fi

exit 0