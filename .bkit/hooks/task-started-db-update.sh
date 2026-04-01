#!/bin/bash
# task-started-db-update.sh — TaskCreated 시 DB 상태 in_progress 업데이트
# .bkit/runtime/task-state-{feature}.json + pdca-status.json 갱신
# 항상 exit 0

# Block logger: 차단(exit 2) 시 자동 기록
_bl_trap() { local e=$?; [ "$e" = "2" ] && source "$(dirname "$0")/helpers/block-logger.sh" 2>/dev/null && log_block "차단" "task-started-db-update" "${COMMAND:-unknown}" 2>/dev/null; exit $e; }
trap _bl_trap EXIT

PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"
RUNTIME_DIR="$PROJECT_DIR/.bkit/runtime"
STATE_DIR="$PROJECT_DIR/.bkit/state"

mkdir -p "$RUNTIME_DIR" "$STATE_DIR" 2>/dev/null || true

# stdin JSON에서 정보 추출
INPUT=$(cat 2>/dev/null || true)
eval "$(echo "$INPUT" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    subj = d.get('task_subject') or d.get('title') or ''
    mate = d.get('teammate_name') or 'unknown'
    team = d.get('team_name') or ''
    tid = d.get('task_id') or ''
    print(f'TASK_SUBJECT=\"{subj}\"')
    print(f'TEAMMATE_NAME=\"{mate}\"')
    print(f'TEAM_NAME=\"{team}\"')
    print(f'TASK_ID=\"{tid}\"')
except:
    print('TASK_SUBJECT=\"\"')
    print('TEAMMATE_NAME=\"unknown\"')
    print('TEAM_NAME=\"\"')
    print('TASK_ID=\"\"')
" 2>/dev/null || echo 'TASK_SUBJECT=""; TEAMMATE_NAME="unknown"; TEAM_NAME=""; TASK_ID=""')"

# Feature 이름: TASK_NAME 환경변수 > task_subject에서 추론
FEATURE="${TASK_NAME:-}"
if [ -z "$FEATURE" ] && [ -n "$TASK_SUBJECT" ]; then
    # task_subject에서 feature 이름 추출 (영문 kebab-case 부분)
    FEATURE=$(echo "$TASK_SUBJECT" | sed 's/[^a-zA-Z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | tr '[:upper:]' '[:lower:]' | cut -c1-50)
fi
[ -z "$FEATURE" ] && FEATURE="unknown-task"

# 1. task-state-{feature}.json 업데이트
STATE_FILE="$RUNTIME_DIR/task-state-${FEATURE}.json"

python3 -c "
import json, sys, os
from datetime import datetime, timezone

state_file = sys.argv[1]
teammate = sys.argv[2]
task_id = sys.argv[3]
team = sys.argv[4]
subject = sys.argv[5]

data = {}
if os.path.exists(state_file):
    try:
        with open(state_file) as f:
            data = json.load(f)
    except: pass

data['status'] = 'in_progress'
data['started_at'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
data['teammate'] = teammate
data['task_id'] = task_id
data['team'] = team
data['subject'] = subject

with open(state_file, 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')
" "$STATE_FILE" "$TEAMMATE_NAME" "$TASK_ID" "$TEAM_NAME" "$TASK_SUBJECT" 2>/dev/null || true

# 2. pdca-status.json 업데이트 (doStartedAt 기록)
PDCA_FILE="$STATE_DIR/pdca-status.json"
if [ -f "$PDCA_FILE" ]; then
    python3 -c "
import json, sys
from datetime import datetime, timezone

pdca_file = sys.argv[1]
feature = sys.argv[2]

try:
    with open(pdca_file) as f:
        data = json.load(f)
except: data = {}

features = data.get('features', {})
if feature in features:
    features[feature]['phase'] = 'do'
    features[feature]['doStartedAt'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    data['features'] = features
    with open(pdca_file, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')
" "$PDCA_FILE" "$FEATURE" 2>/dev/null || true
fi

echo "task-state:${FEATURE} status:in_progress"

exit 0
