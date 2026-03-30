#!/bin/bash
# pdca-cron-watcher.sh v1 — PDCA 체인 감시자
# 5분 주기 crontab: */5 * * * * bash /Users/smith/projects/bscamp/.bkit/hooks/pdca-cron-watcher.sh
# LLM 판단 0 — 파일 존재, 숫자 비교, HTTP 200만 체크
#
# v1.0 (2026-03-31)
set -uo pipefail

PROJECT_DIR="/Users/smith/projects/bscamp"
RUNTIME_DIR="$PROJECT_DIR/.bkit/runtime"
BROKER_URL="http://localhost:7899"
SLACK_CHANNEL="C0AN7ATS4DD"
LOG_DIR="$RUNTIME_DIR/hook-logs"

# 로그 디렉토리 보장
mkdir -p "$LOG_DIR" 2>/dev/null

# jq 필수
command -v jq >/dev/null 2>&1 || exit 0

# helpers source
source "$PROJECT_DIR/.bkit/hooks/helpers/gate-checker.sh" 2>/dev/null || exit 0
source "$PROJECT_DIR/.bkit/hooks/helpers/chain-status-writer.sh" 2>/dev/null || exit 0

# ── 재시도 임계값 (기획서 섹션 11-4) ──
get_retry_threshold() {
    local GATE="$1"
    case "$GATE" in
        plan|design)    echo 6  ;;   # 6회 = 30분
        dev)            echo 5  ;;   # 5회 = 25분
        deploy)         echo 2  ;;   # 2회 = 10분
        *)              echo 3  ;;   # 기본 3회
    esac
}

# ── Slack 알림 함수 ──
send_slack() {
    local msg="$1"
    [ -z "${SLACK_BOT_TOKEN:-}" ] && return 0
    curl -sf -X POST https://slack.com/api/chat.postMessage \
      -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"channel\":\"$SLACK_CHANNEL\",\"text\":\"$msg\"}" \
      --max-time 5 2>/dev/null || true
}

# ── broker PM→CTO 직통 메시지 ──
send_broker_message() {
    local to_summary="$1" msg="$2"
    command -v curl >/dev/null 2>&1 || return 1

    local peer_list
    peer_list=$(curl -sf -X POST "$BROKER_URL/list-peers" \
      -H 'Content-Type: application/json' \
      -d '{"scope":"repo"}' --max-time 3 2>/dev/null) || return 1

    local peer_id
    peer_id=$(echo "$peer_list" | jq -r \
      "[.[] | select(.summary | test(\"${to_summary}\"))][0].id // empty" 2>/dev/null)
    [ -z "$peer_id" ] && return 1

    curl -sf -X POST "$BROKER_URL/send-message" \
      -H 'Content-Type: application/json' \
      -d "{\"to_id\":\"$peer_id\",\"text\":\"$msg\"}" \
      --max-time 3 2>/dev/null || return 1
}

# ── MOZZI webhook wake ──
send_mozzi_wake() {
    local msg="$1"
    local WAKE_URL="http://127.0.0.1:18789/hooks/wake"
    local WAKE_TOKEN="mz-hook-Kx9mP4vR7nWqZj2026"
    local WAKE_BODY
    WAKE_BODY=$(jq -nc --arg t "$msg" '{text: $t}')
    curl -s -o /dev/null -w '%{http_code}' -X POST "$WAKE_URL" \
        -H 'Content-Type: application/json' \
        -H "Authorization: Bearer ${WAKE_TOKEN}" \
        -d "$WAKE_BODY" \
        --max-time 5 2>/dev/null || echo "000"
}

# ── retry_count 증가 ──
increment_retry() {
    local STATUS_FILE="$1"
    [ ! -f "$STATUS_FILE" ] && return 1
    local TMP="${STATUS_FILE}.tmp"
    jq '.retry_count = ((.retry_count // 0) + 1) | .updated_at = (now | strftime("%Y-%m-%dT%H:%M:%S+09:00"))' \
        "$STATUS_FILE" > "$TMP" 2>/dev/null && mv "$TMP" "$STATUS_FILE"
}

# ── retry_count 리셋 ──
reset_retry() {
    local STATUS_FILE="$1"
    [ ! -f "$STATUS_FILE" ] && return 1
    local TMP="${STATUS_FILE}.tmp"
    jq '.retry_count = 0 | .updated_at = (now | strftime("%Y-%m-%dT%H:%M:%S+09:00"))' \
        "$STATUS_FILE" > "$TMP" 2>/dev/null && mv "$TMP" "$STATUS_FILE"
}

# ── 에스컬레이션 메시지 생성 ──
escalation_message() {
    local TASK="$1" GATE="$2" RETRIES="$3" CHAIN_KEY="$4"
    case "$GATE" in
        plan|design)
            echo "🚨 [에스컬레이션] ${TASK} — ${GATE} 단계 ${RETRIES}회 실패. CHAIN_KEY: ${CHAIN_KEY}. COO 확인 필요."
            ;;
        dev)
            echo "⚠ [체인] ${TASK} — Match Rate 미달 ${RETRIES}회. ${CHAIN_KEY}. pdca-iterator 필요."
            ;;
        deploy)
            echo "🔴 [롤백] ${TASK} — 배포 실패 ${RETRIES}회. ${CHAIN_KEY}. 롤백 검토 필요."
            ;;
        *)
            echo "⚠ [체인] ${TASK} — ${GATE} 단계 ${RETRIES}회 실패. ${CHAIN_KEY}."
            ;;
    esac
}

# ── 로그 기록 ──
log_event() {
    local msg="$1"
    local LOG_FILE="$LOG_DIR/cron-watcher-$(date +%Y%m%d).log"
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $msg" >> "$LOG_FILE" 2>/dev/null
}

# ═══════════════════════════════════════════
# 메인 루프: chain-status-*.json 각각 처리
# ═══════════════════════════════════════════

CHAIN_FILES=$(ls "$RUNTIME_DIR"/chain-status-*.json 2>/dev/null)
if [ -z "$CHAIN_FILES" ]; then
    exit 0
fi

for STATUS_FILE in $CHAIN_FILES; do
    # 기본 정보 읽기
    CHAIN_KEY=$(jq -r '.type // "UNKNOWN-L1"' "$STATUS_FILE" 2>/dev/null)
    CURRENT_GATE=$(jq -r '.current // empty' "$STATUS_FILE" 2>/dev/null)
    TASK_NAME=$(jq -r '.task // "unknown"' "$STATUS_FILE" 2>/dev/null)
    RETRY_COUNT=$(jq -r '.retry_count // 0' "$STATUS_FILE" 2>/dev/null)

    # current가 비어있거나 done이면 스킵
    [ -z "$CURRENT_GATE" ] && continue
    [ "$CURRENT_GATE" = "done" ] && continue

    # TASK_SLUG 추출 (파일명에서)
    TASK_SLUG=$(basename "$STATUS_FILE" .json | sed 's/^chain-status-//')

    # ── 게이트 체크 ──
    if check_gate "$CURRENT_GATE" "$STATUS_FILE" "$PROJECT_DIR" "$TASK_SLUG"; then
        # ✅ 통과 — 다음 단계로 진행
        NEXT_GATE=$(get_next_gate "$CURRENT_GATE" "$CHAIN_KEY")

        # retry_count 리셋
        reset_retry "$STATUS_FILE"

        if [ -z "$NEXT_GATE" ]; then
            # 마지막 게이트 통과 → done
            advance_chain_stage "$STATUS_FILE" "done" 2>/dev/null
            send_slack "✅ ${TASK_NAME} 완료 (${CHAIN_KEY})"
            send_mozzi_wake "[CHAIN] ${TASK_NAME} (${CHAIN_KEY}) 전체 완료" >/dev/null 2>&1
            log_event "DONE: ${TASK_NAME} (${CHAIN_KEY})"
        else
            # 다음 단계로 진행
            advance_chain_stage "$STATUS_FILE" "$NEXT_GATE" 2>/dev/null
            send_slack "[체인] ${TASK_NAME} — ${CURRENT_GATE} 완료 → ${NEXT_GATE} 시작"
            log_event "ADVANCE: ${TASK_NAME} ${CURRENT_GATE} → ${NEXT_GATE}"

            # report 단계 진입 시 MOZZI webhook wake
            if [ "$NEXT_GATE" = "report" ]; then
                send_mozzi_wake "[CHAIN] ${TASK_NAME} (${CHAIN_KEY}) report 단계 진입. 보고 준비." >/dev/null 2>&1
            fi

            # do 단계 진입 + DEV/OPS 유형 → broker로 CTO 직통 메시지
            if [ "$NEXT_GATE" = "do" ]; then
                _WORK_TYPE="${CHAIN_KEY%%-*}"  # DEV-L2 → DEV
                if [ "$_WORK_TYPE" = "DEV" ] || [ "$_WORK_TYPE" = "OPS" ]; then
                    BROKER_MSG="[CHAIN] ${TASK_NAME} Design 완료. Do 단계 시작. chain-status: .bkit/runtime/chain-status-${TASK_SLUG}.json"
                    send_broker_message "CTO_LEADER" "$BROKER_MSG" 2>/dev/null || true
                fi
            fi
        fi
    else
        # ❌ 실패 — retry_count 증가
        increment_retry "$STATUS_FILE"
        RETRY_COUNT=$(jq -r '.retry_count // 0' "$STATUS_FILE" 2>/dev/null)
        THRESHOLD=$(get_retry_threshold "$CURRENT_GATE")

        log_event "RETRY: ${TASK_NAME} ${CURRENT_GATE} (${RETRY_COUNT}/${THRESHOLD})"

        # 임계 초과 → 에스컬레이션
        if [ "$RETRY_COUNT" -gt "$THRESHOLD" ] 2>/dev/null; then
            ESC_MSG=$(escalation_message "$TASK_NAME" "$CURRENT_GATE" "$RETRY_COUNT" "$CHAIN_KEY")
            send_slack "$ESC_MSG"
            log_event "ESCALATION: ${TASK_NAME} ${CURRENT_GATE} (${RETRY_COUNT} > ${THRESHOLD})"

            # deploy 실패 에스컬레이션: MOZZI에게도 알림
            if [ "$CURRENT_GATE" = "deploy" ]; then
                send_mozzi_wake "🔴 [롤백 필요] ${TASK_NAME} 배포 ${RETRY_COUNT}회 실패. 롤백 검토." >/dev/null 2>&1
            fi
        fi
    fi
done

exit 0
