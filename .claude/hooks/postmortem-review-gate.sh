#!/bin/bash
# postmortem-review-gate.sh — TASK 시작 전 최근 postmortem 리뷰 강제
# PreToolUse(Bash) hook: 세션 1회만 실행
# exit 0 = 가이드만 (차단 아님), 정보 제공

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
MARKER="/tmp/.claude-postmortem-reviewed-$(date +%Y%m%d)"

# 이미 리뷰했으면 패스
[ -f "$MARKER" ] && exit 0

# 개발 명령만 체크
echo "$COMMAND" | grep -qE '(npm run|npx |next |node )' || exit 0

INDEX_FILE="$PROJECT_DIR/docs/postmortem/index.json"
[ ! -f "$INDEX_FILE" ] && { touch "$MARKER"; exit 0; }

# open 상태 postmortem 확인
OPEN_COUNT=$(jq -r '[.postmortems[] | select(.status == "open")] | length' "$INDEX_FILE" 2>/dev/null || echo 0)
RECENT=$(jq -r '[.postmortems[] | select(.status == "open")] | sort_by(.date) | reverse | .[0] // empty' "$INDEX_FILE" 2>/dev/null)

if [ "$OPEN_COUNT" -gt 0 ] && [ -n "$RECENT" ]; then
    RECENT_ID=$(echo "$RECENT" | jq -r '.id')
    RECENT_TITLE=$(echo "$RECENT" | jq -r '.title')
    RECENT_DATE=$(echo "$RECENT" | jq -r '.date')
    RECENT_SLUG=$(echo "$RECENT" | jq -r '.slug')
    RECENT_CATEGORY=$(echo "$RECENT" | jq -r '.category')

    echo "=== 📋 Postmortem 리뷰 필요 (${OPEN_COUNT}건 미해결) ===" >&2
    echo "" >&2
    echo "최근: ${RECENT_ID} — ${RECENT_TITLE} (${RECENT_DATE})" >&2
    echo "분류: ${RECENT_CATEGORY}" >&2
    echo "파일: docs/postmortem/${RECENT_DATE}-${RECENT_SLUG}.md" >&2
    echo "" >&2

    # prevention TDD 추적
    source "$PROJECT_DIR/.claude/hooks/helpers/prevention-tdd-tracker.sh" 2>/dev/null
    if [ "${TRACKER_MISSING:-0}" -gt 0 ]; then
        echo "⚠️ 재발 방지 TDD 누락 ${TRACKER_MISSING}건:" >&2
        echo -e "$TRACKER_DETAILS" >&2
        echo "" >&2
    fi

    echo "현재 TASK와 관련된 postmortem이 있으면 반드시 읽고 시작하세요." >&2
    echo "관련 교훈이 이번 작업에 적용되는지 확인 후 진행하세요." >&2
    echo "" >&2
fi

# 관련성 판단 보조: 현재 TASK 파일에서 키워드 추출 → postmortem 매칭
ACTIVE_TASK=$(ls -t "$PROJECT_DIR/.claude/tasks"/TASK-*.md 2>/dev/null | head -1)
if [ -n "$ACTIVE_TASK" ] && [ -f "$INDEX_FILE" ]; then
    # TASK 내용에서 키워드 추출 (파일명, 기능명)
    TASK_KEYWORDS=$(grep -oE '(migration|auth|chain|deploy|hook|context|sync|dashboard|approval)' "$ACTIVE_TASK" 2>/dev/null | sort -u | tr '\n' '|' | sed 's/|$//')
    if [ -n "$TASK_KEYWORDS" ]; then
        RELATED=$(jq -r --arg kw "$TASK_KEYWORDS" '[.postmortems[] | select(.tags[]? | test($kw; "i"))] | .[].id' "$INDEX_FILE" 2>/dev/null)
        if [ -n "$RELATED" ]; then
            echo "🔗 현재 TASK와 관련된 postmortem:" >&2
            echo "$RELATED" | while read -r PM_ID; do
                echo "  - $PM_ID" >&2
            done
            echo "" >&2
        fi
    fi
fi

# 마커 생성 (세션 1회)
touch "$MARKER"
exit 0
