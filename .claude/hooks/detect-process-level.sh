#!/bin/bash
# detect-process-level.sh — PDCA 프로세스 레벨 자동 판단 헬퍼
# source로 사용: PROCESS_LEVEL 변수 설정 (L0/L1/L2/L3)
#
# L0 (응급): fix:/hotfix: 커밋 — Plan/Design 스킵
# L1 (경량): src/ 수정 없음 — Plan/Design 스킵
# L2 (표준): src/ 수정 일반 기능 — 현재와 동일
# L3 (풀):   DB/Auth/인프라 변경 — 보안 감사 + Match Rate 95%
#
# v1.0 (2026-03-28)

PROCESS_LEVEL="L2"  # 기본값

PROJECT_DIR="/Users/smith/projects/bscamp"

# L3 판단용 패턴 (DB/Auth/인프라)
L3_PATTERN="(migration|\.sql|auth\.ts|auth/|middleware\.ts|firebase|supabase|\.env)"

# --- 커밋 메시지/staged 파일 기반 판단 (Bash hook용) ---
detect_level_from_commit() {
    local COMMAND="$1"

    # fix:/hotfix: 접두사 → L0
    if echo "$COMMAND" | grep -qE "'(fix|hotfix):"; then
        PROCESS_LEVEL="L0"
        return
    fi
    if echo "$COMMAND" | grep -qE '"(fix|hotfix):'; then
        PROCESS_LEVEL="L0"
        return
    fi

    # staged 파일 확인
    local STAGED
    STAGED=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null)

    # src/ 없으면 → L1
    if [ -z "$STAGED" ] || ! echo "$STAGED" | grep -q "^src/"; then
        PROCESS_LEVEL="L1"
        return
    fi

    # DB/Auth/인프라 파일 → L3
    if echo "$STAGED" | grep -qE "$L3_PATTERN"; then
        PROCESS_LEVEL="L3"
        return
    fi

    # 나머지 → L2
    PROCESS_LEVEL="L2"
}

# --- 파일 경로 기반 판단 (Edit/Write hook용) ---
detect_level_from_file() {
    local REL_FILE="$1"

    # src/ 아니면 → L1
    if ! echo "$REL_FILE" | grep -q "^src/"; then
        PROCESS_LEVEL="L1"
        return
    fi

    # DB/Auth/인프라 파일 → L3
    if echo "$REL_FILE" | grep -qE "$L3_PATTERN"; then
        PROCESS_LEVEL="L3"
        return
    fi

    # 나머지 src/ → L2
    PROCESS_LEVEL="L2"
}
