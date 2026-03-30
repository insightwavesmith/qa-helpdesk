#!/bin/bash
# detect-work-type.sh — 업무 유형(DEV/MKT/OPS/BIZ) + 레벨(L0~L3) 자동 분류 헬퍼
# source로 사용: WORK_TYPE + PROCESS_LEVEL 변수 세팅
#
# 분류 우선순위: DEV(1) > OPS(2) > MKT(3) > BIZ(4)
# 레벨: 유형별 파일 패턴 + 커밋 메시지로 판단
#
# v1.0 (2026-03-31)

WORK_TYPE="UNKNOWN"
PROCESS_LEVEL="L1"

PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"

# 고위험 패턴 (DEV-L3 승격)
_DWT_HIGH_RISK="(auth|migration|\.sql|\.env|middleware\.ts|firebase|supabase|payment)"
# OPS-L2 승격 패턴
_DWT_OPS_L2="(\.sql|migration|schema)"

# --- 변경 파일 + 커밋 메시지 가져오기 ---
_dwt_get_context() {
    _DWT_CHANGED=$(cd "$PROJECT_DIR" && git diff HEAD~1 --name-only 2>/dev/null || git diff --cached --name-only 2>/dev/null || echo "")
    _DWT_LAST_MSG=$(cd "$PROJECT_DIR" && git log --oneline -1 2>/dev/null || echo "")
}

# --- 1차: 변경 파일 패턴으로 유형 분류 ---
_dwt_classify_type() {
    local files="$_DWT_CHANGED"

    # 파일 없으면 커밋 메시지로만 판단 (2차에서 처리)
    if [ -z "$files" ]; then
        WORK_TYPE="UNKNOWN"
        return
    fi

    # 우선순위 1: src/ → DEV
    if echo "$files" | grep -q "^src/"; then
        WORK_TYPE="DEV"
        return
    fi

    # 우선순위 2: OPS 패턴
    if echo "$files" | grep -qE "^(\.bkit/hooks/|scripts/|services/|Dockerfile|cloudbuild\.yaml)"; then
        WORK_TYPE="OPS"
        return
    fi

    # 우선순위 3: MKT 패턴
    if echo "$files" | grep -qE "^(docs/marketing/|public/reports/)"; then
        WORK_TYPE="MKT"
        return
    fi

    # 우선순위 4: BIZ 패턴
    if echo "$files" | grep -qE "^(docs/adr/|docs/strategy/)"; then
        WORK_TYPE="BIZ"
        return
    fi

    WORK_TYPE="UNKNOWN"
}

# --- 2차: 커밋 메시지 패턴으로 유형 힌트 (UNKNOWN일 때만) ---
_dwt_hint_from_message() {
    local msg="$_DWT_LAST_MSG"

    if [ "$WORK_TYPE" != "UNKNOWN" ]; then
        return
    fi

    if echo "$msg" | grep -qE "(fix|hotfix|feat|refactor|style):"; then
        WORK_TYPE="DEV"
        return
    fi

    if echo "$msg" | grep -qE "chore:"; then
        WORK_TYPE="OPS"
        return
    fi

    if echo "$msg" | grep -qE "(content|campaign):"; then
        WORK_TYPE="MKT"
        return
    fi

    if echo "$msg" | grep -qE "strategy:"; then
        WORK_TYPE="BIZ"
        return
    fi

    if echo "$msg" | grep -qE "docs:"; then
        # docs: 는 파일 경로 없이 BIZ-L1 기본
        WORK_TYPE="BIZ"
        return
    fi
}

# --- DEV 레벨 판단 ---
_dwt_level_dev() {
    local files="$_DWT_CHANGED"
    local msg="$_DWT_LAST_MSG"

    # fix:/hotfix: → L0
    if echo "$msg" | grep -qE "(fix|hotfix):"; then
        PROCESS_LEVEL="L0"
        return
    fi

    # src/ 없음 → L1
    if [ -z "$files" ] || ! echo "$files" | grep -q "^src/"; then
        PROCESS_LEVEL="L1"
        return
    fi

    # src/ 있음 + 고위험 패턴 → L3
    if echo "$files" | grep -qE "$_DWT_HIGH_RISK"; then
        PROCESS_LEVEL="L3"
        return
    fi

    # src/ 있음 + 고위험 없음 → L2
    PROCESS_LEVEL="L2"
}

# --- OPS 레벨 판단 ---
_dwt_level_ops() {
    local files="$_DWT_CHANGED"
    local file_count
    file_count=$(echo "$files" | grep -cE "^(\.bkit/hooks/|scripts/|services/|Dockerfile|cloudbuild\.yaml)" 2>/dev/null || echo "0")

    # DB 스키마, 서비스 구조 변경 → L2
    if echo "$files" | grep -qE "$_DWT_OPS_L2"; then
        PROCESS_LEVEL="L2"
        return
    fi

    # Dockerfile, cloudbuild, 스크립트 변경 → L1
    if echo "$files" | grep -qE "(Dockerfile|cloudbuild|^scripts/|^services/)"; then
        PROCESS_LEVEL="L1"
        return
    fi

    # 설정 파일 1개 변경 → L0
    if [ "$file_count" -le 1 ] 2>/dev/null; then
        PROCESS_LEVEL="L0"
        return
    fi

    PROCESS_LEVEL="L1"
}

# --- MKT 레벨 판단 ---
_dwt_level_mkt() {
    local files="$_DWT_CHANGED"
    local msg="$_DWT_LAST_MSG"
    local mkt_count
    mkt_count=$(echo "$files" | grep -cE "^(docs/marketing/|public/reports/)" 2>/dev/null || echo "0")

    # campaign: 커밋 또는 산출물 2건+ → L2
    if echo "$msg" | grep -qE "campaign:"; then
        PROCESS_LEVEL="L2"
        return
    fi

    if [ "$mkt_count" -ge 2 ] 2>/dev/null; then
        PROCESS_LEVEL="L2"
        return
    fi

    # 산출물 1건 → L1
    PROCESS_LEVEL="L1"
}

# --- BIZ 레벨 판단 ---
_dwt_level_biz() {
    local files="$_DWT_CHANGED"
    local msg="$_DWT_LAST_MSG"

    # strategy: 커밋 또는 가격/파트너십 문서 → L2
    if echo "$msg" | grep -qE "strategy:"; then
        PROCESS_LEVEL="L2"
        return
    fi

    if echo "$files" | grep -qiE "(pricing|partner|가격|파트너)"; then
        PROCESS_LEVEL="L2"
        return
    fi

    # 기본 L1
    PROCESS_LEVEL="L1"
}

# --- 메인 분류 함수 ---
detect_work_type() {
    _dwt_get_context
    _dwt_classify_type
    _dwt_hint_from_message

    case "$WORK_TYPE" in
        DEV) _dwt_level_dev ;;
        OPS) _dwt_level_ops ;;
        MKT) _dwt_level_mkt ;;
        BIZ) _dwt_level_biz ;;
        *)
            WORK_TYPE="UNKNOWN"
            PROCESS_LEVEL="L1"
            ;;
    esac
}

# source 시 자동 실행
detect_work_type
