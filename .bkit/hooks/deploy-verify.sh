#!/bin/bash
# deploy-verify.sh — push 후 배포 여부 확인 (chain-handoff 직전)
# TaskCompleted 체인: deploy-trigger 후, chain-handoff 전에 실행
# 경고만 출력, 차단 안 함 (항상 exit 0)

source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"

# L1 (src/ 미수정) → 스킵
HAS_SRC=$(git diff HEAD~1 --name-only 2>/dev/null | grep -c "^src/" || true)
[ "$HAS_SRC" -eq 0 ] && exit 0

# 최근 push 확인
LOCAL_HEAD=$(git rev-parse HEAD 2>/dev/null)
REMOTE_HEAD=$(git rev-parse origin/main 2>/dev/null)

if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
    # push 됨 → 배포 여부는 deploy-trigger.sh가 안내했으므로 여기선 경고만
    DEPLOY_MARKER="$PROJECT_DIR/.bkit/runtime/last-deploy-commit"
    if [ -f "$DEPLOY_MARKER" ]; then
        LAST_DEPLOY=$(cat "$DEPLOY_MARKER")
        if [ "$LAST_DEPLOY" != "$LOCAL_HEAD" ]; then
            echo ""
            echo "⚠ 경고: push 완료(${LOCAL_HEAD:0:7})했지만 배포 미실행"
            echo "  마지막 배포 커밋: ${LAST_DEPLOY:0:7}"
            echo "  실행: gcloud run deploy bscamp-web --source . --region asia-northeast3"
            echo ""
        fi
    fi
fi

exit 0
