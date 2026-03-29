#!/bin/bash
# frontmatter-parser.sh — TASK YAML 프론트매터 파싱 헬퍼
# source로 사용: parse_frontmatter_field, scan_unchecked, load_team_context 함수 제공
#
# 사용법:
#   source "$(dirname "$0")/helpers/frontmatter-parser.sh" 2>/dev/null
#
# v1.0 (2026-03-28)

PROJECT_DIR="/Users/smith/projects/bscamp"

# team-context resolver (팀별 파일 분리)
source "$(dirname "${BASH_SOURCE[0]}")/team-context-resolver.sh" 2>/dev/null
resolve_team_context 2>/dev/null
CONTEXT_FILE="${TEAM_CONTEXT_FILE:-$PROJECT_DIR/.claude/runtime/team-context.json}"

# parse_frontmatter_field(file, key)
# TASK 파일의 YAML 프론트매터에서 특정 키의 값을 추출.
# 출력: stdout에 값. 키 없으면 빈 문자열.
# 제약: 단순 `key: value`만. 중첩 YAML(assignees 배열) 미지원.
parse_frontmatter_field() {
    local file="$1" key="$2"
    [ -f "$file" ] || { echo ""; return 1; }
    awk '/^---$/{n++; next} n==1{print}' "$file" | grep "^${key}:" | sed "s/^${key}: *//"
}

# scan_unchecked(file)
# 프론트매터 블록 제외한 영역에서 미완료 체크박스(- [ ]) 스캔.
# 출력: `줄번호: - [ ] 내용` 형태. 없으면 빈 출력.
# 핵심: `---` 카운터로 프론트매터(구간 n==1) 건너뜀.
scan_unchecked() {
    local file="$1"
    [ -f "$file" ] || return 0
    awk '
        /^---$/ { fm_count++; next }
        fm_count >= 2 || fm_count == 0 { print NR": "$0 }
    ' "$file" | grep '\- \[ \]'
}

# load_team_context()
# team-context.json 로드 → TEAM_NAME, TASK_FILES 쉘 변수 설정.
# 반환: 0 = 성공, 1 = 파일 없거나 team 비어있음.
load_team_context() {
    TEAM_NAME=""
    TASK_FILES=""
    if [ ! -f "$CONTEXT_FILE" ]; then return 1; fi
    TEAM_NAME=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null) || TEAM_NAME=""
    TASK_FILES=$(jq -r '.taskFiles[]?' "$CONTEXT_FILE" 2>/dev/null) || TASK_FILES=""
    [ -n "$TEAM_NAME" ] && return 0 || return 1
}
