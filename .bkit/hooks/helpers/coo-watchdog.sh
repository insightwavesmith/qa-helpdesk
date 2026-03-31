#!/bin/bash
# coo-watchdog.sh v1 — COO 게이트 타임아웃 감시
# 실행: pdca-cron-watcher.sh에서 1분 주기 호출 또는 독립 실행
# 항상 exit 0

set -uo pipefail
trap 'exit 0' ERR

PROJECT_DIR="/Users/smith/projects/bscamp"
RUNTIME_DIR="$PROJECT_DIR/.bkit/runtime"
COO_ACK_DIR="$RUNTIME_DIR/coo-ack"
SMITH_REPORT_DIR="$RUNTIME_DIR/smith-report"
DEBOUNCE_DIR="$RUNTIME_DIR/coo-watchdog-debounce"
SLACK_CHANNEL="C0AN7ATS4DD"
ACK_TIMEOUT=300    # 5분
REPORT_TIMEOUT=900 # 15분
DEBOUNCE=1800      # 30분 쿨다운

command -v jq >/dev/null 2>&1 || exit 0
mkdir -p "$DEBOUNCE_DIR"

PDCA_STATUS="$PROJECT_DIR/.bkit/state/pdca-status.json"

is_completed_feature() {
    local slug="$1"
    [ ! -f "$PDCA_STATUS" ] && return 1
    local phase
    phase=$(jq -r --arg s "$slug" '
        .features[$s].phase //
        (.features | to_entries[] | select(.key | test($s;"i")) | .value.phase) //
        "unknown"
    ' "$PDCA_STATUS" 2>/dev/null || echo "unknown")
    [ "$phase" = "completed" ]
}

send_slack_alert() {
    local task="$1" gate="$2" elapsed="$3" timeout="$4"
    local elapsed_min=$(( elapsed / 60 ))
    local elapsed_sec=$(( elapsed % 60 ))
    local msg="⚠ COO 게이트 타임아웃\nTASK: ${task}\n게이트: ${gate}\n경과: ${elapsed_min}분 ${elapsed_sec}초\n타임아웃: ${timeout}분"
    [ -z "${SLACK_BOT_TOKEN:-}" ] && return 0
    curl -sf -X POST https://slack.com/api/chat.postMessage \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"channel\":\"$SLACK_CHANNEL\",\"text\":\"$msg\"}" \
      --max-time 5 2>/dev/null || true
}

is_debounced() {
    local slug="$1" gate="$2"
    local df="$DEBOUNCE_DIR/${slug}-${gate}.ts"
    [ ! -f "$df" ] && return 1
    local ts elapsed
    ts=$(cat "$df" 2>/dev/null || echo 0)
    elapsed=$(( $(date +%s) - ts ))
    [ "$elapsed" -lt "$DEBOUNCE" ]
}

set_debounce() {
    local slug="$1" gate="$2"
    date +%s > "$DEBOUNCE_DIR/${slug}-${gate}.ts"
}

for status_file in "$RUNTIME_DIR"/chain-status-*.json "$RUNTIME_DIR"/task-state-*.json; do
    [ -f "$status_file" ] || continue

    TASK=$(jq -r '.task // .feature // "unknown"' "$status_file" 2>/dev/null || continue)
    SLUG=$(echo "$TASK" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]//g' | cut -c1-30)
    FEATURE=$(jq -r '.feature // empty' "$status_file" 2>/dev/null || echo "")
    CURRENT=$(jq -r '.current // "unknown"' "$status_file" 2>/dev/null || echo "unknown")

    # pdca-status.json에서 completed인 피처는 skip
    [ -n "$FEATURE" ] && is_completed_feature "$FEATURE" && continue
    [ -n "$SLUG" ] && is_completed_feature "$SLUG" && continue

    # 모든 게이트 done인데 coo-ack 없음 → ACK 타임아웃 체크
    if [ "$CURRENT" = "done" ] || [ "$CURRENT" = "report" ]; then
        ACK_FILE="$COO_ACK_DIR/${SLUG}.json"
        if [ ! -f "$ACK_FILE" ]; then
            UPDATED_AT=$(jq -r '.updated_at // .updatedAt // empty' "$status_file" 2>/dev/null || echo "")
            if [ -n "$UPDATED_AT" ]; then
                UPDATED_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${UPDATED_AT%%+*}" +%s 2>/dev/null || date -d "$UPDATED_AT" +%s 2>/dev/null || echo 0)
                ELAPSED=$(( $(date +%s) - UPDATED_EPOCH ))
                if [ "$ELAPSED" -gt "$ACK_TIMEOUT" ]; then
                    is_debounced "$SLUG" "ack" || {
                        send_slack_alert "$TASK" "ACK" "$ELAPSED" "5"
                        set_debounce "$SLUG" "ack"
                    }
                fi
            fi
        else
            # ACK 있음 → smith-report 체크
            SMITH_FILE="$SMITH_REPORT_DIR/${SLUG}.json"
            if [ ! -f "$SMITH_FILE" ]; then
                ACK_AT=$(jq -r '.acked_at // .ackedAt // empty' "$ACK_FILE" 2>/dev/null || echo "")
                if [ -n "$ACK_AT" ]; then
                    ACK_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${ACK_AT%%+*}" +%s 2>/dev/null || date -d "$ACK_AT" +%s 2>/dev/null || echo 0)
                    ELAPSED=$(( $(date +%s) - ACK_EPOCH ))
                    if [ "$ELAPSED" -gt "$REPORT_TIMEOUT" ]; then
                        is_debounced "$SLUG" "report" || {
                            send_slack_alert "$TASK" "Smith보고" "$ELAPSED" "15"
                            set_debounce "$SLUG" "report"
                        }
                    fi
                fi
            fi
        fi
    fi
done

exit 0
