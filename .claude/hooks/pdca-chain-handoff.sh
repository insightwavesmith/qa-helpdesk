#!/bin/bash
# pdca-chain-handoff.sh v5 — Match Rate 게이트 + 위험도 분기 + PM 우회 COO 직통
# TaskCompleted hook 체인의 마지막 (6번째)
#
# v3 (2026-03-29):
#   변경1: CTO-only 필터 → 전팀 대상 + FROM_ROLE 변수
#   변경2: L0/L1 → Match Rate 스킵 → MOZZI 직접 ANALYSIS_REPORT
#   변경3: 기존 L2/L3 from_role 하드코딩 → FROM_ROLE 변수
# v4 (2026-03-30):
#   변경1: L2/L3 PM_LEADER → MOZZI 직통 (PM 검수 제거, Smith님 확정)
#   변경2: chain_step cto_to_pm → cto_to_coo
# v5 (2026-03-30):
#   변경1: broker MCP → webhook wake (MOZZI는 OpenClaw 에이전트, broker peer 아님)
#   변경2: L0/L1 + L2/L3 모두 http://127.0.0.1:18789/hooks/wake 경유
set -uo pipefail

# ── 1. 팀원 bypass ──
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
cd "$PROJECT_DIR" || exit 0

# ── 1.5 PID 역추적 자동 등록 ──
source "$(dirname "$0")/helpers/hook-self-register.sh" 2>/dev/null
auto_register_peer 2>/dev/null

# D2: jq 존재 확인
command -v jq >/dev/null 2>&1 || { echo "jq not found, skipping chain hook"; exit 0; }
# D5: runtime 디렉토리 보장
mkdir -p "$PROJECT_DIR/.bkit/runtime" 2>/dev/null

# Hook 출력 최소화 (D8-1)
source "$(dirname "$0")/helpers/hook-output.sh" 2>/dev/null && hook_init

# ── 2. 팀 컨텍스트 확인 (전팀 대상) ──
source "$(dirname "$0")/helpers/team-context-resolver.sh" 2>/dev/null
resolve_team_context 2>/dev/null
CONTEXT_FILE="${TEAM_CONTEXT_FILE:-$PROJECT_DIR/.bkit/runtime/team-context.json}"
if [ ! -f "$CONTEXT_FILE" ]; then
    # team-context 없어도 tmux 세션명으로 팀 추론
    if [ -n "${TMUX:-}" ]; then
        _SESSION=$(tmux display-message -p '#S' 2>/dev/null || true)
        case "$_SESSION" in
            sdk-cto*) TEAM="CTO" ;;
            sdk-pm*)  TEAM="PM"  ;;
            sdk-mkt*) TEAM="MKT" ;;
            *)        exit 0 ;;  # 알 수 없는 세션
        esac
    else
        exit 0  # tmux도 없고 team-context도 없음
    fi
else
    TEAM=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null || true)
fi
[ -z "$TEAM" ] && exit 0
# 팀명을 from_role로 변환 (CTO → CTO_LEADER, PM → PM_LEADER, 기타 → 그대로)
case "$TEAM" in
    CTO*) FROM_ROLE="CTO_LEADER" ;;
    PM*)  FROM_ROLE="PM_LEADER" ;;
    *)    FROM_ROLE="${TEAM}_LEADER" ;;
esac

# ── 3. 변경 파일 + 위험도 판단 ──
CHANGED_FILES=$(git diff HEAD~1 --name-only 2>/dev/null || echo "")
HAS_SRC=$(echo "$CHANGED_FILES" | grep -c "^src/" || true)

# L3 패턴 매칭
HIGH_RISK_PATTERN="(auth|middleware\.ts|migration|\.sql|payment|\.env|firebase|supabase)"
RISK_COUNT=$(echo "$CHANGED_FILES" | grep -cE "$HIGH_RISK_PATTERN" || true)
RISK_FLAGS=$(echo "$CHANGED_FILES" | grep -oE "$HIGH_RISK_PATTERN" | sort -u | tr '\n' ',' | sed 's/,$//')

# ── 3-B. L0/L1 → Match Rate 스킵 → ANALYSIS_REPORT 직접 전송 ──
LAST_MSG=$(git log --oneline -1 2>/dev/null || echo "")
IS_FIX=$(echo "$LAST_MSG" | grep -cE '^[a-f0-9]+ (fix|hotfix):' || true)

if [ "$IS_FIX" -gt 0 ]; then
    EARLY_LEVEL="L0"
elif [ "$HAS_SRC" -eq 0 ]; then
    EARLY_LEVEL="L1"
else
    EARLY_LEVEL=""
fi

if [ "$EARLY_LEVEL" = "L0" ] || [ "$EARLY_LEVEL" = "L1" ]; then
    # L0/L1: Match Rate 게이트 스킵 → MOZZI 직접 ANALYSIS_REPORT
    TASK_FILE=$(jq -r '.taskFiles[0] // empty' "$CONTEXT_FILE" 2>/dev/null || true)
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    MSG_ID="chain-l1-$(date +%s)-$$"

    # 산출물 목록 수집 (최근 60분 이내 변경된 docs/ 파일)
    DELIVERABLES=$(find "$PROJECT_DIR/docs" -name "*.md" -mmin -60 2>/dev/null | head -10 | while read -r f; do
        echo "\"$(echo "$f" | sed "s|${PROJECT_DIR}/||")\""
    done | paste -sd',' -)
    [ -z "$DELIVERABLES" ] && DELIVERABLES='"(없음)"'

    PAYLOAD=$(cat <<EOFPAYLOAD
{
  "protocol": "bscamp-team/v1",
  "type": "ANALYSIS_REPORT",
  "from_role": "${FROM_ROLE}",
  "to_role": "MOZZI",
  "payload": {
    "task_file": "${TASK_FILE}",
    "deliverables": [${DELIVERABLES}],
    "process_level": "${EARLY_LEVEL}",
    "summary": "조사/분석 완료 (${EARLY_LEVEL}). 산출물 확인 필요.",
    "chain_step": "l1_to_coo"
  },
  "ts": "${TIMESTAMP}",
  "msg_id": "${MSG_ID}"
}
EOFPAYLOAD
    )

    # Webhook wake → MOZZI (OpenClaw 에이전트, broker peer 아님)
    WAKE_URL="http://127.0.0.1:18789/hooks/wake"
    WAKE_TOKEN="mz-hook-Kx9mP4vR7nWqZj2026"
    WAKE_TEXT="[CHAIN] ${FROM_ROLE} ${EARLY_LEVEL} 완료. 산출물: ${DELIVERABLES}"
    WAKE_HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WAKE_URL" \
        -H 'Content-Type: application/json' \
        -H "Authorization: Bearer ${WAKE_TOKEN}" \
        -d "{\"text\":\"${WAKE_TEXT}\"}" \
        --max-time 5 2>/dev/null || echo "000")

    if [ "$WAKE_HTTP" -ge 200 ] && [ "$WAKE_HTTP" -lt 300 ] 2>/dev/null; then
        echo "✅ [${EARLY_LEVEL}] ANALYSIS_REPORT → MOZZI webhook 전송 완료"
        echo "  팀: ${FROM_ROLE}"
        echo "  산출물: ${DELIVERABLES}"
        exit 0
    fi

    # Fallback
    echo "⚠ [${EARLY_LEVEL}] webhook 미응답 (HTTP ${WAKE_HTTP}). 수동 보고 필요."
    echo "ACTION_REQUIRED: send_message(MOZZI, ANALYSIS_REPORT)"
    echo "PAYLOAD: ${PAYLOAD}"
    exit 0
fi

# ── 이하 기존 L2/L3 로직 (Match Rate 게이트 + COMPLETION_REPORT) ──

if [ "$HAS_SRC" -eq 0 ]; then
    PROCESS_LEVEL="L1"
elif [ "$RISK_COUNT" -gt 0 ]; then
    PROCESS_LEVEL="L3"
else
    PROCESS_LEVEL="L2"
fi

# ── 4. Match Rate 게이트 (L2/L3만 — L0/L1 bypass) ──
if [ "$PROCESS_LEVEL" = "L2" ] || [ "$PROCESS_LEVEL" = "L3" ]; then
    source "$(dirname "$0")/helpers/match-rate-parser.sh"
    RATE=$(parse_match_rate "$PROJECT_DIR/docs/03-analysis")
    if [ -z "$RATE" ] || [ "$RATE" -lt 0 ] 2>/dev/null; then
        RATE=0
    fi

    THRESHOLD=95
    if [ "$RATE" -lt "$THRESHOLD" ]; then
        echo "PDCA 체인 차단: Match Rate ${RATE}% (기준: ${THRESHOLD}%+)"
        echo "Gap 분석 문서의 Match Rate를 ${THRESHOLD}% 이상으로 달성한 후 재시도하세요."
        exit 2
    fi
else
    # L0/L1: Match Rate 불필요
    RATE=0
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
        TO_ROLE="MOZZI"
        CHAIN_STEP="cto_to_coo"
        AUTO_APPROVE=""
        MANUAL_REVIEW="false"
        ;;
    L3)
        TO_ROLE="MOZZI"
        CHAIN_STEP="cto_to_coo"
        AUTO_APPROVE=""
        MANUAL_REVIEW="true"
        ;;
    *)
        TO_ROLE="MOZZI"
        CHAIN_STEP="cto_to_coo"
        AUTO_APPROVE=""
        MANUAL_REVIEW="false"
        ;;
esac

# ── 7. Payload 구성 ──
LAST_COMMIT=$(git log --oneline -1 2>/dev/null | cut -d' ' -f1)
CHANGED_COUNT=$(echo "$CHANGED_FILES" | grep -c '.' || true)
ANALYSIS_FILE=$(ls -t "$PROJECT_DIR/docs/03-analysis/"*.analysis.md 2>/dev/null | head -1)
TASK_FILE=$(jq -r '.taskFiles[0] // empty' "$CONTEXT_FILE" 2>/dev/null || true)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MSG_ID="chain-cto-$(date +%s)-$$"

PAYLOAD=$(cat <<EOFPAYLOAD
{
  "protocol": "bscamp-team/v1",
  "type": "COMPLETION_REPORT",
  "from_role": "${FROM_ROLE}",
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

# ── 8. MOZZI(COO)는 항상 webhook wake (OpenClaw 에이전트, broker peer 아님) ──
if [ "$TO_ROLE" = "MOZZI" ]; then
    WAKE_URL="http://127.0.0.1:18789/hooks/wake"
    WAKE_TOKEN="mz-hook-Kx9mP4vR7nWqZj2026"
    WAKE_TEXT="[CHAIN] ${TEAM} ${CHAIN_STEP} 완료. Level: ${PROCESS_LEVEL}, Match Rate: ${RATE}%"
    [ "$MANUAL_REVIEW" = "true" ] && WAKE_TEXT="${WAKE_TEXT} ⚠ 수동 검수 필수"
    WAKE_HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WAKE_URL" \
        -H 'Content-Type: application/json' \
        -H "Authorization: Bearer ${WAKE_TOKEN}" \
        -d "{\"text\":\"${WAKE_TEXT}\"}" \
        --max-time 5 2>/dev/null || echo "000")
    if [ "$WAKE_HTTP" = "200" ] || [ "$WAKE_HTTP" = "204" ]; then
        echo "✅ COMPLETION_REPORT → MOZZI webhook 전송 완료"
        echo "  Level: ${PROCESS_LEVEL}, Match Rate: ${RATE}%"
        echo "  chain_step: ${CHAIN_STEP}"
        [ "$MANUAL_REVIEW" = "true" ] && echo "  ⚠ 수동 검수 필수 (고위험/L3)"
        echo "$PAYLOAD" | jq '.' > "$PROJECT_DIR/.bkit/runtime/last-completion-report.json" 2>/dev/null
        exit 0
    else
        echo "⚠ webhook 미응답 (HTTP ${WAKE_HTTP}). 수동 보고 필요."
        echo "ACTION_REQUIRED: send_message(MOZZI, COMPLETION_REPORT)"
        echo "PAYLOAD: ${PAYLOAD}"
        exit 0
    fi
fi

# ── 8-old. Broker 전송 (팀간 통신용, MOZZI 제외) ──
BROKER_URL="${BROKER_URL:-http://localhost:7899}"

# helpers 로드 (있으면 사용, 없으면 inline fallback)
HELPERS_DIR="$(dirname "$0")/helpers"
HAS_RESOLVER=false
HAS_MESSENGER=false
[ -f "$HELPERS_DIR/peer-resolver.sh" ] && { source "$HELPERS_DIR/peer-resolver.sh"; HAS_RESOLVER=true; }
[ -f "$HELPERS_DIR/chain-messenger.sh" ] && { source "$HELPERS_DIR/chain-messenger.sh"; HAS_MESSENGER=true; }

# 8-1. Health check
if ! curl -sf "${BROKER_URL}/health" >/dev/null 2>&1; then
    echo "⚠ broker 미기동. 수동 핸드오프 필요."
    echo "Match Rate ${RATE}% 통과 (${PROCESS_LEVEL}). ${TO_ROLE}에게 직접 전달하세요."
    [ "$MANUAL_REVIEW" = "true" ] && echo "  ⚠ 수동 검수 필수 (고위험/L3)"
    echo "ACTION_REQUIRED: send_message(${TO_ROLE}, COMPLETION_REPORT)"
    echo "PAYLOAD: ${PAYLOAD}"
    exit 0
fi

# 8-2. Peer 검색 (peer-resolver 우선, fallback: summary 매칭)
TARGET_ID=""
MY_ID=""

if [ "$HAS_RESOLVER" = "true" ]; then
    resolve_peer "$TO_ROLE" && TARGET_ID="$RESOLVED_PEER_ID"
    resolve_self && MY_ID="$RESOLVED_SELF_ID"
fi

# fallback: inline summary matching
if [ -z "$TARGET_ID" ] || [ -z "$MY_ID" ]; then
    PEERS_JSON=$(curl -sf -X POST "${BROKER_URL}/list-peers" \
        -H 'Content-Type: application/json' \
        -d "{\"scope\":\"repo\",\"cwd\":\"${PROJECT_DIR}\",\"git_root\":\"${PROJECT_DIR}\"}" \
        2>/dev/null || echo "[]")

    [ -z "$TARGET_ID" ] && TARGET_ID=$(echo "$PEERS_JSON" | jq -r "[.[] | select(.summary | test(\"${TO_ROLE}\"))][0].id // empty" 2>/dev/null)
    [ -z "$MY_ID" ] && MY_ID=$(echo "$PEERS_JSON" | jq -r "[.[] | select(.summary | test(\"${FROM_ROLE}\"))][0].id // empty" 2>/dev/null)
fi

if [ -z "$TARGET_ID" ]; then
    # v4: peer-roles.json fallback
    PEER_ROLES="$PROJECT_DIR/.bkit/runtime/peer-roles.json"
    if [ -f "$PEER_ROLES" ]; then
        FALLBACK_SESSION=$(jq -r ".${TO_ROLE}.session // empty" "$PEER_ROLES" 2>/dev/null)
        if [ -n "$FALLBACK_SESSION" ]; then
            # tmux send-keys로 direct 전송 시도
            tmux send-keys -t "$FALLBACK_SESSION" "" 2>/dev/null
            echo "⚠ peer summary 매칭 실패 → peer-roles.json fallback 사용"
        fi
    fi
fi

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

# 8-3. 메시지 전송 (chain-messenger 우선, fallback: direct curl)
SEND_OK="false"
if [ "$HAS_MESSENGER" = "true" ]; then
    send_chain_message "$MY_ID" "$TARGET_ID" "$PAYLOAD"
    [ "$SEND_STATUS" = "ok" ] && SEND_OK="true"
else
    SEND_RESULT=$(curl -sf -X POST "${BROKER_URL}/send-message" \
        -H 'Content-Type: application/json' \
        -d "{\"from_id\":\"${MY_ID}\",\"to_id\":\"${TARGET_ID}\",\"text\":$(echo "$PAYLOAD" | jq -c '.')}" \
        2>/dev/null || echo '{"ok":false}')
    SEND_OK=$(echo "$SEND_RESULT" | jq -r '.ok // false' 2>/dev/null)
fi

if [ "$SEND_OK" = "true" ]; then
    echo "✅ PDCA 체인 자동 전송 완료"
    echo "  Match Rate: ${RATE}%"
    echo "  Level: ${PROCESS_LEVEL}"
    echo "  대상: ${TO_ROLE} (peer: ${TARGET_ID})"
    echo "  chain_step: ${CHAIN_STEP}"
    [ "$MANUAL_REVIEW" = "true" ] && echo "  ⚠ 수동 검수 필수 (고위험/L3)"
    [ -n "$AUTO_APPROVE" ] && echo "  ⏱ 30분 타임아웃 자동 승인"
    # 보고서 저장 (PM이 검수용으로 사용)
    echo "$PAYLOAD" | jq '.' > "$PROJECT_DIR/.bkit/runtime/last-completion-report.json" 2>/dev/null
else
    echo "⚠ 메시지 전송 실패. 수동 핸드오프 필요."
    [ "$MANUAL_REVIEW" = "true" ] && echo "  ⚠ 수동 검수 필수 (고위험/L3)"
    echo "ACTION_REQUIRED: send_message(${TO_ROLE}, COMPLETION_REPORT)"
    echo "PAYLOAD: ${PAYLOAD}"
fi

exit 0
