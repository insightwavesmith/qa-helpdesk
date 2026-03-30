#!/bin/bash
# validate-pdca.sh — PDCA 문서 없이 코딩/커밋 차단
# PreToolUse hook (Bash): git commit 또는 src/ 수정 시 PDCA 강제 검증
# exit 2 = 차단 (게이트)

# 팀원은 PDCA 게이팅 패스 (리더 전용 검증)
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', {})
    print(ti.get('command', '') or '')
except:
    print('')
" 2>/dev/null)

# git commit 명령인지 확인
IS_COMMIT=false
if echo "$COMMAND" | grep -qE "git (commit|push)"; then
    IS_COMMIT=true
fi

# git commit/push가 아니면 패스
if [ "$IS_COMMIT" = false ]; then
    exit 0
fi

PROJECT_DIR="/Users/smith/projects/bscamp"
PDCA_ROOT="$PROJECT_DIR/.pdca-status.json"
PDCA_DOCS="$PROJECT_DIR/docs/.pdca-status.json"

# ── 1. 루트 .pdca-status.json 존재 확인 ──
if [ ! -f "$PDCA_ROOT" ]; then
    source /Users/smith/projects/bscamp/.bkit/hooks/notify-hook.sh 2>/dev/null && \
        notify_hook "🚫 [PDCA 게이트] .pdca-status.json 없이 커밋 시도" "pdca"
    echo "❌ .pdca-status.json이 없습니다." >&2
    echo "" >&2
    echo "PDCA 워크플로우를 따르세요:" >&2
    echo "1. docs/01-plan/features/{기능}.plan.md 작성" >&2
    echo "2. docs/02-design/features/{기능}.design.md 작성" >&2
    echo "3. .pdca-status.json에 현재 기능 상태 추가" >&2
    echo "4. docs/.pdca-status.json에도 추가" >&2
    echo "5. 그 다음에 커밋" >&2
    exit 2
fi

# ── 2. docs/.pdca-status.json 존재 확인 ──
if [ ! -f "$PDCA_DOCS" ]; then
    source /Users/smith/projects/bscamp/.bkit/hooks/notify-hook.sh 2>/dev/null && \
        notify_hook "🚫 [PDCA 게이트] docs/.pdca-status.json 없이 커밋 시도" "pdca"
    echo "❌ docs/.pdca-status.json이 없습니다." >&2
    echo "PDCA 상태 파일을 생성하고 현재 작업을 기록하세요." >&2
    exit 2
fi

# ── 3. 루트 .pdca-status.json이 최근 업데이트됐는지 (30분 이내) ──
ROOT_AGE=$(( $(date +%s) - $(stat -f %m "$PDCA_ROOT" 2>/dev/null || echo 0) ))
if [ "$ROOT_AGE" -gt 1800 ]; then
    source /Users/smith/projects/bscamp/.bkit/hooks/notify-hook.sh 2>/dev/null && \
        notify_hook "🚫 [PDCA 게이트] .pdca-status.json 미갱신 (${ROOT_AGE}초 전). 커밋 차단." "pdca"
    echo "❌ .pdca-status.json이 오래됐습니다 (${ROOT_AGE}초 전 업데이트)." >&2
    echo "" >&2
    echo "커밋 전에 현재 작업 상태를 .pdca-status.json에 업데이트하세요:" >&2
    echo "- status: implementing / completed" >&2
    echo "- tasks: 완료된 태스크 목록" >&2
    echo "- updatedAt: 현재 날짜" >&2
    exit 2
fi

# ── 4. docs/.pdca-status.json도 최근 업데이트됐는지 (30분 이내) ──
DOCS_AGE=$(( $(date +%s) - $(stat -f %m "$PDCA_DOCS" 2>/dev/null || echo 0) ))
if [ "$DOCS_AGE" -gt 1800 ]; then
    source /Users/smith/projects/bscamp/.bkit/hooks/notify-hook.sh 2>/dev/null && \
        notify_hook "🚫 [PDCA 게이트] docs/.pdca-status.json 미갱신 (${DOCS_AGE}초 전). 커밋 차단." "pdca"
    echo "❌ docs/.pdca-status.json이 오래됐습니다 (${DOCS_AGE}초 전 업데이트)." >&2
    echo "커밋 전에 docs/.pdca-status.json도 업데이트하세요." >&2
    exit 2
fi

# ── 5. 프로세스 레벨 판단 후 Plan + Design 문서 존재 확인 ──
source "$(dirname "$0")/detect-process-level.sh" 2>/dev/null
detect_level_from_commit "$COMMAND"

# L0(응급)/L1(경량): Plan/Design 체크 스킵
if [ "$PROCESS_LEVEL" = "L0" ] || [ "$PROCESS_LEVEL" = "L1" ]; then
    echo "✅ PDCA 검증 통과 [$PROCESS_LEVEL]: root(${ROOT_AGE}초 전), docs(${DOCS_AGE}초 전). Plan/Design 스킵."
    exit 0
fi

# L2/L3: src/ 변경이 staged 되어있으면 관련 plan/design이 있어야 함
STAGED_SRC=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null | grep "^src/" | head -1)
if [ -n "$STAGED_SRC" ]; then
    PLAN_COUNT=$(find "$PROJECT_DIR/docs/01-plan/features" -name "*.plan.md" -type f 2>/dev/null | wc -l | tr -d ' ')
    DESIGN_COUNT=$(find "$PROJECT_DIR/docs/02-design/features" -name "*.design.md" -type f 2>/dev/null | wc -l | tr -d ' ')

    if [ "${PLAN_COUNT:-0}" -eq 0 ]; then
        source /Users/smith/projects/bscamp/.bkit/hooks/notify-hook.sh 2>/dev/null && \
            notify_hook "🚫 [PDCA 게이트] Plan 문서 없이 src/ 커밋 시도" "pdca"
        echo "❌ [$PROCESS_LEVEL] src/ 파일이 변경됐지만 Plan 문서가 없습니다." >&2
        echo "docs/01-plan/features/{기능}.plan.md를 먼저 작성하세요." >&2
        exit 2
    fi

    if [ "${DESIGN_COUNT:-0}" -eq 0 ]; then
        source /Users/smith/projects/bscamp/.bkit/hooks/notify-hook.sh 2>/dev/null && \
            notify_hook "🚫 [PDCA 게이트] Design 문서 없이 src/ 커밋 시도" "pdca"
        echo "❌ [$PROCESS_LEVEL] src/ 파일이 변경됐지만 Design 문서가 없습니다." >&2
        echo "docs/02-design/features/{기능}.design.md를 먼저 작성하세요." >&2
        exit 2
    fi
fi

echo "✅ PDCA 검증 통과 [$PROCESS_LEVEL]: root(${ROOT_AGE}초 전), docs(${DOCS_AGE}초 전), Plan/Design 존재"
exit 0
