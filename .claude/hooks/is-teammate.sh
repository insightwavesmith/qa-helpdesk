#!/bin/bash
# is-teammate.sh — 팀원 역할 감지 헬퍼
# source하면 IS_TEAMMATE 변수 설정
# Agent Teams tmux 환경에서 pane_index > 0이면 팀원
#
# 사용법:
#   source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
#   [ "$IS_TEAMMATE" = "true" ] && exit 0
#
# 감지 원리:
#   - Agent Teams 활성화 ($CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1)
#   - tmux 환경 ($TMUX 존재)
#   - pane_index 0 = 리더, 1+ = 팀원

# 이미 설정된 경우 존중 (테스트 환경에서 env로 주입 가능)
if [ -z "${IS_TEAMMATE:-}" ]; then
    IS_TEAMMATE="false"

    if [ -n "$TMUX" ] && [ "$CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" = "1" ]; then
        _PANE_IDX=$(tmux display-message -p '#{pane_index}' 2>/dev/null)
        if [ -n "$_PANE_IDX" ] && [ "$_PANE_IDX" -gt 0 ] 2>/dev/null; then
            IS_TEAMMATE="true"
        fi
    fi
fi
