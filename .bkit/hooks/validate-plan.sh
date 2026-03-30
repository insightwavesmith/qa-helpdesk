#!/bin/bash
# validate-plan.sh — Plan/Design 문서 + PDCA 상태 없이 src/ 수정 차단
# PreToolUse hook (Edit|Write): src/ 파일 수정 시 PDCA 전체 검증
# exit 2 = 차단 (게이트)

# 팀원은 PDCA 게이팅 패스 (리더 전용 검증)
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

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

PROJECT_DIR="/Users/smith/projects/bscamp"

# 프로세스 레벨 판단
source "$(dirname "$0")/detect-process-level.sh" 2>/dev/null
REL_FILE=$(echo "$FILE" | sed "s|${PROJECT_DIR}/||")
detect_level_from_file "$REL_FILE"

# L0(응급)/L1(경량): Plan/Design 체크 스킵
if [ "$PROCESS_LEVEL" = "L0" ] || [ "$PROCESS_LEVEL" = "L1" ]; then
    echo "✅ [PDCA $PROCESS_LEVEL] Plan/Design 사전 검증 스킵"
    exit 0
fi

# L2/L3: 전체 검증
# ── 1. TASK 파일 존재 확인 ──
TASK_FILES=$(find "$PROJECT_DIR" -maxdepth 1 -name "TASK*.md" -not -name "TASK.template.md" -type f 2>/dev/null)
if [ -z "$TASK_FILES" ]; then
    source /Users/smith/projects/bscamp/.bkit/hooks/notify-hook.sh 2>/dev/null && \
        notify_hook "🚫 [PDCA 게이트] TASK 파일 없이 src/ 수정 시도" "plan"
    echo "❌ TASK 파일이 없습니다." >&2
    echo "TASK.md를 먼저 작성하세요." >&2
    exit 2
fi

# ── 2. Plan 문서 존재 확인 ──
PLAN_COUNT=$(find "$PROJECT_DIR/docs/01-plan/features" -name "*.plan.md" -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "${PLAN_COUNT:-0}" -eq 0 ]; then
    source /Users/smith/projects/bscamp/.bkit/hooks/notify-hook.sh 2>/dev/null && \
        notify_hook "🚫 [PDCA 게이트] Plan 문서 없이 src/ 수정 시도" "plan"
    echo "❌ Plan 문서가 없습니다. (docs/01-plan/features/)" >&2
    echo "Plan을 먼저 작성한 후 코딩을 시작하세요." >&2
    exit 2
fi

# ── 3. Design 문서 존재 확인 ──
DESIGN_COUNT=$(find "$PROJECT_DIR/docs/02-design/features" -name "*.design.md" -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "${DESIGN_COUNT:-0}" -eq 0 ]; then
    source /Users/smith/projects/bscamp/.bkit/hooks/notify-hook.sh 2>/dev/null && \
        notify_hook "🚫 [PDCA 게이트] Design 문서 없이 src/ 수정 시도" "plan"
    echo "❌ Design 문서가 없습니다. (docs/02-design/features/)" >&2
    echo "Design을 먼저 작성한 후 코딩을 시작하세요." >&2
    exit 2
fi

# ── 4. .pdca-status.json에 현재 기능이 등록됐는지 ──
PDCA_ROOT="$PROJECT_DIR/.pdca-status.json"
if [ ! -f "$PDCA_ROOT" ]; then
    source /Users/smith/projects/bscamp/.bkit/hooks/notify-hook.sh 2>/dev/null && \
        notify_hook "🚫 [PDCA 게이트] .pdca-status.json 없이 src/ 수정 시도" "plan"
    echo "❌ .pdca-status.json이 없습니다." >&2
    echo "현재 작업을 .pdca-status.json에 등록하세요 (status: implementing)." >&2
    exit 2
fi

PDCA_DOCS="$PROJECT_DIR/docs/.pdca-status.json"
if [ ! -f "$PDCA_DOCS" ]; then
    source /Users/smith/projects/bscamp/.bkit/hooks/notify-hook.sh 2>/dev/null && \
        notify_hook "🚫 [PDCA 게이트] docs/.pdca-status.json 없이 src/ 수정 시도" "plan"
    echo "❌ docs/.pdca-status.json이 없습니다." >&2
    echo "현재 작업을 docs/.pdca-status.json에 등록하세요." >&2
    exit 2
fi

echo "✅ PDCA 사전 검증 통과: TASK ✓, Plan ${PLAN_COUNT}건, Design ${DESIGN_COUNT}건, PDCA 상태 파일 ✓"
exit 0
