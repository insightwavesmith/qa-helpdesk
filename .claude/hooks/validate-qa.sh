#!/bin/bash
# validate-qa.sh — commit/push 전 QA 검증 (백엔드/프론트 분리)
# PreToolUse hook (Bash)
# exit 2 = 차단 (게이트)
#
# 백엔드 (src/app/api/, src/lib/, services/) → 코드 리뷰 + tsc + build
# 프론트 (src/app/(main)/, src/components/) → 코드 리뷰 + tsc + build + 브라우저 QA
# docs/chore/style/fix(비코드) → 패스

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

# git commit/push가 아니면 패스
if ! echo "$COMMAND" | grep -qE 'git (commit|push)'; then
    exit 0
fi

# docs/chore/style 커밋은 패스
if echo "$COMMAND" | grep -qE '(docs:|chore:|style:|config:)'; then
    exit 0
fi

PROJECT_DIR="/Users/smith/projects/qa-helpdesk"

# staged 파일 목록
STAGED=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null)

if [ -z "$STAGED" ]; then
    exit 0
fi

# ── 변경 유형 판별 ──
HAS_BACKEND=false
HAS_FRONTEND=false

# 백엔드 패턴
if echo "$STAGED" | grep -qE '^(src/app/api/|src/lib/|services/)'; then
    HAS_BACKEND=true
fi

# 프론트 패턴
if echo "$STAGED" | grep -qE '^(src/app/\(main\)/|src/components/|src/app/\(auth\)/)'; then
    HAS_FRONTEND=true
fi

# 코드 변경 없으면 (설정, 스크립트만) 패스
if [ "$HAS_BACKEND" = false ] && [ "$HAS_FRONTEND" = false ]; then
    exit 0
fi

# ── 공통 검증: tsc + build 마커 ──
BUILD_MARKER="/tmp/agent-build-passed"
if [ ! -f "$BUILD_MARKER" ]; then
    source "$PROJECT_DIR/.claude/hooks/notify-hook.sh" 2>/dev/null && \
        notify_hook "⚠️ [게이트] tsc+build 미통과 — commit 차단" "validate-qa"
    echo "❌ tsc + build 통과 후 커밋하세요." >&2
    echo "  1. npx tsc --noEmit && npm run build" >&2
    echo "  2. touch /tmp/agent-build-passed" >&2
    exit 2
fi

# ── 백엔드: 코드 리뷰 마커 ──
if [ "$HAS_BACKEND" = true ]; then
    REVIEW_MARKER="/tmp/agent-review-passed"
    if [ ! -f "$REVIEW_MARKER" ]; then
        source "$PROJECT_DIR/.claude/hooks/notify-hook.sh" 2>/dev/null && \
            notify_hook "⚠️ [게이트] 코드 리뷰 미완료 — 백엔드 commit 차단" "validate-qa"
        echo "❌ 백엔드 코드 변경 시 코드 리뷰가 필요합니다." >&2
        echo "  1. qa-engineer가 코드 리뷰 실행" >&2
        echo "  2. touch /tmp/agent-review-passed" >&2
        exit 2
    fi
fi

# ── 프론트: 코드 리뷰 + 브라우저 QA 마커 ──
if [ "$HAS_FRONTEND" = true ]; then
    REVIEW_MARKER="/tmp/agent-review-passed"
    BROWSER_MARKER="/tmp/agent-browser-qa-passed"
    
    if [ ! -f "$REVIEW_MARKER" ]; then
        source "$PROJECT_DIR/.claude/hooks/notify-hook.sh" 2>/dev/null && \
            notify_hook "⚠️ [게이트] 코드 리뷰 미완료 — 프론트 commit 차단" "validate-qa"
        echo "❌ 프론트엔드 코드 변경 시 코드 리뷰가 필요합니다." >&2
        echo "  1. qa-engineer가 코드 리뷰 실행" >&2
        echo "  2. touch /tmp/agent-review-passed" >&2
        exit 2
    fi
    
    if [ ! -f "$BROWSER_MARKER" ]; then
        source "$PROJECT_DIR/.claude/hooks/notify-hook.sh" 2>/dev/null && \
            notify_hook "⚠️ [게이트] 브라우저 QA 미완료 — 프론트 commit 차단" "validate-qa"
        echo "❌ 프론트엔드 코드 변경 시 브라우저 QA가 필요합니다." >&2
        echo "  1. localhost:3000에서 변경된 화면 확인" >&2
        echo "  2. 스크린샷 찍고 UI 검증" >&2
        echo "  3. touch /tmp/agent-browser-qa-passed" >&2
        exit 2
    fi
fi

# ── 통과 → 마커 삭제 (1회성) ──
rm -f /tmp/agent-build-passed /tmp/agent-review-passed /tmp/agent-browser-qa-passed

exit 0
