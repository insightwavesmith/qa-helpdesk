#!/bin/bash
# agent-approve.sh — Plan 승인 (TUI 선택)
# 사용: agent-approve.sh [선택번호] [세션명]
CHOICE="${1:-1}"
SESSION="${2:-agent-team}"
tmux send-keys -t "$SESSION" "$CHOICE"
sleep 0.5
tmux send-keys -t "$SESSION" Enter
echo "OK: 선택 $CHOICE 전송 → $SESSION"
