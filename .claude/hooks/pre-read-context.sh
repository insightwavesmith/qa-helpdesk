#!/bin/bash
# pre-read-context.sh — 작업 시작 전 PDCA/아키텍처 + 직전 작업 읽기 강제
# PreToolUse hook: 첫 번째 Bash/Read 실행 시 컨텍스트 읽기 안내

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

PROJECT_DIR="/Users/smith/projects/qa-helpdesk"
MARKER="/tmp/.claude-context-read-$(date +%Y%m%d)"

# 이미 이번 세션에서 읽었으면 패스
if [ -f "$MARKER" ]; then
    exit 0
fi

# npm/git/build 관련 명령일 때만 체크 (단순 ls/cat 등은 패스)
if ! echo "$COMMAND" | grep -qE '(npm run|npx |git |next |node )'; then
    exit 0
fi

# 마커 생성 (이번 세션에서 1회만 실행)
touch "$MARKER"

# 컨텍스트 읽기 지시
echo "=== 🔍 작업 시작 전 필수 컨텍스트 ==="
echo ""
echo "다음 파일을 반드시 읽고 시작하세요:"
echo ""
echo "1. PDCA 현황: docs/.pdca-status.json"
echo "2. 아키텍처:"
echo "   - docs/01-plan/features/ (최신 plan 문서)"
echo "   - docs/02-design/features/ (최신 design 문서)"  
echo "3. 직전 작업 결과:"
echo "   - docs/03-analysis/ (최신 gap 분석)"
echo "   - git log --oneline -5 (최근 커밋)"
echo ""
echo "읽은 후 작업을 시작하세요."
echo ""

# exit 0 = 허용 (경고만, 차단하지 않음)
exit 0
