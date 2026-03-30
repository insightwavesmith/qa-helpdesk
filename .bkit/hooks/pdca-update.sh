#!/bin/bash
# pdca-update.sh — 태스크 완료 시 PDCA 문서 자동 정리 + 자동 sync
# TaskCompleted hook: 5분 이상 미갱신이면 자동 갱신 + sync 후 경고만 (차단 안 함)

trap 'exit 0' ERR

# 팀원은 PDCA 기록 책임 없음 → 즉시 통과
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# 1. PDCA 상태 파일 존재 확인
PDCA_FILE="$PROJECT_DIR/docs/.pdca-status.json"
if [ ! -f "$PDCA_FILE" ]; then
    echo "PDCA 상태 파일(docs/.pdca-status.json)이 없습니다. 작성하세요."
    echo ""
    echo "필수 형식:"
    echo '{'
    echo '  "lastUpdated": "날짜시간",'
    echo '  "currentTask": "TASK 파일명",'
    echo '  "completedTasks": ["T1", "T2"],'
    echo '  "pendingTasks": ["T3", "T4"],'
    echo '  "blockers": [],'
    echo '  "lastCommit": "해시",'
    echo '  "changedFiles": ["파일1", "파일2"]'
    echo '}'
    exit 2
fi

# 2. PDCA 상태가 최근 업데이트됐는지 확인 (5분 이내)
PDCA_AGE=$(( $(date +%s) - $(stat -f %m "$PDCA_FILE" 2>/dev/null || echo 0) ))
if [ "$PDCA_AGE" -gt 300 ]; then
    # 자동 갱신: updatedAt + _autoSyncNote 업데이트
    LAST_COMMIT=$(cd "$PROJECT_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")

    python3 -c "
import json, sys
from datetime import datetime

path = '$PDCA_FILE'
try:
    with open(path, 'r') as f:
        data = json.load(f)
    data['updatedAt'] = datetime.now().isoformat()
    data['_autoSyncNote'] = 'auto-synced at $TIMESTAMP, last commit: $LAST_COMMIT'
    with open(path, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
except Exception as e:
    print(f'auto-sync 실패: {e}', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null

    # docs/ → 루트 + .bkit/ 자동 복사
    cp "$PDCA_FILE" "$PROJECT_DIR/.pdca-status.json" 2>/dev/null
    if [ -d "$PROJECT_DIR/.bkit/state" ]; then
        cp "$PDCA_FILE" "$PROJECT_DIR/.bkit/state/pdca-status.json" 2>/dev/null
    fi
    touch "$PROJECT_DIR/.pdca-status.json" 2>/dev/null

    echo "[PDCA 자동 sync] ${PDCA_AGE}초 미갱신 → updatedAt 자동 갱신 + 3곳 sync 완료 (commit: $LAST_COMMIT)"
    echo "다음부터는 작업 중 docs/.pdca-status.json을 직접 업데이트하세요."
    # 차단하지 않고 경고만 — exit 0
fi

# 3. plan + design 문서 존재 확인
PLAN_COUNT=$(find "$PROJECT_DIR/docs/01-plan" -name "*.plan.md" -newer "$PROJECT_DIR/.claude/settings.json" 2>/dev/null | wc -l | tr -d ' ')
DESIGN_COUNT=$(find "$PROJECT_DIR/docs/02-design" -name "*.design.md" -newer "$PROJECT_DIR/.claude/settings.json" 2>/dev/null | wc -l | tr -d ' ')

if [ "$PLAN_COUNT" -eq 0 ] && [ "$DESIGN_COUNT" -eq 0 ]; then
    echo "Plan 또는 Design 문서가 없습니다. 이번 작업의 Plan/Design을 docs/에 정리하세요."
    exit 2
fi

echo "PDCA 검증 통과: 상태 파일(${PDCA_AGE}초 전 업데이트), Plan ${PLAN_COUNT}건, Design ${DESIGN_COUNT}건"
exit 0
