#!/bin/bash
# validate-delegate.sh — 리더의 src/ 직접 수정 차단 (팀원은 허용)
# PreToolUse hook (Edit|Write): 리더(pane 0)가 src/ 수정 시 차단, 팀원(pane 1+)은 통과
# exit 2 = 차단 (게이트)
#
# Agent Teams 구조:
#   pane_index 0 = 리더 (코드 직접 수정 금지, delegate만)
#   pane_index 1+ = 팀원 (코드 작성이 본업)
#   tmux 없음 = 로컬 개발 → 패스

# 안전 실패: hook 에러 시 팀원 작업 방해 방지 → 허용
trap 'exit 0' ERR

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

# ── 팀원의 .claude/ 수정 차단 (D5: 승인 블로킹 방지) ──
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
if [ "${IS_TEAMMATE:-}" = "true" ]; then
    if echo "$REL_FILE" | grep -q '\.claude/'; then
        echo "BLOCKED: 팀원은 .claude/ 직접 수정 불가. 리더에게 내용 보고 후 리더가 수정." >&2
        exit 2
    fi
fi

# src/ 파일이 아니면 패스
if ! echo "$REL_FILE" | grep -q "^src/"; then
    exit 0
fi

# 설정/문서 파일은 패스
if echo "$REL_FILE" | grep -qE '^\.(claude|md)|^docs/|^TASK|^CLAUDE'; then
    exit 0
fi

# tmux 환경 아니면 패스 (로컬 개발 / tmux 외 환경)
if [ -z "$TMUX" ]; then
    exit 0
fi

# Agent Teams 미활성이면 패스 (일반 Claude Code 사용)
if [ "$CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" != "1" ]; then
    exit 0
fi

# ─── 핵심: 리더 vs 팀원 구분 ───
# tmux pane_index: 0 = 리더, 1+ = 팀원
PANE_INDEX=$(tmux display-message -p '#{pane_index}' 2>/dev/null)

# pane_index 감지 실패 시 → 허용 (팀원 작업 방해 방지)
if [ -z "$PANE_INDEX" ]; then
    exit 0
fi

# 팀원 (pane_index > 0) → 허용 (팀원은 코드 작성이 본업)
if [ "$PANE_INDEX" -gt 0 ] 2>/dev/null; then
    exit 0
fi

# ─── 리더 (pane_index == 0) → 차단 ───
echo "❌ [delegate 강제] 리더는 src/ 코드를 직접 수정할 수 없습니다." >&2
echo "팀원(frontend-dev, backend-dev)에게 작업을 위임하세요." >&2
echo "CLAUDE.md 규칙: '리더가 직접 코드 쓰면 리젝'" >&2
source "$PROJECT_DIR/.claude/hooks/notify-hook.sh" 2>/dev/null && \
    notify_hook "🚫 [게이트] 리더가 src/ 직접 수정 시도: $REL_FILE" "validate-delegate"
exit 2
