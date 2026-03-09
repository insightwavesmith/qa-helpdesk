#!/bin/bash
# validate-plan.sh — Plan/Design 문서 없이 src/ 수정 차단
# PreToolUse hook (Edit|Write): src/ 파일 수정 시 관련 plan 문서 확인
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

PROJECT_DIR="/Users/smith/projects/qa-helpdesk"
MARKER="/tmp/.claude-plan-checked-$(date +%Y%m%d)"

# 이미 이번 세션에서 체크했으면 패스 (1회만)
if [ -f "$MARKER" ]; then
    exit 0
fi

# TASK 파일이 있는지 확인
TASK_FILES=$(find "$PROJECT_DIR" -maxdepth 1 -name "TASK*.md" -not -name "TASK.template.md" -type f 2>/dev/null)

if [ -z "$TASK_FILES" ]; then
    source /Users/smith/projects/qa-helpdesk/.claude/hooks/notify-hook.sh && \
        notify_hook "⚠️ [게이트 차단] TASK 파일 없이 src/ 수정 시도" "plan"
    
    echo "❌ TASK 파일이 없습니다." >&2
    echo "TASK.md를 먼저 작성하고 Plan/Design을 확인한 후 코딩을 시작하세요." >&2
    exit 2
fi

# Plan 문서 존재 확인
PLAN_COUNT=$(find "$PROJECT_DIR/docs/01-plan/features" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
PLAN_COUNT=${PLAN_COUNT:-0}

if [ "$PLAN_COUNT" -eq 0 ]; then
    source /Users/smith/projects/qa-helpdesk/.claude/hooks/notify-hook.sh && \
        notify_hook "⚠️ [게이트 차단] Plan 문서 없이 src/ 수정 시도" "plan"
    
    echo "❌ Plan 문서가 없습니다. (docs/01-plan/features/)" >&2
    echo "Plan을 먼저 작성한 후 코딩을 시작하세요." >&2
    exit 2
fi

# 마커 생성 (이번 세션 1회만)
touch "$MARKER"
exit 0
