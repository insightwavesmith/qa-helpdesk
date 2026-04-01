#!/bin/bash
# Block logger: 차단(exit 2) 시 자동 기록
_bl_trap() { local e=$?; [ "$e" = "2" ] && source "$(dirname "$0")/helpers/block-logger.sh" 2>/dev/null && log_block "차단" "validate-deploy-authority" "${COMMAND:-unknown}" 2>/dev/null; exit $e; }
trap _bl_trap EXIT
# validate-deploy-authority.sh — 배포 명령어는 리더만 허용
# PreToolUse(Bash) hook
# 팀원이 배포 명령어 실행 → exit 2 차단
# 리더가 배포 명령어 실행 → exit 0 허용

# 안전 실패: hook 에러 시 작업 방해 방지
trap 'exit 0' ERR

DEPLOY_WHITELIST=(
    "gcloud run deploy"
    "gcloud storage cp"
    "gcloud app deploy"
    "gcloud builds submit"
    "gcloud functions deploy"
    "gcloud scheduler"
    "docker push"
    "firebase deploy"
)

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

[ -z "$COMMAND" ] && exit 0

# 배포 명령어인지 확인
IS_DEPLOY=false
for PATTERN in "${DEPLOY_WHITELIST[@]}"; do
    if echo "$COMMAND" | grep -q "$PATTERN"; then
        IS_DEPLOY=true
        break
    fi
done

# 배포 명령어가 아니면 패스
[ "$IS_DEPLOY" = "false" ] && exit 0

# tmux 환경 아니면 패스
[ -z "${TMUX:-}" ] && exit 0
[ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" != "1" ] && exit 0

# 리더/팀원 판별
# 활성 팀이 있는지 확인 — 팀 없으면 리더(허용)
TEAM_DIR="$HOME/.claude/teams"
ACTIVE_TEAM=$(find "$TEAM_DIR" -name "config.json" -newer /tmp/.claude-boot 2>/dev/null | head -1)
[ -z "$ACTIVE_TEAM" ] && exit 0

PANE_INDEX=$(tmux display-message -p '#{pane_index}' 2>/dev/null)
[ -z "$PANE_INDEX" ] && exit 0

# 리더 (pane 0) → 허용
if [ "$PANE_INDEX" -eq 0 ] 2>/dev/null; then
    exit 0
fi

# 팀원 (pane 1+) → 차단
echo "BLOCKED: 배포 명령어는 리더 권한. 리더에게 배포를 요청하세요: $COMMAND" >&2
exit 2
