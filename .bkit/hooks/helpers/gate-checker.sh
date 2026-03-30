#!/bin/bash
# gate-checker.sh — 체인 게이트 확인 헬퍼
# source하면 3개 함수 제공: get_required_gates, check_gate, get_next_gate
#
# 모든 판정은 기계적 체크 (LLM 판단 0)
#
# v1.0 (2026-03-31)

# --- get_required_gates: CHAIN_KEY → 게이트 목록 반환 (공백 구분) ---
get_required_gates() {
    local CHAIN_KEY="$1"

    case "$CHAIN_KEY" in
        DEV-L0) echo "commit deploy report" ;;
        DEV-L1) echo "report" ;;
        DEV-L2) echo "plan design dev commit deploy report" ;;
        DEV-L3) echo "plan design dev commit deploy manual_review report" ;;
        OPS-L0) echo "deploy report" ;;
        OPS-L1) echo "commit deploy report" ;;
        OPS-L2) echo "plan design dev commit deploy report" ;;
        MKT-L1) echo "review publish report" ;;
        MKT-L2) echo "plan review publish report" ;;
        BIZ-L1) echo "manual_review report" ;;
        BIZ-L2) echo "plan manual_review report" ;;
        *)      echo "report" ;;
    esac
}

# --- check_gate: 게이트 통과 여부 확인 (0=통과, 1=실패) ---
# $1: GATE, $2: STATUS_FILE, $3: PROJECT_DIR, $4: FEATURE_SLUG
check_gate() {
    local GATE="$1"
    local STATUS_FILE="$2"
    local PROJECT_DIR="${3:-/Users/smith/projects/bscamp}"
    local FEATURE_SLUG="$4"

    case "$GATE" in
        plan)
            [ -f "$PROJECT_DIR/docs/01-plan/features/${FEATURE_SLUG}.plan.md" ]
            return $?
            ;;
        design)
            [ -f "$PROJECT_DIR/docs/02-design/features/${FEATURE_SLUG}.design.md" ]
            return $?
            ;;
        dev)
            local ANALYSIS_FILE="$PROJECT_DIR/docs/03-analysis/${FEATURE_SLUG}.analysis.md"
            if [ ! -f "$ANALYSIS_FILE" ]; then
                return 1
            fi
            local RATE
            RATE=$(grep -iE "match.?rate.*[0-9]" "$ANALYSIS_FILE" 2>/dev/null \
                | tail -1 \
                | grep -oE '[0-9]+' \
                | head -1)
            if [ -z "$RATE" ]; then
                return 1
            fi
            local THRESHOLD
            THRESHOLD=$(jq -r '.gates.dev.threshold // 95' "$STATUS_FILE" 2>/dev/null)
            if [ -z "$THRESHOLD" ] || [ "$THRESHOLD" = "null" ]; then
                THRESHOLD=95
            fi
            [ "$RATE" -ge "$THRESHOLD" ] 2>/dev/null
            return $?
            ;;
        commit)
            local HASH
            HASH=$(jq -r '.gates.commit.hash // empty' "$STATUS_FILE" 2>/dev/null)
            [ -n "$HASH" ]
            return $?
            ;;
        deploy)
            local URL
            URL=$(jq -r '.gates.deploy.url // empty' "$STATUS_FILE" 2>/dev/null)
            if [ -z "$URL" ]; then
                return 1
            fi
            local HTTP_CODE
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "$URL" 2>/dev/null)
            [ "$HTTP_CODE" = "200" ]
            return $?
            ;;
        review)
            local DONE
            DONE=$(jq -r '.gates.review.done // false' "$STATUS_FILE" 2>/dev/null)
            [ "$DONE" = "true" ]
            return $?
            ;;
        manual_review)
            local DONE
            DONE=$(jq -r '.gates.manual_review.done // false' "$STATUS_FILE" 2>/dev/null)
            [ "$DONE" = "true" ]
            return $?
            ;;
        report)
            local DONE
            DONE=$(jq -r '.gates.report.done // false' "$STATUS_FILE" 2>/dev/null)
            [ "$DONE" = "true" ]
            return $?
            ;;
        publish)
            local URL
            URL=$(jq -r '.gates.publish.url // empty' "$STATUS_FILE" 2>/dev/null)
            [ -n "$URL" ]
            return $?
            ;;
        *)
            return 1
            ;;
    esac
}

# --- get_next_gate: 현재 게이트 → 다음 게이트 반환 ---
# $1: GATE (현재), $2: CHAIN_KEY
# 출력: 다음 게이트 이름 (마지막이면 빈 문자열)
get_next_gate() {
    local CURRENT="$1"
    local CHAIN_KEY="$2"
    local GATES
    GATES=$(get_required_gates "$CHAIN_KEY")

    local FOUND=0
    for G in $GATES; do
        if [ "$FOUND" -eq 1 ]; then
            echo "$G"
            return 0
        fi
        if [ "$G" = "$CURRENT" ]; then
            FOUND=1
        fi
    done

    # 마지막 게이트이거나 못 찾음
    echo ""
    return 0
}
