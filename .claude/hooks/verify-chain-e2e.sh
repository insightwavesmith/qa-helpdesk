#!/bin/bash
# verify-chain-e2e.sh — 체인 실전 e2e 결과 자동 검증
# 사용: bash verify-chain-e2e.sh [e2e-1|e2e-2|e2e-3]

PROJECT_DIR="/Users/smith/projects/bscamp"
RUNTIME="$PROJECT_DIR/.claude/runtime"
PASS=0; FAIL=0

check() {
    local DESC="$1"; local COND="$2"
    if eval "$COND"; then
        echo "✅ $DESC"; PASS=$((PASS+1))
    else
        echo "❌ $DESC"; FAIL=$((FAIL+1))
    fi
}

case "${1:-e2e-1}" in
e2e-1)
    echo "=== E2E-1: 단일 팀 풀 체인 ==="
    check "last-completion-report.json 존재" "[ -f '$RUNTIME/last-completion-report.json' ]"
    check "chain-sent.log에 기록 있음" "[ -f '$RUNTIME/chain-sent.log' ] && [ -s '$RUNTIME/chain-sent.log' ]"
    check "PM 세션 기동 확인" "tmux has-session -t sdk-pm 2>/dev/null"
    check "COO 세션 기동 확인" "tmux has-session -t hermes 2>/dev/null"
    check "broker 기동 확인" "curl -sf http://localhost:7899/health >/dev/null 2>&1"
    PM_MSGS=$(curl -sf -X POST http://localhost:7899/check-messages \
        -H 'Content-Type: application/json' \
        -d '{"peer_id":"pm-leader"}' 2>/dev/null | jq -r '.messages | length' 2>/dev/null || echo 0)
    check "PM에 메시지 도착 (${PM_MSGS}건)" "[ '${PM_MSGS}' -gt 0 ]"
    ;;
e2e-2)
    echo "=== E2E-2: Match Rate 미달 루프 ==="
    check "분석 문서 존재" "ls $PROJECT_DIR/docs/03-analysis/*.analysis.md >/dev/null 2>&1"
    check "chain-sent.log 기록" "[ -s '$RUNTIME/chain-sent.log' ]"
    ;;
e2e-3)
    echo "=== E2E-3: 병렬 팀 독립 체인 ==="
    check "CTO-1 context 유지" "ls $RUNTIME/team-context-sdk-cto*.json >/dev/null 2>&1"
    LINES=$(wc -l < "$RUNTIME/chain-sent.log" 2>/dev/null || echo 0)
    check "chain-sent.log에 2건+ 기록" "[ '$LINES' -ge 2 ]"
    ;;
esac

echo ""
echo "결과: ✅ $PASS / ❌ $FAIL"
[ "$FAIL" -eq 0 ] && echo "전체 통과" || echo "실패 항목 확인 필요"
exit "$FAIL"
