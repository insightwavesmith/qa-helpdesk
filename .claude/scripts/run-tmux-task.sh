#!/bin/bash
# run-tmux-task.sh — TASK 파일을 agent-team-run.js에 전달하는 래퍼
# 사용법: bash .claude/scripts/run-tmux-task.sh [plan|dev|full] TASK-파일.md
#
# 내부적으로 agent-team-run.js를 호출하여 tmux 세션 생성 + claude CLI 실행
# settings 백업/복구, Slack DM, Validation 등 모든 기능 포함

set -e

MODE="${1:-dev}"
TASK_FILE="$2"

if [ -z "$TASK_FILE" ] || [ ! -f "$TASK_FILE" ]; then
  echo "사용법: bash .claude/scripts/run-tmux-task.sh [plan|dev|full] TASK-파일.md"
  echo "예시: bash .claude/scripts/run-tmux-task.sh dev TASK-기능명.md"
  exit 1
fi

echo "=== 에이전트팀 tmux 실행 ==="
echo "모드: $MODE"
echo "TASK: $TASK_FILE"
echo "시작: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# TASK 파일 내용을 프롬프트로 전달
PROMPT="$(cat "$TASK_FILE")"

node /Users/smith/projects/qa-helpdesk/.claude/scripts/agent-team-run.js "$MODE" "$PROMPT"
