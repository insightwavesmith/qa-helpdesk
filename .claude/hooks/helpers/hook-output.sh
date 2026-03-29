#!/bin/bash
# helpers/hook-output.sh — Hook 출력 최소화 래퍼
# source해서 사용: hook_log "상세 메시지" / hook_result "1줄 요약"
#
# 원칙: stdout에는 1줄 요약만 → 리더 컨텍스트 소모 최소화
# 상세 로그는 파일로 → 필요 시 조회

_HOOK_LOG_DIR="${PROJECT_DIR:-.}/.claude/runtime/hook-logs"
_HOOK_NAME="${HOOK_NAME:-$(basename "${BASH_SOURCE[1]:-$0}" .sh)}"
_HOOK_LOG_FILE=""

hook_init() {
    mkdir -p "$_HOOK_LOG_DIR" 2>/dev/null
    _HOOK_LOG_FILE="$_HOOK_LOG_DIR/${_HOOK_NAME}-$(date +%Y%m%d-%H%M%S).log"
}

# 상세 로그 → 파일만 (컨텍스트 소모 없음)
hook_log() {
    [ -n "$_HOOK_LOG_FILE" ] && echo "[$(date +%H:%M:%S)] $*" >> "$_HOOK_LOG_FILE"
}

# 1줄 요약 → stdout (컨텍스트에 들어감)
hook_result() {
    echo "$*"
}
