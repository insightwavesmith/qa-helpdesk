#!/bin/bash
# approval-scope.test.sh — A-01 ~ A-12
# 화이트리스트 기반 승인 범위 테스트
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
HOOK="$PROJECT_DIR/.bkit/hooks/helpers/approval-handler.sh"

PASS=0; FAIL=0; TOTAL=12

run_test() {
    local ID="$1" DESC="$2" EXPECTED="$3"
    shift 3
    if eval "$@"; then
        if [ "$EXPECTED" = "pass" ]; then
            echo "  ✅ $ID: $DESC"; PASS=$((PASS + 1))
        else
            echo "  ❌ $ID: $DESC (expected fail, got pass)"; FAIL=$((FAIL + 1))
        fi
    else
        if [ "$EXPECTED" = "fail" ]; then
            echo "  ✅ $ID: $DESC"; PASS=$((PASS + 1))
        else
            echo "  ❌ $ID: $DESC (expected pass, got fail)"; FAIL=$((FAIL + 1))
        fi
    fi
}

# --- 헬퍼: 서브셸에서 source 후 함수 호출 ---
call_is_approval_required() {
    local FILE="$1"
    (
        PROJECT_DIR="$PROJECT_DIR"
        source "$HOOK"
        is_approval_required "$FILE"
    )
}

echo ""
echo "=== A: 팀원(IS_TEAMMATE=true) — 승인 불필요 (자유 영역) ==="

# A-01: 팀원 hook 스크립트 수정 → 승인 불필요
run_test "A-01" "팀원 .claude/hooks/*.sh → 승인 불필요" "fail" \
    'IS_TEAMMATE=true call_is_approval_required ".claude/hooks/validate-delegate.sh"'

# A-02: 팀원 .bkit/runtime/ 수정 → 승인 불필요
run_test "A-02" "팀원 .bkit/runtime/ → 승인 불필요" "fail" \
    'IS_TEAMMATE=true call_is_approval_required ".bkit/runtime/peer-map.json"'

# A-03: 팀원 .bkit/state/ 수정 → 승인 불필요
run_test "A-03" "팀원 .bkit/state/ → 승인 불필요" "fail" \
    'IS_TEAMMATE=true call_is_approval_required ".bkit/state/pdca-status.json"'

# A-04: 팀원 src/ 수정 → 승인 불필요
run_test "A-04" "팀원 src/ → 승인 불필요" "fail" \
    'IS_TEAMMATE=true call_is_approval_required "src/components/Dashboard.tsx"'

echo ""
echo "=== B: 팀원(IS_TEAMMATE=true) — 승인 필요 (차단 영역) ==="

# A-05: 팀원 settings.local.json → 차단
run_test "A-05" "팀원 .claude/settings.local.json → 승인 필요" "pass" \
    'IS_TEAMMATE=true call_is_approval_required ".claude/settings.local.json"'

# A-06: 팀원 .env → 차단
run_test "A-06" "팀원 .env → 승인 필요" "pass" \
    'IS_TEAMMATE=true call_is_approval_required ".env"'

# A-07: 팀원 .env.local → 차단
run_test "A-07" "팀원 .env.local → 승인 필요" "pass" \
    'IS_TEAMMATE=true call_is_approval_required ".env.local"'

# A-08: 팀원 migration.ts → 차단
run_test "A-08" "팀원 migration.ts → 승인 필요" "pass" \
    'IS_TEAMMATE=true call_is_approval_required "src/db/migration.ts"'

# A-09: 팀원 migrations/001.sql → 차단
run_test "A-09" "팀원 migrations/001.sql → 승인 필요" "pass" \
    'IS_TEAMMATE=true call_is_approval_required "migrations/001.sql"'

echo ""
echo "=== C: 리더/미설정 — 기존 동작 유지 ==="

# A-10: 리더(IS_TEAMMATE=false) → 기존 로직 (.claude/ 전체 차단)
run_test "A-10" "리더(IS_TEAMMATE=false) .claude/hooks → 기존 차단" "pass" \
    'IS_TEAMMATE=false call_is_approval_required ".claude/hooks/validate-delegate.sh"'

# A-11: IS_TEAMMATE 미설정 → 기존 로직 유지
run_test "A-11" "IS_TEAMMATE 미설정 .claude/hooks → 기존 차단" "pass" \
    '(unset IS_TEAMMATE; call_is_approval_required ".claude/hooks/validate-delegate.sh")'

# A-12: 차단 시 tmux 알림 포함 확인 (request_approval이 tmux send-keys 호출)
run_test "A-12" "request_approval에 tmux send-keys 포함" "pass" \
    'grep -q "tmux send-keys" "$HOOK"'

echo ""
echo "================================"
echo "결과: $PASS/$TOTAL 통과, $FAIL 실패"
echo "================================"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
