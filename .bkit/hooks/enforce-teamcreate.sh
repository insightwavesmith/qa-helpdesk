#!/bin/bash
# Block logger: 차단(exit 2) 시 자동 기록
_bl_trap() { local e=$?; [ "$e" = "2" ] && source "$(dirname "$0")/helpers/block-logger.sh" 2>/dev/null && log_block "차단" "enforce-teamcreate" "${COMMAND:-unknown}" 2>/dev/null; exit $e; }
trap _bl_trap EXIT
# enforce-teamcreate.sh — Agent 단독 spawn으로 구현 작업 차단, TeamCreate 강제
# PreToolUse hook (Agent): team_name 없는 구현용 Agent spawn 차단
# exit 2 = 차단 (게이트)

# V3: PID 역추적 자동 등록 (실패해도 계속)
source "$(dirname "$0")/helpers/hook-self-register.sh" 2>/dev/null
auto_register_peer 2>/dev/null

INPUT=$(cat)

# tool_input에서 subagent_type, team_name, prompt 추출
eval "$(echo "$INPUT" | python3 -c "
import sys, json, shlex
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', {})
    st = ti.get('subagent_type', '') or ''
    tn = ti.get('team_name', '') or ''
    pr = (ti.get('prompt', '') or '')[:200]
    print(f'SUBAGENT_TYPE={shlex.quote(st)}')
    print(f'TEAM_NAME={shlex.quote(tn)}')
    print(f'PROMPT_PREVIEW={shlex.quote(pr)}')
except:
    print('SUBAGENT_TYPE=\"\"')
    print('TEAM_NAME=\"\"')
    print('PROMPT_PREVIEW=\"\"')
" 2>/dev/null)"

# 허용 목록: 조사/탐색용 Agent는 팀 없이도 허용
ALLOWED_TYPES="Explore|Plan|claude-code-guide"
if echo "$SUBAGENT_TYPE" | grep -qE "^($ALLOWED_TYPES)$"; then
    exit 0
fi

# bkit 에이전트 (분석/검증 전용)는 허용
if echo "$SUBAGENT_TYPE" | grep -qE "^bkit:"; then
    exit 0
fi

# team_name이 있으면 TeamCreate 팀원으로 spawn → 허용
if [ -n "$TEAM_NAME" ]; then
    exit 0
fi

# 여기까지 왔으면: 구현용 Agent인데 team_name 없음 → 차단
echo "❌ Agent 단독 spawn 차단됨" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "규칙: 모든 구현 작업은 TeamCreate로 팀 생성 후 팀원에게 위임" >&2
echo "  1. TeamCreate로 팀 생성 (팀명 지정)" >&2
echo "  2. Agent tool + team_name 파라미터로 팀원 spawn" >&2
echo "  3. Leader는 delegate 모드 — 코드 직접 작성 금지" >&2
echo "" >&2
echo "허용 예외: Explore, Plan, claude-code-guide, bkit:* 에이전트" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "subagent_type: ${SUBAGENT_TYPE:-없음}" >&2
echo "prompt: ${PROMPT_PREVIEW}" >&2
exit 2
