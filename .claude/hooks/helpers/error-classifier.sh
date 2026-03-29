#!/bin/bash
# helpers/error-classifier.sh — 에러 패턴 자동 분류
# 사용: source error-classifier.sh && classify_error "$ERROR_TEXT"
# 반환: CLASSIFIED_CODE, CLASSIFIED_SEVERITY, CLASSIFIED_ACTION
#
# 분류만 자동. TASK 자동 생성 안 함 (stdout 제안만).
# 룰북: docs/ops/error-rulebook.md

classify_error() {
    local TEXT="$1"
    CLASSIFIED_CODE="UNKNOWN"
    CLASSIFIED_SEVERITY="info"
    CLASSIFIED_ACTION=""

    # R1: HTTP 429 Rate Limit (우선 — 429가 401보다 먼저)
    if echo "$TEXT" | grep -qiE 'HTTP[/ ]?429|rate.?limit|too many requests'; then
        CLASSIFIED_CODE="RATE_LIMIT"
        CLASSIFIED_SEVERITY="warning"
        CLASSIFIED_ACTION="백오프 대기 후 재시도"
        return 0
    fi

    # R1: HTTP 401 Auth
    if echo "$TEXT" | grep -qiE 'HTTP[/ ]?401|unauthorized|invalid.?token'; then
        CLASSIFIED_CODE="AUTH_EXPIRED"
        CLASSIFIED_SEVERITY="critical"
        CLASSIFIED_ACTION="토큰 갱신 필요"
        return 0
    fi

    # R1: HTTP 403 Permission
    if echo "$TEXT" | grep -qiE 'HTTP[/ ]?403|forbidden'; then
        CLASSIFIED_CODE="PERMISSION"
        CLASSIFIED_SEVERITY="critical"
        CLASSIFIED_ACTION="권한 확인 필요"
        return 0
    fi

    # R1: HTTP 4xx 기타
    if echo "$TEXT" | grep -qE 'HTTP[/ ]?4[0-9]{2}'; then
        CLASSIFIED_CODE="HTTP_CLIENT_ERROR"
        CLASSIFIED_SEVERITY="warning"
        CLASSIFIED_ACTION="요청 파라미터 확인"
        return 0
    fi

    # R2: Lock 충돌
    if echo "$TEXT" | grep -qiE 'ENOENT.*lock|lock.?file|resource.?busy|EBUSY'; then
        CLASSIFIED_CODE="LOCK_CONFLICT"
        CLASSIFIED_SEVERITY="warning"
        CLASSIFIED_ACTION="lock 소유 프로세스 확인"
        return 0
    fi

    # R3: 권한 (파일 시스템)
    if echo "$TEXT" | grep -qiE 'permission.?denied|EACCES'; then
        CLASSIFIED_CODE="PERMISSION"
        CLASSIFIED_SEVERITY="critical"
        CLASSIFIED_ACTION="파일 권한 + 실행자 확인"
        return 0
    fi

    # R4: 네트워크
    if echo "$TEXT" | grep -qiE 'ETIMEOUT|ECONNREFUSED|ECONNRESET|connection.?refused'; then
        CLASSIFIED_CODE="NETWORK"
        CLASSIFIED_SEVERITY="warning"
        CLASSIFIED_ACTION="서비스 health check → 재시작"
        return 0
    fi

    # R5: 의존성
    if echo "$TEXT" | grep -qiE 'Cannot find module|MODULE_NOT_FOUND|ERR_MODULE'; then
        CLASSIFIED_CODE="DEPENDENCY"
        CLASSIFIED_SEVERITY="warning"
        CLASSIFIED_ACTION="npm install 실행"
        return 0
    fi

    # R6: Hook 게이트 차단
    if echo "$TEXT" | grep -qiE 'exit code 2|exit 2|BLOCKED:|FAIL:.*quality'; then
        CLASSIFIED_CODE="HOOK_GATE"
        CLASSIFIED_SEVERITY="info"
        CLASSIFIED_ACTION="차단 사유 확인 후 조건 해결"
        return 0
    fi

    # R7: 컨텍스트 오버플로
    if echo "$TEXT" | grep -qiE 'context.*compact|auto.?compact|token.*limit|context.*full'; then
        CLASSIFIED_CODE="CONTEXT_OVERFLOW"
        CLASSIFIED_SEVERITY="info"
        CLASSIFIED_ACTION="compaction 완료 대기 + 핵심 파일 재로드"
        return 0
    fi

    # 미분류
    return 1
}
