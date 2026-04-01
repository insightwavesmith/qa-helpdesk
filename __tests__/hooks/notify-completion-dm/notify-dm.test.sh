#!/bin/bash
# notify-dm.test.sh — B-01 ~ B-12
# notify-completion.sh Slack DM 3중 전송 TDD
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
HOOK="$PROJECT_DIR/.bkit/hooks/notify-completion.sh"

PASS=0; FAIL=0; TOTAL=12

# 임시 디렉토리 (에러 로그용)
TMP_DIR=$(mktemp -d)
TMP_RUNTIME="$TMP_DIR/.bkit/runtime"
mkdir -p "$TMP_RUNTIME"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

run_test() {
    local ID="$1" DESC="$2" EXPECTED="$3"
    shift 3
    if eval "$@"; then
        if [ "$EXPECTED" = "pass" ]; then
            echo "  ✅ $ID: $DESC"; PASS=$((PASS+1))
        else
            echo "  ❌ $ID: $DESC (expected fail, got pass)"; FAIL=$((FAIL+1))
        fi
    else
        if [ "$EXPECTED" = "fail" ]; then
            echo "  ✅ $ID: $DESC"; PASS=$((PASS+1))
        else
            echo "  ❌ $ID: $DESC (expected pass, got fail)"; FAIL=$((FAIL+1))
        fi
    fi
}

# --- 헬퍼: DRY_RUN 모드로 hook 실행, stdout를 변수에 캡처 ---
# SIGPIPE 방지: grep -q + pipefail 조합 회피를 위해 캡처 후 grep
capture_hook() {
    local task_name="${1:-테스트TASK}"
    local task_level="${2:-L2}"
    local match_rate="${3:-95}"
    local commit_hash="${4:-abc1234}"
    local token="${5:-xoxb-test-token}"

    local INPUT="{\"title\":\"$task_name\"}"

    env \
        DRY_RUN=true \
        SLACK_BOT_TOKEN="$token" \
        TASK_NAME="$task_name" \
        TASK_LEVEL="$task_level" \
        MATCH_RATE="$match_rate" \
        COMMIT_HASH="$commit_hash" \
        PROJECT_DIR="$TMP_DIR" \
        bash -c "echo '$INPUT' | '$HOOK'" 2>/dev/null || true
}

echo ""
echo "=== B: notify-completion.sh Slack DM 3중 전송 ==="

# B-01: Smith님 DM 전송 시도 — D09V1NX98SK 포함
run_test "B-01" "Smith님 DM 전송 시도 (D09V1NX98SK)" "pass" \
    'OUT=$(capture_hook "배포완료" "L2" "95" "abc1234"); echo "$OUT" | grep -q "D09V1NX98SK"'

# B-02: DM에 TASK명 포함
run_test "B-02" "DM에 TASK명 포함" "pass" \
    'OUT=$(capture_hook "쿼리빌더수정" "L2" "95" "abc1234"); echo "$OUT" | grep -q "쿼리빌더수정"'

# B-03: DM에 Match Rate 포함
run_test "B-03" "DM에 Match Rate 포함" "pass" \
    'OUT=$(capture_hook "테스트" "L2" "97" "abc1234"); echo "$OUT" | grep -q "97"'

# B-04: DM에 레벨 포함
run_test "B-04" "DM에 레벨 포함" "pass" \
    'OUT=$(capture_hook "테스트" "L3" "95" "abc1234"); echo "$OUT" | grep -q "L3"'

# B-05: DM에 커밋 해시 포함
run_test "B-05" "DM에 커밋 해시 포함" "pass" \
    'OUT=$(capture_hook "테스트" "L2" "95" "def7890"); echo "$OUT" | grep -q "def7890"'

# B-06: 3중 전송 (채널+DM+webhook) — chat.postMessage 2회 + webhook 1회
run_test "B-06" "3중 전송 (chat.postMessage 2회 + webhook)" "pass" \
    'OUT=$(capture_hook "테스트" "L2" "95" "abc1234"); [ $(echo "$OUT" | grep -c "chat.postMessage") -ge 2 ]'

# B-07: DM 실패해도 exit 0
run_test "B-07" "DM 실패해도 exit 0" "pass" \
    'env DRY_RUN=true DRY_RUN_DM_FAIL=true SLACK_BOT_TOKEN="xoxb-test" TASK_NAME="테스트" TASK_LEVEL="L2" MATCH_RATE="95" COMMIT_HASH="abc1234" PROJECT_DIR="$TMP_DIR" bash -c "echo {} | \"$HOOK\"" >/dev/null 2>&1'

# B-08: TOKEN 미설정 시 스킵 + exit 0
run_test "B-08" "TOKEN 미설정 시 스킵 + exit 0" "pass" \
    'OUT=$(env DRY_RUN=true SLACK_BOT_TOKEN="" TASK_NAME="테스트" PROJECT_DIR="$TMP_DIR" bash -c "echo {} | \"$HOOK\"" 2>/dev/null || true); [ $? -eq 0 ] && ! echo "$OUT" | grep -q "chat.postMessage"'

# B-09: DM 실패 시 에러 로그 — error-log.json에 target:"smith-dm" 기록
run_test "B-09" "DM 실패 시 에러 로그 target:smith-dm" "pass" \
    '> "$TMP_RUNTIME/error-log.json"; env DRY_RUN=true DRY_RUN_DM_FAIL=true SLACK_BOT_TOKEN="xoxb-test" TASK_NAME="테스트" TASK_LEVEL="L2" MATCH_RATE="95" COMMIT_HASH="abc1234" PROJECT_DIR="$TMP_DIR" bash -c "echo {} | \"$HOOK\"" >/dev/null 2>&1; grep -q "smith-dm" "$TMP_RUNTIME/error-log.json" 2>/dev/null'

# B-10: 채널 성공 + DM 실패 부분 로그
run_test "B-10" "채널 성공 + DM 실패 부분 로그" "pass" \
    'OUT=$(env DRY_RUN=true DRY_RUN_DM_FAIL=true SLACK_BOT_TOKEN="xoxb-test" TASK_NAME="테스트" TASK_LEVEL="L2" MATCH_RATE="95" COMMIT_HASH="abc1234" PROJECT_DIR="$TMP_DIR" bash -c "echo {} | \"$HOOK\"" 2>/dev/null || true); echo "$OUT" | grep -q "channel:ok" && echo "$OUT" | grep -q "dm:failed"'

# B-11: L0 긴급 표시
run_test "B-11" "L0 긴급 표시" "pass" \
    'OUT=$(capture_hook "핫픽스" "L0" "95" "abc1234"); echo "$OUT" | grep -qE "긴급|URGENT"'

# B-12: 전체 실패해도 exit 0
run_test "B-12" "전체 실패해도 exit 0" "pass" \
    'env DRY_RUN=true DRY_RUN_CHANNEL_FAIL=true DRY_RUN_DM_FAIL=true DRY_RUN_WEBHOOK_FAIL=true SLACK_BOT_TOKEN="xoxb-test" TASK_NAME="테스트" TASK_LEVEL="L2" MATCH_RATE="95" COMMIT_HASH="abc1234" PROJECT_DIR="$TMP_DIR" bash -c "echo {} | \"$HOOK\"" >/dev/null 2>&1'

echo ""
echo "================================"
echo "결과: $PASS/$TOTAL 통과, $FAIL 실패"
echo "================================"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
