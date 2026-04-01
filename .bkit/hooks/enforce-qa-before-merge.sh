#!/bin/bash
# Block logger: 차단(exit 2) 시 자동 기록
_bl_trap() { local e=$?; [ "$e" = "2" ] && source "$(dirname "$0")/helpers/block-logger.sh" 2>/dev/null && log_block "차단" "enforce-qa-before-merge" "${COMMAND:-unknown}" 2>/dev/null; exit $e; }
trap _bl_trap EXIT
# enforce-qa-before-merge.sh — Check(QA) 없이 커밋/푸시 차단
# PreToolUse hook (Bash): git commit/push 시 QA 검증 강제
# exit 2 = 차단 (게이트), 에러 시 기본값 = exit 2 (안전 실패)

# 안전 실패: 스크립트 에러 시 차단
trap 'echo "❌ [enforce-qa] hook 에러 발생 → 안전 차단" >&2; exit 2' ERR

# 팀원은 PDCA 게이팅 패스 (리더 전용 검증)
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

# git commit/push가 아니면 패스
if ! echo "$COMMAND" | grep -qE 'git (commit|push)'; then
    exit 0
fi

# docs/chore/config/style 커밋은 패스
if echo "$COMMAND" | grep -qE '(docs:|chore:|style:|config:|ci:)'; then
    exit 0
fi

PROJECT_DIR="/Users/smith/projects/bscamp"
MIN_ANALYSIS_LINES=20

# 프로세스 레벨 판단
source "$(dirname "$0")/detect-process-level.sh" 2>/dev/null
detect_level_from_commit "$COMMAND"

# L1(경량): QA 전체 스킵
if [ "$PROCESS_LEVEL" = "L1" ]; then
    echo "✅ [PDCA L1] QA 검증 스킵 (src/ 미수정)"
    exit 0
fi

# git push의 경우 별도 처리
if echo "$COMMAND" | grep -q 'git push'; then
    # build 마커 확인
    if [ ! -f "/tmp/agent-build-passed" ]; then
        echo "🚫 [PDCA Check 강제] build 마커(/tmp/agent-build-passed)가 없습니다." >&2
        echo "tsc + build를 먼저 통과시키세요." >&2
        exit 2
    fi
    echo "✅ [PDCA Check] push 허용: build 마커 확인됨"
    exit 0
fi

# git commit의 경우
# 스테이지된 파일에 src/ 코드가 있는지 확인
STAGED=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null)
HAS_CODE=false
if echo "$STAGED" | grep -qE '^(src/|scripts/|services/)'; then
    HAS_CODE=true
fi

# 코드 변경 없으면 패스
if [ "$HAS_CODE" = false ]; then
    exit 0
fi

ERRORS=0
MESSAGES=""

# 1. TypeScript 타입 체크 (quiet 모드)
if ! (cd "$PROJECT_DIR" && npx tsc --noEmit 2>&1); then
    MESSAGES="${MESSAGES}\n❌ TypeScript 타입 에러"
    ERRORS=$((ERRORS + 1))
fi

# 2. 빌드 체크
if ! (cd "$PROJECT_DIR" && npm run build 2>&1 1>/dev/null); then
    MESSAGES="${MESSAGES}\n❌ npm run build 실패"
    ERRORS=$((ERRORS + 1))
fi

# L0(응급): tsc + build만 통과하면 OK — 나머지 스킵
if [ "$PROCESS_LEVEL" = "L0" ]; then
    if [ "$ERRORS" -gt 0 ]; then
        echo "🚫 [PDCA L0 응급] tsc/build 실패 (${ERRORS}건):" >&2
        echo -e "$MESSAGES" >&2
        exit 2
    fi
    echo "✅ [PDCA L0 응급] tsc + build 통과 → 커밋 허용"
    exit 0
fi

# 3. lint 체크 (L2/L3)
if ! (cd "$PROJECT_DIR" && npx eslint src/ --max-warnings 999 2>&1 1>/dev/null); then
    MESSAGES="${MESSAGES}\n❌ lint 에러 있음"
    ERRORS=$((ERRORS + 1))
fi

# L3: Match Rate 95% 기준 적용
MIN_MATCH_RATE=90
if [ "$PROCESS_LEVEL" = "L3" ]; then
    MIN_MATCH_RATE=95
fi

# 4. Gap 분석 문서 확인 (존재 + 최소 줄 수 + Match Rate 포함 확인)
ANALYSIS_FILES=$(find "$PROJECT_DIR/docs/03-analysis" -name "*.analysis.md" -type f 2>/dev/null)
GAP_COUNT=$(echo "$ANALYSIS_FILES" | grep -c "." 2>/dev/null || echo 0)

if [ "${GAP_COUNT:-0}" -eq 0 ]; then
    MESSAGES="${MESSAGES}\n❌ QA 분석 문서(docs/03-analysis/)가 없습니다. Check 단계를 수행하세요."
    ERRORS=$((ERRORS + 1))
else
    # 가장 최근 분석 문서의 줄 수 + Match Rate 문자열 확인
    LATEST_ANALYSIS=$(echo "$ANALYSIS_FILES" | while read -r f; do
        [ -f "$f" ] && echo "$(stat -f %m "$f" 2>/dev/null || echo 0) $f"
    done | sort -rn | head -1 | cut -d' ' -f2-)

    if [ -n "$LATEST_ANALYSIS" ] && [ -f "$LATEST_ANALYSIS" ]; then
        A_LINES=$(wc -l < "$LATEST_ANALYSIS" | tr -d ' ')
        if [ "${A_LINES:-0}" -lt "$MIN_ANALYSIS_LINES" ]; then
            MESSAGES="${MESSAGES}\n❌ 분석 문서가 너무 짧습니다. (${A_LINES}줄, 최소 ${MIN_ANALYSIS_LINES}줄)"
            ERRORS=$((ERRORS + 1))
        fi

        if ! grep -qi 'Match Rate' "$LATEST_ANALYSIS" 2>/dev/null; then
            MESSAGES="${MESSAGES}\n❌ 분석 문서에 'Match Rate' 항목이 없습니다. Match Rate 90%+ 확인 필수."
            ERRORS=$((ERRORS + 1))
        fi

        # Match Rate 확인 (L2: 90%+, L3: 95%+)
        MATCH_RATE=$(grep -ioE 'Match Rate[: ]*([0-9]+)' "$LATEST_ANALYSIS" 2>/dev/null | grep -oE '[0-9]+' | head -1)
        if [ -n "$MATCH_RATE" ] && [ "$MATCH_RATE" -lt "$MIN_MATCH_RATE" ] 2>/dev/null; then
            MESSAGES="${MESSAGES}\n❌ [$PROCESS_LEVEL] Match Rate가 ${MIN_MATCH_RATE}% 미만입니다. (${MATCH_RATE}%)"
            ERRORS=$((ERRORS + 1))
        fi
    fi
fi

# 5. .pdca-status.json에서 check.done 확인 (새 스키마이면)
PDCA_ROOT="$PROJECT_DIR/.pdca-status.json"
if [ -f "$PDCA_ROOT" ]; then
    CHECK_STATUS=$(python3 -c "
import json, sys
try:
    with open('$PDCA_ROOT') as f:
        data = json.load(f)
    # 신 스키마: features 키 안에 feature 객체들이 있음
    features = data.get('features', data) if isinstance(data.get('features'), dict) else data
    for key, val in features.items():
        if isinstance(val, dict) and 'check' in val:
            c = val['check']
            if isinstance(c, dict) and c.get('done') == True:
                print('true')
                sys.exit(0)
    # 구 스키마: analysis 필드가 있으면 check done으로 간주
    for key, val in features.items():
        if isinstance(val, dict) and 'analysis' in val:
            print('true')
            sys.exit(0)
        if isinstance(val, dict) and val.get('status') in ('completed', 'deployed'):
            print('true')
            sys.exit(0)
    print('false')
except:
    print('unknown')
" 2>/dev/null)

    if [ "$CHECK_STATUS" = "false" ]; then
        MESSAGES="${MESSAGES}\n❌ .pdca-status.json에서 check.done이 true인 feature가 없습니다."
        ERRORS=$((ERRORS + 1))
    fi
fi

if [ "$ERRORS" -gt 0 ]; then
    echo "🚫 [PDCA Check $PROCESS_LEVEL] QA 검증 실패 (${ERRORS}건):" >&2
    echo -e "$MESSAGES" >&2
    echo "" >&2
    echo "Do 끝나면 반드시 Check(QA)를 수행하세요:" >&2
    echo "1. npx tsc --noEmit 통과" >&2
    echo "2. npm run build 통과" >&2
    echo "3. npx eslint src/ --max-warnings 999 통과" >&2
    echo "4. docs/03-analysis/에 QA 분석 문서 작성 (${MIN_ANALYSIS_LINES}줄+, Match Rate ${MIN_MATCH_RATE}%+)" >&2
    source "$PROJECT_DIR/.bkit/hooks/notify-hook.sh" 2>/dev/null && \
        notify_hook "🚫 [PDCA Check] QA 검증 실패 (${ERRORS}건)" "enforce-qa"
    exit 2
fi

echo "✅ [PDCA Check $PROCESS_LEVEL] QA 검증 통과: tsc ✓ build ✓ lint ✓ 분석문서 ${GAP_COUNT}건(Match Rate ${MIN_MATCH_RATE}%+) ✓"
exit 0
