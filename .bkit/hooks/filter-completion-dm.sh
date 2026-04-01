#!/bin/bash
# filter-completion-dm.sh — 팀원(pane 1+)의 TaskCompleted DM 차단
# TaskCompleted hook
# exit 0 = 통과 (리더), exit 2 = 차단 (팀원)

# 비-tmux → 패스
if [ -z "${TMUX:-}" ]; then
    exit 0
fi

# 비-TEAMS → 패스
if [ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" != "1" ]; then
    exit 0
fi

# 호출자 pane 확인
if [ -n "${MOCK_CALLER_PANE:-}" ]; then
    CALLER_PANE="$MOCK_CALLER_PANE"
else
    CALLER_PANE=$(tmux display-message -p '#{pane_index}' 2>/dev/null)
fi

# 리더(pane 0) → 통과
if [ "${CALLER_PANE:-0}" = "0" ]; then
    exit 0
fi

# 팀원(pane 1+) → 차단
echo "❌ 팀원(pane ${CALLER_PANE})은 TaskCompleted DM 전송 불가. 리더(pane 0)에게 보고하세요." >&2
exit 2
