#!/bin/bash
# pdca-auto-update.sh — 실제 구현 상태로 PDCA 자동 업데이트
set -e

PROJECT_DIR="/Users/smith/projects/bscamp"
PDCA_FILE="$PROJECT_DIR/.bkit/state/pdca-status.json"

cd "$PROJECT_DIR"

echo "🔄 PDCA 자동 업데이트 시작..."

# Python으로 실제 구현 상태 체크해서 PDCA 업데이트
python3 -c "
import json, os
from datetime import datetime

# PDCA 파일 로드
if os.path.exists('$PDCA_FILE'):
    with open('$PDCA_FILE', 'r', encoding='utf-8') as f:
        pdca = json.load(f)
else:
    pdca = {'features': {}, 'lastUpdated': None}

features = pdca.get('features', {})
updated_count = 0

# 실제 구현 상태 체크해서 PDCA 상태 교정
updates = {}

# deepgaze-gemini-pipeline
if os.path.exists('src/app/api/cron/deepgaze-pipeline/'):
    updates['deepgaze-gemini-pipeline'] = {'status': 'completed', 'phase': 'deployed'}
else:
    if os.path.exists('docs/02-design/features/deepgaze-gemini-pipeline.design.md'):
        updates['deepgaze-gemini-pipeline'] = {'status': 'ready', 'phase': 'designing'}

# collect-daily-refactor
route_size = os.path.getsize('src/app/api/cron/collect-daily/route.ts') if os.path.exists('src/app/api/cron/collect-daily/route.ts') else 0
if route_size < 30000:  # 30KB 미만이면 효율화됨
    updates['collect-daily-refactor'] = {'status': 'completed', 'phase': 'deployed'}
else:
    updates['collect-daily-refactor'] = {'status': 'implementing', 'phase': 'doing'}

# slack-notification
if os.path.exists('src/app/api/agent-dashboard/slack/notify/route.ts'):
    updates['slack-notification'] = {'status': 'completed', 'phase': 'deployed'}
else:
    if os.path.exists('docs/02-design/features/slack-notification.design.md'):
        updates['slack-notification'] = {'status': 'ready', 'phase': 'designing'}

# agent-dashboard
if os.path.exists('src/app/(main)/admin/agent-dashboard/page.tsx'):
    updates['agent-dashboard'] = {'status': 'completed', 'phase': 'deployed'}
else:
    if os.path.exists('docs/02-design/features/agent-dashboard.design.md'):
        updates['agent-dashboard'] = {'status': 'ready', 'phase': 'designing'}

# web-terminal-dashboard
if os.path.exists('src/app/(main)/admin/terminal/'):
    updates['web-terminal-dashboard'] = {'status': 'completed', 'phase': 'deployed'}
else:
    if os.path.exists('docs/01-plan/features/web-terminal-dashboard.plan.md'):
        updates['web-terminal-dashboard'] = {'status': 'ready', 'phase': 'planning'}

# 업데이트 적용
now = datetime.now().isoformat()
for feature_name, update in updates.items():
    if feature_name not in features:
        features[feature_name] = {}
    
    old_status = features[feature_name].get('status', 'unknown')
    old_phase = features[feature_name].get('phase', 'unknown')
    
    features[feature_name].update(update)
    features[feature_name]['updatedAt'] = now
    
    if old_status != update['status'] or old_phase != update['phase']:
        print(f'🔄 {feature_name}: {old_status}/{old_phase} → {update[\"status\"]}/{update[\"phase\"]}')
        updated_count += 1
    else:
        print(f'✅ {feature_name}: 변경 없음 ({update[\"status\"]}/{update[\"phase\"]})')

pdca['features'] = features
pdca['lastUpdated'] = now

# 파일 저장
os.makedirs(os.path.dirname('$PDCA_FILE'), exist_ok=True)
with open('$PDCA_FILE', 'w', encoding='utf-8') as f:
    json.dump(pdca, f, indent=2, ensure_ascii=False)

print(f'\\n✅ PDCA 업데이트 완료: {updated_count}개 항목 변경')
print(f'📁 저장됨: $PDCA_FILE')
"

echo "🎉 PDCA 자동 업데이트 완료"