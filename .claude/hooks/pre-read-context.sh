#!/bin/bash
# pre-read-context.sh — 작업 시작 전 PDCA/아키텍처 읽기 가이드
# PreToolUse hook: 첫 번째 Bash 실행 시 컨텍스트 읽기 안내
# exit 0 = 가이드만 (차단 안 함), 반복 멈춤 방지

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

PROJECT_DIR="/Users/smith/projects/bscamp"
MARKER="/tmp/.claude-context-read-$(date +%Y%m%d)"

# 이미 이번 세션에서 읽었으면 패스
if [ -f "$MARKER" ]; then
    exit 0
fi

# npm/git/build 관련 명령일 때만 체크
if ! echo "$COMMAND" | grep -qE '(npm run|npx |git |next |node )'; then
    exit 0
fi

# 마커 생성 (1회만)
touch "$MARKER"

# 가이드 메시지 (차단 아님)
echo "=== 🔍 작업 시작 전 필수 컨텍스트 ==="
echo ""
echo "다음 파일을 반드시 읽고 시작하세요:"
echo "1. PDCA 현황: docs/.pdca-status.json"
echo "2. 아키텍처: docs/01-plan/features/, docs/02-design/features/"
echo "3. 직전 작업: git log --oneline -5"
echo ""

# exit 0 = 통과 (차단 안 함, 루프 방지)
exit 0
