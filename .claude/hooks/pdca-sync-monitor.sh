#!/bin/bash
# pdca-sync-monitor.sh — 커밋 후 PDCA 자동 싱크 체크
# TaskCompleted hook에서 실행
# 팀원은 PDCA 기록 책임 없음 → 리더만 실행

# 팀원 즉시 통과
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
cd "$PROJECT_DIR" || exit 0

# src/ 파일 변경이 있는지 체크
CHANGED_FILES=$(git diff HEAD~1 --name-only | grep "^src/" | wc -l)

if [[ $CHANGED_FILES -gt 0 ]]; then
    echo "🔍 [PDCA-SYNC] src/ 파일 변경 감지 ($CHANGED_FILES files)"
    
    # PDCA 싱크 체크 실행 (백그라운드)
    bash "$PROJECT_DIR/scripts/pdca-sync-check.sh" > /tmp/pdca-sync-latest.md 2>&1 &
    
    # 불일치가 많으면 자동 업데이트
    sleep 2
    MISMATCHES=$(grep "❌ 불일치" /tmp/pdca-sync-latest.md 2>/dev/null | wc -l || echo "0")
    
    if [[ $MISMATCHES -gt 2 ]]; then
        echo "🔧 [PDCA-SYNC] 불일치 $MISMATCHES개 발견, 자동 업데이트 실행"
        bash "$PROJECT_DIR/scripts/pdca-auto-update.sh" > /tmp/pdca-auto-update.log 2>&1
        
        # 슬랙 알림 (API가 있으면)
        if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
            curl -X POST "$SLACK_WEBHOOK_URL" \
                -H "Content-Type: application/json" \
                -d "{\"text\":\"🔧 PDCA 자동 업데이트: $MISMATCHES개 불일치 해결\"}" \
                > /dev/null 2>&1 &
        fi
    fi
fi

exit 0