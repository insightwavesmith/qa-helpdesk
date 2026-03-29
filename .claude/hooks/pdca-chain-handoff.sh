#!/bin/bash
# pdca-chain-handoff.sh — Match Rate 95% 게이트 + MCP 자동 핸드오프
# TaskCompleted hook 체인의 마지막 (8번째)

# 1. 팀원 bypass
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
cd "$PROJECT_DIR" || exit 0

# 2. CTO 팀만 대상
CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"
if [ ! -f "$CONTEXT_FILE" ]; then
    exit 0  # 팀 컨텍스트 없음 → 비대상
fi
TEAM=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null)
[ "$TEAM" != "CTO" ] && exit 0

# 3. Match Rate 파싱
source "$(dirname "$0")/helpers/match-rate-parser.sh"
RATE=$(parse_match_rate "$PROJECT_DIR/docs/03-analysis")
if [ -z "$RATE" ] || [ "$RATE" -lt 0 ] 2>/dev/null; then
    RATE=0
fi

# 4. 95% 미만 → 차단
THRESHOLD=95
if [ "$RATE" -lt "$THRESHOLD" ]; then
    echo "PDCA 체인 차단: Match Rate ${RATE}% (기준: ${THRESHOLD}%+)"
    echo "Gap 분석 문서의 Match Rate를 ${THRESHOLD}% 이상으로 달성한 후 재시도하세요."
    exit 2
fi

# 5. 95% 이상 → PM에 COMPLETION_REPORT 전송
LAST_COMMIT=$(git log --oneline -1 2>/dev/null | cut -d' ' -f1)
CHANGED=$(git diff HEAD~1 --name-only 2>/dev/null | wc -l | tr -d ' ')
ANALYSIS_FILE=$(ls -t "$PROJECT_DIR/docs/03-analysis/"*.analysis.md 2>/dev/null | head -1)
TASK_FILE=""
if [ -f "$CONTEXT_FILE" ]; then
    TASK_FILE=$(jq -r '.taskFiles[0] // empty' "$CONTEXT_FILE" 2>/dev/null)
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MSG_ID="chain-cto-$(date +%s)"

PAYLOAD=$(cat <<EOF
{
  "protocol": "bscamp-team/v1",
  "type": "COMPLETION_REPORT",
  "from_role": "CTO_LEADER",
  "to_role": "PM_LEADER",
  "payload": {
    "task_file": "${TASK_FILE}",
    "match_rate": ${RATE},
    "analysis_file": "${ANALYSIS_FILE}",
    "commit_hash": "${LAST_COMMIT}",
    "changed_files": ${CHANGED},
    "summary": "개발 완료. Match Rate ${RATE}%.",
    "chain_step": "cto_to_pm"
  },
  "ts": "${TIMESTAMP}",
  "msg_id": "${MSG_ID}"
}
EOF
)

# broker health check (실패 시 수동 fallback)
if ! curl -sf http://localhost:7899/health >/dev/null 2>&1; then
    echo "⚠ broker 미기동. MCP 메시지 전송 불가. 수동 핸드오프 필요."
    echo "Match Rate ${RATE}% 통과. PM에게 직접 전달하세요."
    exit 0  # 차단하지 않음 (수동 fallback)
fi

# PM peer ID 검색 (list_peers에서 PM_LEADER summary 매칭)
# 주의: bash에서 MCP tool 직접 호출 불가 — 리더 에이전트가 대신 실행
echo "✅ PDCA 체인 통과: Match Rate ${RATE}%"
echo "ACTION_REQUIRED: send_message(PM_LEADER, COMPLETION_REPORT)"
echo "PAYLOAD: ${PAYLOAD}"
echo ""
echo "리더가 위 payload로 PM에 send_message를 실행하세요."

# 향후: MCP CLI wrapper로 직접 전송 가능하면 자동화
exit 0
