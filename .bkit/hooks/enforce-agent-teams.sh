#!/bin/bash
# enforce-agent-teams.sh — Agent Teams 모드 강제
# PreToolUse hook (Bash|Edit|Write): Agent Teams 환경변수 없으면 차단
# exit 2 = 차단 (게이트)
#
# 목적: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 없이 시작한 세션에서
#       코드 작성/실행을 차단. 단독 세션으로 작업하는 것 방지.

# Agent Teams 환경변수 체크
if [ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS}" = "1" ]; then
    exit 0
fi

# 환경변수가 없으면 차단
echo "❌ Agent Teams 모드가 아닙니다" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "이 세션은 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 없이 시작됨." >&2
echo "" >&2
echo "해결:" >&2
echo "  1. /exit 로 종료" >&2
echo "  2. CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude --dangerously-skip-permissions --model claude-opus-4-6" >&2
echo "" >&2
echo "단독 세션으로 코드 작업 금지. 반드시 Agent Teams 모드로 시작하세요." >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
exit 2
