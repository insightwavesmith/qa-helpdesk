#!/bin/bash
# enforce-plan-before-do.sh — Plan 없이 Do(코딩) 진입 차단
# PreToolUse hook (Edit|Write): src/ 수정 시 Plan 문서 존재 + 최소 줄 수 강제
# exit 2 = 차단 (게이트), 에러 시 기본값 = exit 2 (안전 실패)

# 안전 실패: 스크립트 에러 시 차단
trap 'echo "❌ [enforce-plan] hook 에러 발생 → 안전 차단" >&2; exit 2' ERR

# 팀원은 PDCA 게이팅 패스 (리더 전용 검증)
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

INPUT=$(cat)

PROJECT_DIR="/Users/smith/projects/bscamp"
MIN_PLAN_LINES=30

FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', {})
    print(ti.get('file_path', '') or ti.get('path', '') or '')
except:
    print('')
" 2>/dev/null)

# 파일 경로 파싱 실패 시 안전 차단
if [ -z "$FILE" ]; then
    exit 0  # 파일 경로 없으면 다른 도구이므로 패스
fi

# 절대 경로에서 프로젝트 경로 제거하여 상대 경로로 변환
REL_FILE=$(echo "$FILE" | sed "s|${PROJECT_DIR}/||")

# src/ 파일이 아니면 패스
if ! echo "$REL_FILE" | grep -q "^src/"; then
    exit 0
fi

# 1. Plan 문서 존재 확인
PLAN_FILES=$(find "$PROJECT_DIR/docs/01-plan/features" -name "*.plan.md" -type f 2>/dev/null)
PLAN_COUNT=$(echo "$PLAN_FILES" | grep -c "." 2>/dev/null || echo 0)

if [ "${PLAN_COUNT:-0}" -eq 0 ]; then
    echo "❌ [PDCA 강제] Plan 문서가 없습니다." >&2
    echo "docs/01-plan/features/에 Plan 문서를 먼저 작성하세요." >&2
    echo "Plan → Design → Do → Check → Act 순서를 지키세요." >&2
    source "$PROJECT_DIR/.claude/hooks/notify-hook.sh" 2>/dev/null && \
        notify_hook "🚫 [PDCA 게이트] Plan 없이 src/ 수정 시도: $REL_FILE" "enforce-plan"
    exit 2
fi

# 2. 가장 최근 Plan 문서의 최소 줄 수 확인 (빈 껍데기 방지)
LATEST_PLAN=$(echo "$PLAN_FILES" | while read -r f; do
    [ -f "$f" ] && echo "$(stat -f %m "$f" 2>/dev/null || echo 0) $f"
done | sort -rn | head -1 | cut -d' ' -f2-)

if [ -n "$LATEST_PLAN" ] && [ -f "$LATEST_PLAN" ]; then
    LINE_COUNT=$(wc -l < "$LATEST_PLAN" | tr -d ' ')
    if [ "${LINE_COUNT:-0}" -lt "$MIN_PLAN_LINES" ]; then
        echo "❌ [PDCA 강제] Plan 문서가 너무 짧습니다. (${LINE_COUNT}줄, 최소 ${MIN_PLAN_LINES}줄)" >&2
        echo "파일: $(basename "$LATEST_PLAN")" >&2
        echo "빈 껍데기 Plan은 허용되지 않습니다. 내용을 채워주세요." >&2
        exit 2
    fi
fi

# 3. .pdca-status.json에서 해당 feature의 plan.done 확인 (있으면)
PDCA_ROOT="$PROJECT_DIR/.pdca-status.json"
if [ -f "$PDCA_ROOT" ]; then
    # 최신 feature 찾기 (plan 필드가 있는 것 중 가장 최근)
    PLAN_DONE=$(python3 -c "
import json, sys
try:
    with open('$PDCA_ROOT') as f:
        data = json.load(f)
    # 새 스키마: feature.plan.done 확인
    for key, val in data.items():
        if isinstance(val, dict) and 'plan' in val:
            p = val['plan']
            if isinstance(p, dict) and p.get('done') == True:
                print('true')
                sys.exit(0)
            elif isinstance(p, str):
                # 구 스키마: plan이 문자열(경로)이면 done으로 간주
                print('true')
                sys.exit(0)
    print('false')
except:
    print('unknown')
" 2>/dev/null)

    if [ "$PLAN_DONE" = "false" ]; then
        echo "❌ [PDCA 강제] .pdca-status.json에서 plan.done이 true인 feature가 없습니다." >&2
        echo "Plan 작성 후 .pdca-status.json에 plan.done: true를 등록하세요." >&2
        exit 2
    fi
fi

echo "✅ [PDCA] Plan ${PLAN_COUNT}건 확인 (최소 ${MIN_PLAN_LINES}줄 검증 통과) → Do 진입 허용"
exit 0
