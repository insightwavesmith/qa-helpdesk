#!/bin/bash
# deploy-trigger.sh — Gap 통과 후 배포 안내
# TaskCompleted hook 체인 5번 (gap-analysis 후, chain-handoff 전)
# V2 (2026-03-30): P3 해결

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

if [ "$LEVEL" = "L0" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🚀 [L0 핫픽스] 즉시 배포 필요"
    echo "  커밋: $(git log --oneline -1)"
    echo "  명령: $DEPLOY_CMD"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    exit 0
fi

source "$(dirname "$0")/helpers/match-rate-parser.sh" 2>/dev/null
RATE=$(parse_match_rate "$PROJECT_DIR/docs/03-analysis" 2>/dev/null || echo "0")

if [ "${RATE:-0}" -ge 95 ] 2>/dev/null; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🚀 [${LEVEL}] Gap ${RATE}% 통과 — 배포 진행"
    echo "  커밋: $(git log --oneline -1)"
    echo "  명령: $DEPLOY_CMD"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
fi

exit 0
