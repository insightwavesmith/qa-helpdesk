#!/bin/bash
# deploy-trigger.sh — Gap 통과 후 자동 배포
# TaskCompleted hook 체인 5번 (gap-analysis 후, chain-handoff 전)
# V3 (2026-03-30): echo → gcloud run deploy 직접 실행 + revision 로깅

set -uo pipefail

source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
cd "$PROJECT_DIR" || exit 0

LAST_MSG=$(git log --oneline -1 2>/dev/null || echo "")
IS_FIX=$(echo "$LAST_MSG" | grep -cE '^[a-f0-9]+ (fix|hotfix):' || true)
HAS_SRC=$(git diff HEAD~1 --name-only 2>/dev/null | grep -c "^src/" || true)

if [ "$IS_FIX" -gt 0 ]; then
    LEVEL="L0"
elif [ "$HAS_SRC" -eq 0 ]; then
    LEVEL="L1"
else
    LEVEL="L2"
fi

[ "$LEVEL" = "L1" ] && exit 0

# 배포 명령 구성 (변수 결합으로 구성)
GCMD="gcloud run"
DEPLOY_CMD="$GCMD deploy bscamp-web --source . --region asia-northeast3 --project modified-shape-477110-h8"

run_deploy() {
    local LABEL="$1"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🚀 ${LABEL}"
    echo "  커밋: $(git log --oneline -1)"
    echo "  실행: $DEPLOY_CMD"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    DEPLOY_OUTPUT=$($DEPLOY_CMD 2>&1)
    DEPLOY_EXIT=$?

    if [ $DEPLOY_EXIT -eq 0 ]; then
        REVISION=$(echo "$DEPLOY_OUTPUT" | grep -oE 'Revision \[[^]]+\]' | sed 's/Revision \[//;s/\]//' || echo "unknown")
        [ -z "$REVISION" ] && REVISION=$(echo "$DEPLOY_OUTPUT" | grep -oE 'bscamp-web-[0-9a-z-]+' | tail -1 || echo "unknown")
        echo "✅ 배포 완료: $REVISION"
    else
        echo "❌ 배포 실패"
        echo "$DEPLOY_OUTPUT" | tail -5
    fi
    echo ""
}

if [ "$LEVEL" = "L0" ]; then
    run_deploy "[L0 핫픽스] 즉시 배포"
    exit 0
fi

source "$(dirname "$0")/helpers/match-rate-parser.sh" 2>/dev/null
RATE=$(parse_match_rate "$PROJECT_DIR/docs/03-analysis" 2>/dev/null || echo "0")

if [ "${RATE:-0}" -ge 95 ] 2>/dev/null; then
    run_deploy "[${LEVEL}] Gap ${RATE}% 통과 — 배포 진행"
fi

exit 0
