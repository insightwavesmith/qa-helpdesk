#!/bin/bash
# pane-access-guard.sh — 팀원 pane 직접 접근 차단
# PreToolUse:Bash hook
# exit 0 = 허용, exit 2 = 차단
#
# 규칙 A0-7: 다른 팀 리더나 COO가 팀원 pane에 직접 send-keys 금지
# 허용: 리더 pane(0) 접근, 자기 팀 리더→자기 팀원

# V3: PID 역추적 자동 등록 (실패해도 계속)
source "$(dirname "$0")/helpers/hook-self-register.sh" 2>/dev/null
auto_register_peer 2>/dev/null

# 비-tmux 환경 → 허용
[ -z "$TMUX" ] && exit 0

# stdin JSON 읽기
INPUT=$(cat)

# Bash tool의 command 필드 파싱 (비-Bash tool → 허용)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool = data.get('tool_name', '')
    if tool != 'Bash':
        sys.exit(0)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

# command 없거나 비-Bash → 허용
[ -z "$COMMAND" ] && exit 0

# send-keys / send-key 포함 여부 확인
echo "$COMMAND" | grep -qE 'tmux\s+send-keys?' || exit 0

# -t 옵션에서 타겟 추출
# 패턴: -t [따옴표?]session[:window].pane[따옴표?]
# send-keys 앞뒤 어디든 -t 가능
# BSD sed 호환: \s 대신 [[:space:]] 사용
TARGET=$(echo "$COMMAND" | grep -oE -- "-t[[:space:]]+[\"']?[a-zA-Z0-9_-]+(:[0-9]+)?\.[0-9]+[\"']?" | head -1 | sed -E "s/^-t[[:space:]]+//; s/^[\"']//; s/[\"']$//")

if [ -z "$TARGET" ]; then
    # pane 미지정 → 허용
    exit 0
fi

# session과 pane 분리
TARGET_SESSION=$(echo "$TARGET" | sed -E 's/(:[0-9]+)?\.[0-9]+$//')
TARGET_PANE=$(echo "$TARGET" | grep -oE '\.[0-9]+$' | tr -d '.')

# 리더 pane(0) 또는 pane 미지정 → 허용
[ -z "$TARGET_PANE" ] && exit 0
[ "$TARGET_PANE" -eq 0 ] 2>/dev/null && exit 0

# 호출자 확인 (MOCK 지원으로 테스트 가능)
CALLER_SESSION="${MOCK_CALLER_SESSION:-$(tmux display-message -p '#{session_name}' 2>/dev/null)}"
CALLER_PANE="${MOCK_CALLER_PANE:-$(tmux display-message -p '#{pane_index}' 2>/dev/null)}"

# 자기 팀 리더(pane 0) → 허용
[ "$CALLER_SESSION" = "$TARGET_SESSION" ] && [ "$CALLER_PANE" = "0" ] && exit 0

# 차단
source "$(dirname "$0")/helpers/block-logger.sh" 2>/dev/null && log_block "팀원 pane 직접 접근: ${TARGET_SESSION}.${TARGET_PANE}" "pane-access-guard" "$COMMAND"
echo "[pane-access-guard] 차단: 팀원 pane 직접 접근 금지 (A0-7)" >&2
echo "   명령어: $COMMAND" >&2
echo "   대상: ${TARGET_SESSION}.${TARGET_PANE} (팀원)" >&2
echo "   리더 pane으로 전달하세요: ${TARGET_SESSION}.0" >&2
exit 2
