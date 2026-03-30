#!/bin/bash
# prevention-tdd-tracker.sh — 재발 방지 TDD 존재 확인
# 사용: source prevention-tdd-tracker.sh
# 반환: TRACKER_MISSING (누락 건수), TRACKER_DETAILS (상세)

PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"
INDEX_FILE="$PROJECT_DIR/docs/postmortem/index.json"

[ ! -f "$INDEX_FILE" ] && { TRACKER_MISSING=0; TRACKER_DETAILS=""; return 0 2>/dev/null || exit 0; }

TRACKER_MISSING=0
TRACKER_DETAILS=""

# index.json에서 open 상태 + prevention_tdd 있는 항목 순회
while IFS= read -r ENTRY; do
    PM_ID=$(echo "$ENTRY" | jq -r '.id')
    PM_SLUG=$(echo "$ENTRY" | jq -r '.slug')
    PM_STATUS=$(echo "$ENTRY" | jq -r '.status')

    # resolved는 스킵
    [ "$PM_STATUS" = "resolved" ] && continue

    # prevention_tdd 배열 순회
    TDD_FILES=$(echo "$ENTRY" | jq -r '.preventionTdd[]? // empty' 2>/dev/null)
    [ -z "$TDD_FILES" ] && {
        TRACKER_MISSING=$((TRACKER_MISSING + 1))
        TRACKER_DETAILS="${TRACKER_DETAILS}\n  ${PM_ID} (${PM_SLUG}): prevention_tdd 미지정"
        continue
    }

    for TDD_FILE in $TDD_FILES; do
        if [ ! -f "$PROJECT_DIR/$TDD_FILE" ]; then
            TRACKER_MISSING=$((TRACKER_MISSING + 1))
            TRACKER_DETAILS="${TRACKER_DETAILS}\n  ${PM_ID}: TDD 파일 미존재 — $TDD_FILE"
        fi
    done
done < <(jq -c '.postmortems[]' "$INDEX_FILE" 2>/dev/null)

export TRACKER_MISSING TRACKER_DETAILS
