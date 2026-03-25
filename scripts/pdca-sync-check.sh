#!/bin/bash
# pdca-sync-check.sh — PDCA 상태와 실제 개발 진척도 자동 체크
set -e

PROJECT_DIR="/Users/smith/projects/bscamp"
PDCA_FILE="$PROJECT_DIR/.bkit/state/pdca-status.json"
REPORT_FILE="/tmp/pdca-sync-report-$(date +%Y%m%d-%H%M).md"

cd "$PROJECT_DIR"

echo "# PDCA 싱크 체크 리포트 ($(date))" > "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 1. 실제 구현 상태 체크
echo "## 1. 실제 구현 상태" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 주요 기능별 실제 구현 여부 체크
check_feature() {
    local feature="$1"
    local path="$2"
    if [[ -e "$path" ]]; then
        status="✅ 구현됨"
        if [[ -f "$path" ]]; then
            lines=$(wc -l < "$path" 2>/dev/null || echo "0")
            status="✅ 구현됨 ($lines 줄)"
        else
            files=$(find "$path" -name "*.ts" -o -name "*.tsx" 2>/dev/null | wc -l || echo "0")
            status="✅ 구현됨 ($files 파일)"
        fi
    else
        status="❌ 구현 없음"
    fi
    echo "- **$feature**: $status" >> "$REPORT_FILE"
}

# 각 기능별 체크 실행
check_feature "deepgaze-gemini-pipeline" "src/app/api/cron/deepgaze-pipeline/"
check_feature "collect-daily-refactor" "src/app/api/cron/collect-daily/route.ts"
check_feature "slack-notification" "src/app/api/agent-dashboard/slack/"
check_feature "web-terminal-dashboard" "src/app/(main)/admin/terminal/"
check_feature "agent-dashboard" "src/app/(main)/admin/agent-dashboard/"
check_feature "gcp-migration" "scripts/gcp-deploy.sh"
check_feature "pipeline-event-chain" "src/lib/pipeline-chain.ts"

echo "" >> "$REPORT_FILE"

# 2. PDCA 상태 vs 실제 상태 비교
echo "## 2. PDCA vs 실제 상태 불일치" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if [[ ! -f "$PDCA_FILE" ]]; then
    echo "❌ PDCA 파일 없음: $PDCA_FILE" >> "$REPORT_FILE"
    exit 1
fi

python3 -c "
import json, os

pdca = json.load(open('$PDCA_FILE'))
features = pdca.get('features', {})
mismatches = []

# 주요 기능 불일치 체크
checks = {
    'deepgaze-gemini-pipeline': {
        'pdca_status': features.get('deepgaze-gemini-pipeline', {}).get('status', 'unknown'),
        'actual': '설계만 있음' if not os.path.exists('src/app/api/cron/deepgaze-pipeline/') else '구현됨'
    },
    'collect-daily-refactor': {
        'pdca_status': features.get('collect-daily-refactor', {}).get('status', 'unknown'),
        'actual': '미효율' if os.path.getsize('src/app/api/cron/collect-daily/route.ts') > 300*100 else '효율화됨'
    },
    'slack-notification': {
        'pdca_status': features.get('slack-notification', {}).get('status', 'unknown'),
        'actual': '구현됨' if os.path.exists('src/app/api/agent-dashboard/slack/') else '구현 없음'
    },
    'agent-dashboard': {
        'pdca_status': features.get('agent-dashboard', {}).get('status', 'unknown'),
        'actual': '구현됨' if os.path.exists('src/app/(main)/admin/agent-dashboard/') else '구현 없음'
    }
}

for name, check in checks.items():
    pdca_status = check['pdca_status']
    actual = check['actual']
    
    # 불일치 판단 로직
    mismatch = False
    if pdca_status == 'completed' and '구현 없음' in actual:
        mismatch = True
    elif pdca_status == 'implementing' and '구현됨' in actual:
        mismatch = True
    elif pdca_status == 'unknown' and '구현됨' in actual:
        mismatch = True
        
    if mismatch or pdca_status == 'unknown':
        print(f'| **{name}** | {pdca_status} | {actual} | ❌ 불일치 |')
    else:
        print(f'| **{name}** | {pdca_status} | {actual} | ✅ 일치 |')
" >> "$REPORT_FILE"

echo "" >> "$REPORT_FILE"

# 3. 최근 커밋과 PDCA 업데이트 시간 비교
echo "## 3. 최근 활동 vs PDCA 업데이트" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

LAST_COMMIT=$(git log -1 --format="%h %s (%cr)")
LAST_COMMIT_TIME=$(git log -1 --format="%ct")
PDCA_UPDATE_TIME=$(stat -f "%m" "$PDCA_FILE" 2>/dev/null || stat -c "%Y" "$PDCA_FILE" 2>/dev/null || echo "0")

echo "- 최근 커밋: $LAST_COMMIT" >> "$REPORT_FILE"
echo "- PDCA 업데이트: $(date -r $PDCA_UPDATE_TIME 2>/dev/null || date -d @$PDCA_UPDATE_TIME 2>/dev/null || echo 'unknown')" >> "$REPORT_FILE"

if [[ $LAST_COMMIT_TIME -gt $PDCA_UPDATE_TIME ]]; then
    echo "- 🔴 **PDCA가 코드보다 오래됨**: 업데이트 필요" >> "$REPORT_FILE"
else
    echo "- ✅ PDCA가 최신 상태" >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"

# 4. 자동 수정 제안
echo "## 4. 자동 수정 제안" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "다음 명령어로 PDCA 자동 업데이트:" >> "$REPORT_FILE"
echo '```bash' >> "$REPORT_FILE"
echo "bash scripts/pdca-auto-update.sh" >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"

echo "" >> "$REPORT_FILE"
echo "리포트 저장: $REPORT_FILE" >> "$REPORT_FILE"

# 출력
cat "$REPORT_FILE"
echo ""
echo "🔍 전체 리포트: $REPORT_FILE"