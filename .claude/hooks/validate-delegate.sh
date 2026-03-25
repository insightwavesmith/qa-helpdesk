#!/bin/bash
# validate-delegate.sh — delegate 모드(팀원) 없이 src/ 수정 차단
# PreToolUse hook (Edit|Write): src/ 파일 수정 시 팀원 존재 확인
# exit 2 = 차단 (게이트), 에러 시 기본값 = exit 2 (안전 실패)

# 안전 실패: 스크립트 에러 시 차단
trap 'echo "❌ [validate-delegate] hook 에러 발생 → 안전 차단" >&2; exit 2' ERR

INPUT=$(cat)

PROJECT_DIR="/Users/smith/projects/bscamp"

FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', {})
    print(ti.get('file_path', '') or ti.get('path', '') or '')
except:
    print('')
" 2>/dev/null)

# 파일 경로 없으면 패스
if [ -z "$FILE" ]; then
    exit 0
fi

# 절대 경로에서 프로젝트 경로 제거
REL_FILE=$(echo "$FILE" | sed "s|${PROJECT_DIR}/||")

# src/ 파일이 아니면 패스
if ! echo "$REL_FILE" | grep -q "^src/"; then
    exit 0
fi

# .claude/ .md docs/ 등은 패스
if echo "$REL_FILE" | grep -qE '^\.(claude|md)|^docs/|^TASK|^CLAUDE'; then
    exit 0
fi

# 현재 tmux 세션 자동 감지 (여러 방법 시도)
CURRENT_SESSION=""

# 방법 1: $TMUX 환경변수 사용
if [ -n "$TMUX" ]; then
    CURRENT_SESSION=$(tmux display-message -p '#S' 2>/dev/null)
fi

# 방법 2: TMUX 환경변수 없으면 활성 세션에서 sdk-* 찾기
if [ -z "$CURRENT_SESSION" ]; then
    CURRENT_SESSION=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "^sdk-" | head -1)
fi

# 방법 3: 그래도 없으면 모든 세션 중 attached인 것 찾기
if [ -z "$CURRENT_SESSION" ]; then
    CURRENT_SESSION=$(tmux list-sessions -F '#{session_name} #{session_attached}' 2>/dev/null | grep ' 1$' | awk '{print $1}' | head -1)
fi

# tmux 세션 자체가 없으면 패스 (로컬 개발 등)
if [ -z "$CURRENT_SESSION" ]; then
    exit 0
fi

# tmux pane 수로 팀원 존재 확인 (delegate 모드이면 pane > 1)
PANE_COUNT=$(tmux list-panes -t "$CURRENT_SESSION" 2>/dev/null | wc -l | tr -d ' ')
PANE_COUNT=${PANE_COUNT:-0}

# pane 1개면 팀원 없음 → 차단
if [ "$PANE_COUNT" -le 1 ]; then
    echo "❌ delegate 모드(팀원)가 없습니다. (세션: $CURRENT_SESSION, pane: $PANE_COUNT)" >&2
    echo "Shift+Tab → delegate 모드로 전환하고 팀원을 만드세요." >&2
    echo "CLAUDE.md 절대규칙 0번: 팀 없이 단독 작업 금지" >&2
    source "$PROJECT_DIR/.claude/hooks/notify-hook.sh" 2>/dev/null && \
        notify_hook "🚫 [게이트] 팀원 없이 src/ 수정 시도: $REL_FILE" "validate-delegate"
    exit 2
fi

exit 0
