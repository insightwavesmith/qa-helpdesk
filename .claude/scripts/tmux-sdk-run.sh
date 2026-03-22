#!/bin/bash
# tmux-sdk-run.sh — SDK를 tmux 세션에서 실행 (필수)
# 사용: tmux-sdk-run.sh [plan|dev|full] "지시문" [세션명]
#
# 규칙:
# - Opus 4.6 + thinking high (agent-sdk-run.js에서 강제)
# - 에이전트팀 활성화
# - tmux 세션에서만 실행 (nohup/background 금지)

MODE="${1:-full}"
PROMPT="$2"
SESSION="${3:-sdk-task}"
PROJECT="/Users/smith/projects/bscamp"

if [ -z "$PROMPT" ]; then
  echo "사용법: tmux-sdk-run.sh [plan|dev|full] '지시문' [세션명]"
  exit 1
fi

# 기존 세션 있으면 죽이기
tmux kill-session -t "$SESSION" 2>/dev/null

# 새 tmux 세션 생성
tmux new-session -d -s "$SESSION" -c "$PROJECT"

# SDK 실행
tmux send-keys -t "$SESSION" "node .claude/scripts/agent-sdk-run.js $MODE \"$PROMPT\"" Enter

echo "✅ tmux 세션 '$SESSION' 에서 SDK 실행 시작"
echo "   모니터링: tmux capture-pane -t $SESSION -p | tail -20"
echo "   로그: cat /tmp/agent-sdk-progress.log | tail -20"
echo "   접속: tmux attach -t $SESSION"
