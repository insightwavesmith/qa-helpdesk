#!/bin/bash
# registry-update.sh — TeamCreate 후 teammate-registry.json 자동 업데이트
# PostToolUse(TeamCreate) hook
# V2 (2026-03-30): P4 해결

PROJECT_DIR="/Users/smith/projects/bscamp"
REGISTRY="$PROJECT_DIR/.claude/runtime/teammate-registry.json"
mkdir -p "$(dirname "$REGISTRY")" 2>/dev/null

INPUT=$(cat)
MEMBER_NAME=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    r = data.get('tool_result', {})
    print(r.get('name', 'unknown'))
except: print('unknown')
" 2>/dev/null)

MEMBER_MODEL=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    r = data.get('tool_result', {})
    print(r.get('model', 'unknown'))
except: print('unknown')
" 2>/dev/null)

[ "$MEMBER_NAME" = "unknown" ] && exit 0

CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

python3 << PYINNER
import json
rp = '$REGISTRY'
try:
    with open(rp) as f: data = json.load(f)
except: data = {'shutdownState':'running','members':{}}
if 'members' not in data: data['members'] = {}
data['members']['$MEMBER_NAME'] = {'state':'active','created':'$CREATED_AT','model':'$MEMBER_MODEL'}
with open(rp,'w') as f: json.dump(data,f,indent=2)
PYINNER

exit 0
