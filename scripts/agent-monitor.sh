#!/bin/bash
# agent-monitor.sh — 에이전트팀 작업 완료 실시간 모니터링
set -e

PROJECT_DIR="/Users/smith/projects/bscamp"
LOG_FILE="/tmp/agent-monitor.log"
STATE_FILE="/tmp/agent-monitor-state.json"

cd "$PROJECT_DIR"

echo "🔄 에이전트팀 실시간 모니터링 시작 ($(date))"

# 이전 상태 로드
if [[ -f "$STATE_FILE" ]]; then
    PREV_STATE=$(cat "$STATE_FILE")
else
    PREV_STATE='{}'
fi

while true; do
    # 현재 상태 체크
    CURRENT_STATE=$(python3 -c "
import json, subprocess, re, time
from datetime import datetime

def get_session_status(session):
    try:
        result = subprocess.run(['tmux', 'capture-pane', '-t', session, '-p'], 
                              capture_output=True, text=True, timeout=5)
        output = result.stdout
        
        # tasks 정보 파싱
        task_match = re.search(r'(\d+) tasks \((\d+) done, (\d+) in progress, (\d+) open\)', output)
        if task_match:
            total, done, progress, open_tasks = map(int, task_match.groups())
            return {
                'total': total,
                'done': done, 
                'progress': progress,
                'open': open_tasks,
                'last_check': datetime.now().isoformat()
            }
    except:
        pass
    return None

# 3팀 상태 수집
sessions = ['sdk-cto', 'sdk-pm', 'sdk-mkt']
current = {}

for session in sessions:
    status = get_session_status(session)
    if status:
        current[session] = status

print(json.dumps(current, indent=2))
")

    # 이전 상태와 비교해서 변화 감지
    python3 -c "
import json, sys
import subprocess

current = json.loads('$CURRENT_STATE')
prev = json.loads('$PREV_STATE')

changes = []

for team, status in current.items():
    if team in prev:
        old_done = prev[team].get('done', 0)
        new_done = status.get('done', 0)
        old_total = prev[team].get('total', 0)
        new_total = status.get('total', 0)
        
        # 완료 작업 증가 감지
        if new_done > old_done:
            changes.append(f'✅ {team}: {old_done}→{new_done}개 완료 ({new_done}/{new_total})')
        
        # 전체 작업 완료 감지
        if new_done == new_total and new_total > 0 and old_done != old_total:
            changes.append(f'🎉 {team}: 전체 작업 완료! ({new_total}/{new_total})')
    else:
        # 새로운 팀 작업 시작
        if status.get('total', 0) > 0:
            changes.append(f'🚀 {team}: 작업 시작 ({status[\"done\"]}/{status[\"total\"]})')

# 변화가 있으면 알림
if changes:
    timestamp = '$(date \"+%Y-%m-%d %H:%M:%S\")'
    for change in changes:
        print(f'[{timestamp}] {change}')
        
        # 슬랙 알림 (webhook이 있으면)
        if '$SLACK_WEBHOOK_URL':
            try:
                subprocess.run(['curl', '-X', 'POST', '$SLACK_WEBHOOK_URL',
                              '-H', 'Content-Type: application/json',
                              '-d', json.dumps({'text': f'📊 에이전트팀: {change}'})],
                              capture_output=True, timeout=5)
            except:
                pass
                
        # 로그 파일에 기록
        with open('/tmp/agent-monitor.log', 'a') as f:
            f.write(f'[{timestamp}] {change}\\n')
"

    # 상태 저장
    echo "$CURRENT_STATE" > "$STATE_FILE"
    
    sleep 30  # 30초마다 체크
done