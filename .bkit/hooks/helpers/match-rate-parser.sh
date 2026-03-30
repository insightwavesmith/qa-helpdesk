#!/bin/bash
# match-rate-parser.sh — analysis.md에서 Match Rate 숫자 추출
# source 해서 parse_match_rate 함수 사용

parse_match_rate() {
    local analysis_dir="$1"

    # 가장 최근 수정된 analysis.md 찾기 (1일 이내)
    local latest
    latest=$(find "$analysis_dir" -name "*.analysis.md" -mtime -1 2>/dev/null \
        | xargs ls -t 2>/dev/null | head -1)

    if [ -z "$latest" ]; then
        # 1일 이내 없으면 전체에서 최신
        latest=$(ls -t "$analysis_dir"/*.analysis.md 2>/dev/null | head -1)
    fi

    if [ -z "$latest" ]; then
        echo "0"
        return 1
    fi

    # "Match Rate: XX%" 또는 "Match Rate XX%" 패턴 매칭
    local rate
    rate=$(grep -iE "match.?rate.*[0-9]" "$latest" 2>/dev/null \
        | tail -1 \
        | grep -oE '[0-9]+' \
        | head -1)

    if [ -z "$rate" ]; then
        echo "0"
        return 1
    fi

    # 범위 검증 (0~100)
    if [ "$rate" -gt 100 ] 2>/dev/null; then
        echo "0"
        return 1
    fi

    echo "$rate"
    return 0
}

# 직접 실행 시 사용법 출력
if [ "${BASH_SOURCE[0]}" == "$0" ]; then
    if [ -z "$1" ]; then
        echo "Usage: match-rate-parser.sh <analysis_dir>"
        echo "Example: match-rate-parser.sh docs/03-analysis"
        exit 1
    fi
    parse_match_rate "$1"
fi
