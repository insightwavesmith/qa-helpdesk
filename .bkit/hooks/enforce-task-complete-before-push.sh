#!/bin/bash
# enforce-task-complete-before-push.sh — TASK 미완료 상태에서 git push 차단
# PreToolUse:Bash hook: 활성 TASK가 do/implementing이면 push 금지

set -uo pipefail
trap 'exit 0' ERR

# jq 없으면 통과
command -v jq &>/dev/null || exit 0

# stdin JSON 읽기
INPUT=$(cat 2>/dev/null || true)
[ -z "$INPUT" ] && exit 0

# command 추출
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
[ -z "$COMMAND" ] && exit 0

# 따옴표 안 내용 제거 후 git push 검사 (커밋 메시지 오탐 방지)
CLEAN_CMD=$(echo "$COMMAND" | sed "s/'[^']*'//g" | sed 's/"[^"]*"//g')
echo "$CLEAN_CMD" | grep -q 'git push' || exit 0

# pdca-status.json 경로
PDCA_FILE="/Users/smith/projects/bscamp/.bkit/state/pdca-status.json"
[ ! -f "$PDCA_FILE" ] && exit 0

# primaryFeature 추출
PRIMARY=$(jq -r '.primaryFeature // empty' "$PDCA_FILE" 2>/dev/null || true)
[ -z "$PRIMARY" ] && exit 0

# 해당 feature의 phase 추출
PHASE=$(jq -r --arg f "$PRIMARY" '.features[$f].phase // empty' "$PDCA_FILE" 2>/dev/null || true)
[ -z "$PHASE" ] && exit 0

# do 또는 implementing이면 차단
if [ "$PHASE" = "do" ] || [ "$PHASE" = "implementing" ]; then
    echo "❌ [PUSH 차단] 활성 TASK '${PRIMARY}'가 미완료 상태입니다." >&2
    echo "먼저 task를 completed로 변경해라. 그래야 push 가능." >&2
    echo "TaskCompleted hook chain이 webhook을 전송합니다." >&2
    exit 2
fi

# 그 외 phase(completed, plan, design 등)는 통과
exit 0
