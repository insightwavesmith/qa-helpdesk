#!/bin/bash
# postmortem-validator.sh — postmortem 필수 항목 완성도 검증
# 사용: bash postmortem-validator.sh [파일경로]
# 미지정 시 docs/postmortem/ 전체 open 항목 검증

PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"
PM_DIR="$PROJECT_DIR/docs/postmortem"

validate_postmortem() {
    local FILE="$1"
    local ERRORS=0
    local PM_ID
    PM_ID=$(grep -oE 'id: PM-[0-9]+' "$FILE" | head -1 | awk '{print $2}')
    local STATUS
    STATUS=$(grep -oE 'status: [a-z]+' "$FILE" | head -1 | awk '{print $2}')

    [ "$STATUS" = "resolved" ] && return 0

    # 필수 항목 체크
    if grep -q '{수동 필수}' "$FILE"; then
        UNFILLED=$(grep -c '{수동 필수}' "$FILE")
        echo "  ⚠️ $PM_ID: 미작성 필수 항목 ${UNFILLED}건"
        ERRORS=$((ERRORS + UNFILLED))
    fi

    # 근본 원인 최소 2개
    WHY_COUNT=$(grep -cE '^[0-9]+\. Why: .+[^}]$' "$FILE" 2>/dev/null || echo 0)
    [ "$WHY_COUNT" -lt 2 ] && {
        echo "  ⚠️ $PM_ID: 근본 원인 ${WHY_COUNT}/2 (최소 2개 필수)"
        ERRORS=$((ERRORS + 1))
    }

    # 재발 방지책 최소 1건
    PREVENT_COUNT=$(grep -cE '^\| [0-9]+ \|' "$FILE" 2>/dev/null || echo 0)
    [ "$PREVENT_COUNT" -lt 1 ] && {
        echo "  ⚠️ $PM_ID: 재발 방지책 0건 (최소 1건 필수)"
        ERRORS=$((ERRORS + 1))
    }

    # TDD 케이스 지정 여부
    TDD_EMPTY=$(grep -cE 'prevention_tdd: \[\]' "$FILE" 2>/dev/null || echo 0)
    [ "$TDD_EMPTY" -gt 0 ] && {
        echo "  ⚠️ $PM_ID: prevention_tdd 미지정"
        ERRORS=$((ERRORS + 1))
    }

    return $ERRORS
}

# 실행
TOTAL_ERRORS=0
if [ -n "$1" ]; then
    validate_postmortem "$1"
    TOTAL_ERRORS=$?
else
    for PM_FILE in "$PM_DIR"/*.md; do
        [ -f "$PM_FILE" ] || continue
        [ "$(basename "$PM_FILE")" = "README.md" ] && continue
        validate_postmortem "$PM_FILE"
        TOTAL_ERRORS=$((TOTAL_ERRORS + $?))
    done
fi

if [ "$TOTAL_ERRORS" -eq 0 ]; then
    echo "✅ 모든 postmortem 완성도 OK"
else
    echo "❌ 미완성 항목 ${TOTAL_ERRORS}건 — 채워주세요"
fi
