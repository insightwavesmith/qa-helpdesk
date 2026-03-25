#!/bin/bash
# agent-state-sync.sh — TaskCompleted/TeammateIdle 시 팀 상태 + PDCA + checkpoint 자동 갱신

CROSS_TEAM_DIR="/tmp/cross-team"
PROJECT_ROOT="/Users/smith/projects/bscamp"

# 1. 디렉토리 초기화
mkdir -p "$CROSS_TEAM_DIR"/{pm,marketing,cto,logs,background,slack}

# 2. stdin 이벤트 데이터 읽기
EVENT_DATA=$(cat)

# 3. 팀 식별
TEAM="${AGENT_TEAM:-cto}"
STATE_FILE="$CROSS_TEAM_DIR/$TEAM/state.json"
CHECKPOINT_FILE="$CROSS_TEAM_DIR/$TEAM/checkpoint.json"
NOW=$(date +"%Y-%m-%dT%H:%M:%S+09:00")

# 4. 기존 state.json 읽기
if [ -f "$STATE_FILE" ]; then
  CURRENT_STATE=$(cat "$STATE_FILE")
else
  CURRENT_STATE="{\"name\":\"${TEAM}팀\",\"emoji\":\"⚙️\",\"status\":\"active\",\"color\":\"#6366F1\",\"members\":[],\"tasks\":[]}"
fi

# 5. state.json 갱신 (updatedAt + TASK + contextUsage + idle 감지)
STATE_UPDATED=$(echo "$CURRENT_STATE" | AGENT_TEAM="$TEAM" EVENT_DATA="$EVENT_DATA" NOW="$NOW" \
  CONTEXT_WINDOW_TOKENS="${CONTEXT_WINDOW_TOKENS:-}" \
  CONTEXT_USED_TOKENS="${CONTEXT_USED_TOKENS:-}" \
  python3 -c "
import json, sys, os

state = json.load(sys.stdin)
event_raw = os.environ.get('EVENT_DATA', '{}')
now = os.environ.get('NOW', '')
ctx_window = os.environ.get('CONTEXT_WINDOW_TOKENS', '')
ctx_used = os.environ.get('CONTEXT_USED_TOKENS', '')

# updatedAt 갱신
state['updatedAt'] = now

# contextUsage 갱신
if ctx_window and ctx_used:
    try:
        usage = round(int(ctx_used) / int(ctx_window) * 100)
        state['contextUsage'] = usage
    except Exception:
        pass

# EVENT_DATA에서 taskId + status 추출하여 tasks 배열 갱신
try:
    event = json.loads(event_raw)
    task_id = event.get('taskId', '')
    task_status = event.get('status', '')
    task_title = event.get('taskTitle', '')
    assignee = event.get('assignee', '')

    if task_id and task_status:
        tasks = state.get('tasks', [])
        found = False
        for t in tasks:
            if t.get('id') == task_id:
                t['status'] = task_status
                t['updatedAt'] = now
                found = True
                break
        if not found and task_title:
            tasks.append({
                'id': task_id,
                'title': task_title,
                'status': task_status,
                'assignee': assignee,
                'updatedAt': now
            })
        state['tasks'] = tasks
except Exception:
    pass

# 모든 TASK done이면 idle로 전환
tasks = state.get('tasks', [])
if tasks and all(t.get('status') == 'done' for t in tasks):
    state['status'] = 'idle'
else:
    state['status'] = 'active'

print(json.dumps(state, ensure_ascii=False, indent=2))
" 2>/dev/null)

if [ -n "$STATE_UPDATED" ]; then
  echo "$STATE_UPDATED" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
else
  echo "$CURRENT_STATE" > "$STATE_FILE"
fi

# 5.1 GCS에도 state.json 동기화 (agent-ops/{team}/state.json)
GCS_BUCKET="gs://bscamp-storage/agent-ops"
if command -v gsutil &>/dev/null; then
  gsutil -q cp "$STATE_FILE" "$GCS_BUCKET/$TEAM/state.json" 2>/dev/null &
fi

# 6. PDCA auto-sync
PDCA_ROOT="$PROJECT_ROOT/.pdca-status.json"
PDCA_DOCS="$PROJECT_ROOT/docs/.pdca-status.json"

if [ -f "$PDCA_ROOT" ] || [ -f "$PDCA_DOCS" ]; then
  PDCA_ROOT_CONTENT=""
  PDCA_DOCS_CONTENT=""
  [ -f "$PDCA_ROOT" ] && PDCA_ROOT_CONTENT=$(cat "$PDCA_ROOT")
  [ -f "$PDCA_DOCS" ] && PDCA_DOCS_CONTENT=$(cat "$PDCA_DOCS")

  AGENT_TEAM="$TEAM" EVENT_DATA="$EVENT_DATA" NOW="$NOW" \
  PROJECT_ROOT="$PROJECT_ROOT" \
  PDCA_ROOT_CONTENT="$PDCA_ROOT_CONTENT" \
  PDCA_DOCS_CONTENT="$PDCA_DOCS_CONTENT" \
  python3 << 'PYEOF'
import json, sys, os

team = os.environ.get('AGENT_TEAM', 'cto')
now = os.environ.get('NOW', '')
project_root = os.environ.get('PROJECT_ROOT', '/Users/smith/projects/bscamp')
event_raw = os.environ.get('EVENT_DATA', '{}')
pdca_root_raw = os.environ.get('PDCA_ROOT_CONTENT', '{}')
pdca_docs_raw = os.environ.get('PDCA_DOCS_CONTENT', '{}')

pdca_root_file = os.path.join(project_root, '.pdca-status.json')
pdca_docs_file = os.path.join(project_root, 'docs', '.pdca-status.json')

try:
    event = json.loads(event_raw)
except Exception:
    event = {}

# 현재 feature 찾기
current_feature = event.get('feature', '') or event.get('currentFeature', '')

try:
    pdca_root = json.loads(pdca_root_raw) if pdca_root_raw else {}
except Exception:
    pdca_root = {}

try:
    pdca_docs = json.loads(pdca_docs_raw) if pdca_docs_raw else {}
except Exception:
    pdca_docs = {}

# 현재 feature가 없으면 pdca_docs에서 implementing 상태인 것 찾기
if not current_feature:
    features = pdca_docs.get('features', {})
    for fname, fdata in features.items():
        if fdata.get('phase') in ('implementing', 'designing', 'planning'):
            current_feature = fname
            break

if not current_feature:
    sys.exit(0)

# phase 자동 전환 판단
plan_path = os.path.join(project_root, 'docs', '01-plan', 'features', f'{current_feature}.plan.md')
design_path = os.path.join(project_root, 'docs', '02-design', 'features', f'{current_feature}.design.md')
analysis_path = os.path.join(project_root, 'docs', '03-analysis', f'{current_feature}.analysis.md')

plan_exists = os.path.exists(plan_path)
design_exists = os.path.exists(design_path)
analysis_exists = os.path.exists(analysis_path)

# TASK 상태로 phase 결정
task_status = event.get('status', '')
if analysis_exists:
    new_phase = 'checking'
elif task_status == 'done' and not design_exists:
    new_phase = 'planning'
elif design_exists and not analysis_exists:
    new_phase = 'implementing'
elif plan_exists and not design_exists:
    new_phase = 'designing'
elif plan_exists:
    new_phase = 'planning'
else:
    new_phase = 'implementing'

# 루트 .pdca-status.json 갱신
if os.path.exists(pdca_root_file):
    try:
        with open(pdca_root_file, 'r') as f:
            root_data = json.load(f)
    except Exception:
        root_data = {}
    if current_feature in root_data:
        root_data[current_feature]['updatedAt'] = now
        if new_phase == 'checking':
            root_data[current_feature]['status'] = 'checking'
        # matchRate 자동 추출 (analysis 파일에서)
        if analysis_exists:
            try:
                import re
                with open(analysis_path, 'r') as af:
                    ac = af.read()
                mr = re.search(r'Match Rate:\s*(\d+)%', ac)
                if mr:
                    root_data[current_feature]['matchRate'] = int(mr.group(1))
            except Exception:
                pass
    else:
        root_data[current_feature] = {
            'status': new_phase,
            'updatedAt': now,
            'team': team
        }
    try:
        with open(pdca_root_file + '.tmp', 'w') as f:
            json.dump(root_data, f, ensure_ascii=False, indent=2)
        os.rename(pdca_root_file + '.tmp', pdca_root_file)
    except Exception:
        pass

# docs/.pdca-status.json 갱신
if os.path.exists(pdca_docs_file):
    try:
        with open(pdca_docs_file, 'r') as f:
            docs_data = json.load(f)
    except Exception:
        docs_data = {'features': {}}
    features = docs_data.get('features', {})
    if current_feature not in features:
        features[current_feature] = {
            'phase': new_phase,
            'matchRate': None,
            'documents': {},
            'notes': '',
            'updatedAt': now
        }
    else:
        features[current_feature]['phase'] = new_phase
        features[current_feature]['updatedAt'] = now
    # matchRate 자동 추출 (analysis 파일에서 "Match Rate: XX%" 패턴)
    if analysis_exists:
        try:
            import re
            with open(analysis_path, 'r') as af:
                analysis_content = af.read()
            mr_match = re.search(r'Match Rate:\s*(\d+)%', analysis_content)
            if mr_match:
                features[current_feature]['matchRate'] = int(mr_match.group(1))
        except Exception:
            pass

    # documents 갱신
    docs = features[current_feature].get('documents', {})
    if plan_exists:
        docs['plan'] = f'docs/01-plan/features/{current_feature}.plan.md'
    if design_exists:
        docs['design'] = f'docs/02-design/features/{current_feature}.design.md'
    if analysis_exists:
        docs['analysis'] = f'docs/03-analysis/{current_feature}.analysis.md'
    features[current_feature]['documents'] = docs
    docs_data['features'] = features
    try:
        with open(pdca_docs_file + '.tmp', 'w') as f:
            json.dump(docs_data, f, ensure_ascii=False, indent=2)
        os.rename(pdca_docs_file + '.tmp', pdca_docs_file)
    except Exception:
        pass
PYEOF
fi

# 7. checkpoint.json 갱신
GIT_BRANCH=$(cd "$PROJECT_ROOT" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_LAST_COMMIT=$(cd "$PROJECT_ROOT" && git log -1 --format=%H 2>/dev/null || echo "")
GIT_CHANGED_FILES=$(cd "$PROJECT_ROOT" && git diff --name-only 2>/dev/null | tr '\n' ',' | sed 's/,$//')

CHECKPOINT_STATE=$([ -f "$STATE_FILE" ] && cat "$STATE_FILE" || echo "{}")

EVENT_DATA="$EVENT_DATA" TEAM="$TEAM" NOW="$NOW" \
GIT_BRANCH="$GIT_BRANCH" GIT_LAST_COMMIT="$GIT_LAST_COMMIT" \
GIT_CHANGED_FILES="$GIT_CHANGED_FILES" \
CHECKPOINT_STATE="$CHECKPOINT_STATE" \
CONTEXT_WINDOW_TOKENS="${CONTEXT_WINDOW_TOKENS:-}" \
CONTEXT_USED_TOKENS="${CONTEXT_USED_TOKENS:-}" \
python3 << 'PYEOF'
import json, sys, os

team = os.environ.get('TEAM', 'cto')
now = os.environ.get('NOW', '')
event_raw = os.environ.get('EVENT_DATA', '{}')
git_branch = os.environ.get('GIT_BRANCH', 'unknown')
git_last_commit = os.environ.get('GIT_LAST_COMMIT', '')
git_changed_raw = os.environ.get('GIT_CHANGED_FILES', '')
checkpoint_state_raw = os.environ.get('CHECKPOINT_STATE', '{}')
ctx_window = os.environ.get('CONTEXT_WINDOW_TOKENS', '')
ctx_used = os.environ.get('CONTEXT_USED_TOKENS', '')

checkpoint_file = f'/tmp/cross-team/{team}/checkpoint.json'

# 기존 checkpoint 읽기
existing = {}
if os.path.exists(checkpoint_file):
    try:
        with open(checkpoint_file, 'r') as f:
            existing = json.load(f)
    except Exception:
        existing = {}

try:
    event = json.loads(event_raw)
except Exception:
    event = {}

try:
    state = json.loads(checkpoint_state_raw)
except Exception:
    state = {}

# contextUsage 계산
context_usage = existing.get('session', {}).get('contextUsage', 0)
if ctx_window and ctx_used:
    try:
        context_usage = round(int(ctx_used) / int(ctx_window) * 100)
    except Exception:
        pass

# git 변경 파일 목록
changed_files = [f for f in git_changed_raw.split(',') if f.strip()] if git_changed_raw else []

# current feature
current_feature = (
    event.get('feature') or
    event.get('currentFeature') or
    state.get('currentFeature') or
    existing.get('currentFeature', '')
)

# tasks 스냅샷 (state.json의 tasks 배열 → dict)
tasks_snapshot = {}
state_tasks = state.get('tasks', [])
for t in state_tasks:
    tid = t.get('id', '')
    if tid:
        tasks_snapshot[tid] = {
            'title': t.get('title', ''),
            'status': t.get('status', 'pending'),
            'assignee': t.get('assignee', '')
        }

# 이벤트에서 단일 task도 반영
task_id = event.get('taskId', '')
if task_id:
    tasks_snapshot[task_id] = {
        'title': event.get('taskTitle', ''),
        'status': event.get('status', 'done'),
        'assignee': event.get('assignee', '')
    }

# nextSteps, blockers는 기존 유지
next_steps = existing.get('nextSteps', [])
blockers = existing.get('blockers', [])
notes = existing.get('notes', '')

checkpoint = {
    'team': team,
    'savedAt': now,
    'session': {
        'contextUsage': context_usage
    },
    'currentFeature': current_feature,
    'tasks': tasks_snapshot,
    'git': {
        'branch': git_branch,
        'lastCommit': git_last_commit,
        'changedFiles': changed_files
    },
    'documents': existing.get('documents', {}),
    'nextSteps': next_steps,
    'blockers': blockers,
    'notes': notes
}

try:
    tmp_file = checkpoint_file + '.tmp'
    with open(tmp_file, 'w') as f:
        json.dump(checkpoint, f, ensure_ascii=False, indent=2)
    os.rename(tmp_file, checkpoint_file)
except Exception as e:
    sys.stderr.write(f'checkpoint write error: {e}\n')
PYEOF

# 8. GCS에 checkpoint + pdca-status 동기화
if command -v gsutil &>/dev/null; then
  [ -f "$CHECKPOINT_FILE" ] && gsutil -q cp "$CHECKPOINT_FILE" "$GCS_BUCKET/$TEAM/checkpoint.json" 2>/dev/null &
  [ -f "$PDCA_DOCS" ] && gsutil -q cp "$PDCA_DOCS" "$GCS_BUCKET/pdca-status.json" 2>/dev/null &
  [ -f "$PDCA_ROOT" ] && gsutil -q cp "$PDCA_ROOT" "$GCS_BUCKET/pdca-status-root.json" 2>/dev/null &
fi

exit 0
