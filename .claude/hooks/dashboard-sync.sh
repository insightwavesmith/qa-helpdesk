#!/bin/bash
# dashboard-sync.sh — state.json을 GCS에 직접 업로드
# cron 또는 hook에서 호출. git 경유하지 않음.

PROJECT_DIR="/Users/smith/projects/bscamp"
STATE_FILE="$PROJECT_DIR/.claude/runtime/state.json"
GCS_DEST="gs://mozzi-reports/dashboard/state.json"
HASH_FILE="$PROJECT_DIR/.claude/runtime/.state-hash"

# state.json 없으면 스킵
[ ! -f "$STATE_FILE" ] && exit 0

# 변경 감지: md5 비교
CURRENT_HASH=$(md5 -q "$STATE_FILE" 2>/dev/null || md5sum "$STATE_FILE" | awk '{print $1}')
LAST_HASH=""
[ -f "$HASH_FILE" ] && LAST_HASH=$(cat "$HASH_FILE")

# 변경 없으면 스킵
if [ "$CURRENT_HASH" = "$LAST_HASH" ]; then
    exit 0
fi

# GCS 업로드
if gcloud storage cp "$STATE_FILE" "$GCS_DEST" \
    --cache-control="no-cache, max-age=0" \
    --content-type="application/json" 2>/dev/null; then
    echo "$CURRENT_HASH" > "$HASH_FILE"
    echo "dashboard-sync: 업로드 완료"
    exit 0
fi

echo "dashboard-sync: GCS 업로드 실패" >&2
exit 1
