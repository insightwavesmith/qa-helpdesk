#!/bin/bash
# pdca-chain-handoff.sh v2 — Match Rate 게이트 + 위험도 분기 + curl 직접 전송
# TaskCompleted hook 체인의 마지막 (8번째)
set -uo pipefail

# ── 1. 팀원 bypass ──
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
cd "$PROJECT_DIR" || exit 0

# ── 2. CTO 팀만 대상 ──
CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"
if [ ! -f "$CONTEXT_FILE" ]; then
    exit 0
fi
TEAM=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null)
# CTO, CTO-1, CTO-2 등 CTO 접두사 매칭
[[ "$TEAM" != CTO* ]] && exit 0

# ── 3. Match Rate 파싱 ──
source "$(dirname "$0")/helpers/match-rate-parser.sh"
RATE=$(parse_match_rate "$PROJECT_DIR/docs/03-analysis")
if [ -z "$RATE" ] || [ "$RATE" -lt 0 ] 2>/dev/null; then
    RATE=0
fi

# ── 4. 95% 미만 → 차단 ──
THRESHOLD=95
if [ "$RATE" -lt "$THRESHOLD" ]; then
    echo "PDCA 체인 차단: Match Rate ${RATE}% (기준: ${THRESHOLD}%+)"
    echo "Gap 분석 문서의 Match Rate를 ${THRESHOLD}% 이상으로 달성한 후 재시도하세요."
    exit 2
fi

# ── 5. 위험도 판단 (detect-process-level.sh) ──
source "$(dirname "$0")/detect-process-level.sh"
# staged 파일 기반 레벨 판단
CHANGED_FILES=$(git diff HEAD~1 --name-only 2>/dev/null || echo "")
HAS_SRC=$(echo "$CHANGED_FILES" | grep -c "^src/" || true)

# L3 패턴 매칭
HIGH_RISK_PATTERN="(auth|middleware\.ts|migration|\.sql|payment|\.env|firebase|supabase)"
RISK_COUNT=$(echo "$CHANGED_FILES" | grep -cE "$HIGH_RISK_PATTERN" || true)
RISK_FLAGS=$(echo "$CHANGED_FILES" | grep -oE "$HIGH_RISK_PATTERN" | sort -u | tr '\n' ',' | sed 's/,$//')

if [ "$HAS_SRC" -eq 0 ]; then
    PROCESS_LEVEL="L1"
elif [ "$RISK_COUNT" -gt 0 ]; then
    PROCESS_LEVEL="L3"
else
    PROCESS_LEVEL="L2"
fi

# ── 6. 분기 결정 ──
case "$PROCESS_LEVEL" in
    L0|L1)
        TO_ROLE="MOZZI"
        CHAIN_STEP="cto_to_coo"
        AUTO_APPROVE=""
        MANUAL_REVIEW="false"
        ;;
    L2)
        TO_ROLE="PM_LEADER"
        CHAIN_STEP="cto_to_pm"
        if [ "$RISK_COUNT" -gt 0 ]; then
            AUTO_APPROVE=""
            MANUAL_REVIEW="true"
        else
            AUTO_APPROVE='"auto_approve_after_minutes": 30,'
            MANUAL_REVIEW="false"
        fi
        ;;
    L3)
        TO_ROLE="PM_LEADER"
        CHAIN_STEP="cto_to_pm"
        AUTO_APPROVE=""
        MANUAL_REVIEW="true"
        ;;
    *)
        TO_ROLE="PM_LEADER"
        CHAIN_STEP="cto_to_pm"
        AUTO_APPROVE=""
        MANUAL_REVIEW="false"
        ;;
esac

# ── 7. Payload 구성 ──
LAST_COMMIT=$(git log --oneline -1 2>/dev/null | cut -d' ' -f1)
CHANGED_COUNT=$(echo "$CHANGED_FILES" | grep -c '.' || true)
ANALYSIS_FILE=$(ls -t "$PROJECT_DIR/docs/03-analysis/"*.analysis.md 2>/dev/null | head -1)
TASK_FILE=$(jq -r '.taskFiles[0] // empty' "$CONTEXT_FILE" 2>/dev/null)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MSG_ID="chain-cto-$(date +%s)-$$"

PAYLOAD=$(cat <<EOFPAYLOAD
{
  "protocol": "bscamp-team/v1",
  "type": "COMPLETION_REPORT",
  "from_role": "CTO_LEADER",
  "to_role": "${TO_ROLE}",
  "payload": {
    "task_file": "${TASK_FILE}",
    "match_rate": ${RATE},
    "analysis_file": "${ANALYSIS_FILE}",
    "commit_hash": "${LAST_COMMIT}",
    "changed_files": ${CHANGED_COUNT},
    "summary": "개발 완료. Match Rate ${RATE}%. Level ${PROCESS_LEVEL}.",
    "chain_step": "${CHAIN_STEP}",
    "process_level": "${PROCESS_LEVEL}",
    "risk_flags": [$(echo "$RISK_FLAGS" | sed 's/[^,]*/"&"/g')],
    ${AUTO_APPROVE}
    "requires_manual_review": ${MANUAL_REVIEW}
  },
  "ts": "${TIMESTAMP}",
  "msg_id": "${MSG_ID}"
}
EOFPAYLOAD
)

# ── 8. Broker 전송 (curl 직접) ──
BROKER_URL="http://localhost:7899"

# 8-1. Health check
if ! curl -sf "${BROKER_URL}/health" >/dev/null 2>&1; then
    echo "⚠ broker 미기동. 수동 핸드오프 필요."
    echo "Match Rate ${RATE}% 통과 (${PROCESS_LEVEL}). ${TO_ROLE}에게 직접 전달하세요."
    [ "$MANUAL_REVIEW" = "true" ] && echo "  ⚠ 수동 검수 필수 (고위험/L3)"
    echo "ACTION_REQUIRED: send_message(${TO_ROLE}, COMPLETION_REPORT)"
    echo "PAYLOAD: ${PAYLOAD}"
    exit 0
fi

# 8-2. Peer 검색 (summary에서 역할 매칭)
PEERS_JSON=$(curl -sf -X POST "${BROKER_URL}/list-peers" \
    -H 'Content-Type: application/json' \
    -d "{\"scope\":\"repo\",\"cwd\":\"${PROJECT_DIR}\",\"git_root\":\"${PROJECT_DIR}\"}" \
    2>/dev/null || echo "[]")

TARGET_ID=$(echo "$PEERS_JSON" | jq -r "[.[] | select(.summary | test(\"${TO_ROLE}\"))][0].id // empty" 2>/dev/null)
MY_ID=$(echo "$PEERS_JSON" | jq -r "[.[] | select(.summary | test(\"CTO\"))][0].id // empty" 2>/dev/null)

if [ -z "$TARGET_ID" ]; then
    echo "⚠ ${TO_ROLE} peer 미발견. 수동 핸드오프 필요."
    [ "$MANUAL_REVIEW" = "true" ] && echo "  ⚠ 수동 검수 필수 (고위험/L3)"
    echo "ACTION_REQUIRED: send_message(${TO_ROLE}, COMPLETION_REPORT)"
    echo "PAYLOAD: ${PAYLOAD}"
    exit 0
fi

if [ -z "$MY_ID" ]; then
    echo "⚠ 자기 peer ID 미발견. 수동 핸드오프 필요."
    [ "$MANUAL_REVIEW" = "true" ] && echo "  ⚠ 수동 검수 필수 (고위험/L3)"
    echo "ACTION_REQUIRED: send_message(${TO_ROLE}, COMPLETION_REPORT)"
    echo "PAYLOAD: ${PAYLOAD}"
    exit 0
fi

# 8-3. 메시지 전송
ESCAPED_PAYLOAD=$(echo "$PAYLOAD" | jq -c '.' 2>/dev/null | sed 's/"/\\"/g')
SEND_RESULT=$(curl -sf -X POST "${BROKER_URL}/send-message" \
    -H 'Content-Type: application/json' \
    -d "{\"from_id\":\"${MY_ID}\",\"to_id\":\"${TARGET_ID}\",\"text\":$(echo "$PAYLOAD" | jq -c '.')}" \
    2>/dev/null || echo '{"ok":false}')

SEND_OK=$(echo "$SEND_RESULT" | jq -r '.ok // false' 2>/dev/null)

if [ "$SEND_OK" = "true" ]; then
    echo "✅ PDCA 체인 자동 전송 완료"
    echo "  Match Rate: ${RATE}%"
    echo "  Level: ${PROCESS_LEVEL}"
    echo "  대상: ${TO_ROLE} (peer: ${TARGET_ID})"
    echo "  chain_step: ${CHAIN_STEP}"
    [ "$MANUAL_REVIEW" = "true" ] && echo "  ⚠ 수동 검수 필수 (고위험/L3)"
    [ -n "$AUTO_APPROVE" ] && echo "  ⏱ 30분 타임아웃 자동 승인"
else
    echo "⚠ 메시지 전송 실패. 수동 핸드오프 필요."
    [ "$MANUAL_REVIEW" = "true" ] && echo "  ⚠ 수동 검수 필수 (고위험/L3)"
    echo "ACTION_REQUIRED: send_message(${TO_ROLE}, COMPLETION_REPORT)"
    echo "PAYLOAD: ${PAYLOAD}"
fi

exit 0
