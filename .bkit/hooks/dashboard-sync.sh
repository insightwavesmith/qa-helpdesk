#!/bin/bash
# dashboard-sync.sh V3 — broker + peer-map + team-context 병합 → state.json → GCS 업로드
# cron 또는 hook에서 호출. git 경유하지 않음.

PROJECT_DIR="/Users/smith/projects/bscamp"
RUNTIME_DIR="$PROJECT_DIR/.bkit/runtime"
BROKER_URL="${BROKER_URL:-http://localhost:7899}"
STATE_FILE="$RUNTIME_DIR/state.json"
GCS_DEST="gs://mozzi-reports/dashboard/state.json"
HASH_FILE="$RUNTIME_DIR/.state-hash"

mkdir -p "$RUNTIME_DIR" 2>/dev/null

# jq 필수
command -v jq >/dev/null 2>&1 || { echo "dashboard-sync: jq 없음, 스킵"; exit 0; }

# 1. broker peers (실시간)
PEERS=$(curl -sf -X POST "$BROKER_URL/list-peers" \
    -H 'Content-Type: application/json' \
    -d "{\"scope\":\"repo\",\"cwd\":\"$PROJECT_DIR\",\"git_root\":\"$PROJECT_DIR\"}" \
    2>/dev/null || echo "[]")
PEER_COUNT=$(echo "$PEERS" | jq 'length' 2>/dev/null || echo 0)

# 2. peer-map.json (역할 매핑)
PEER_MAP="$RUNTIME_DIR/peer-map.json"
ROLES_ONLINE="[]"
if [ -f "$PEER_MAP" ]; then
    ROLES_ONLINE=$(jq '[to_entries[] | {role: .key, peerId: .value.peerId, since: .value.registeredAt}]' "$PEER_MAP" 2>/dev/null || echo "[]")
fi

# 3. team-context (팀 구성)
TEAMS="[]"
for CTX in "$RUNTIME_DIR"/team-context-*.json; do
    [ -f "$CTX" ] || continue
    echo "$CTX" | grep -q '.archived.' && continue
    TEAM_NAME=$(jq -r '.team // empty' "$CTX" 2>/dev/null)
    FEATURE=$(jq -r '.feature // empty' "$CTX" 2>/dev/null)
    [ -n "$TEAM_NAME" ] && TEAMS=$(echo "$TEAMS" | jq --arg t "$TEAM_NAME" --arg f "$FEATURE" '. + [{team: $t, feature: $f}]')
done

# 변경 감지: 데이터(타임스탬프 제외) md5 비교
DATA_JSON=$(jq -n \
    --argjson peers "$PEER_COUNT" \
    --argjson roles "$ROLES_ONLINE" \
    --argjson teams "$TEAMS" \
    '{peerCount: $peers, rolesOnline: $roles, activeTeams: $teams}')

CURRENT_HASH=$(echo "$DATA_JSON" | md5 -q /dev/stdin 2>/dev/null || echo "$DATA_JSON" | md5sum | awk '{print $1}')
LAST_HASH=""
[ -f "$HASH_FILE" ] && LAST_HASH=$(cat "$HASH_FILE")

# 변경 없으면 스킵
if [ "$CURRENT_HASH" = "$LAST_HASH" ]; then
    exit 0
fi

# state.json 생성 (타임스탬프 포함)
echo "$DATA_JSON" | jq --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '. + {updatedAt: $ts}' > "$STATE_FILE"

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
