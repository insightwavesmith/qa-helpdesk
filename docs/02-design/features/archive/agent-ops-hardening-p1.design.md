# Agent Ops Hardening P1 Design — D3+D6+D8-5

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Agent Ops Hardening P1 (D3+D6+D8-5) |
| 작성일 | 2026-03-30 |
| Plan | `docs/01-plan/features/agent-ops-hardening.plan.md` |
| 프로세스 레벨 | L2 |
| 수정 파일 | hooks 2개 + CLAUDE.md |
| 신규 파일 | error-classifier.sh + error-rulebook.md + CLAUDE-DETAIL.md + 테스트 2개 |

---

## 1. D3: 에러 분류 룰북

### 1-1. 아키텍처

```
에러 발생 (stderr/stdout/exit code)
  ↓
error-classifier.sh classify "$ERROR_TEXT"
  ↓ 패턴 매칭 (7개 룰)
  ├── 분류 코드 반환 (AUTH, RATE_LIMIT, LOCK_CONFLICT, ...)
  ├── 심각도 반환 (critical/warning/info)
  └── 대응 제안 stdout 출력 (TASK 자동 생성 안 함)
```

### 1-2. error-classifier.sh 설계

```bash
#!/bin/bash
# helpers/error-classifier.sh — 에러 패턴 자동 분류
# 사용: source error-classifier.sh && classify_error "$ERROR_TEXT"
# 반환: CLASSIFIED_CODE, CLASSIFIED_SEVERITY, CLASSIFIED_ACTION

classify_error() {
    local TEXT="$1"
    CLASSIFIED_CODE="UNKNOWN"
    CLASSIFIED_SEVERITY="info"
    CLASSIFIED_ACTION=""

    # 우선순위 순서 (먼저 매칭되면 반환)
    # R1: HTTP 에러
    if echo "$TEXT" | grep -qE 'HTTP[/ ]?429|rate.?limit|too many requests'; then
        CLASSIFIED_CODE="RATE_LIMIT"
        CLASSIFIED_SEVERITY="warning"
        CLASSIFIED_ACTION="백오프 대기 후 재시도"
        return 0
    fi
    if echo "$TEXT" | grep -qE 'HTTP[/ ]?401|unauthorized|invalid.?token'; then
        CLASSIFIED_CODE="AUTH_EXPIRED"
        CLASSIFIED_SEVERITY="critical"
        CLASSIFIED_ACTION="토큰 갱신 필요"
        return 0
    fi
    if echo "$TEXT" | grep -qE 'HTTP[/ ]?403|forbidden|access.?denied'; then
        CLASSIFIED_CODE="PERMISSION"
        CLASSIFIED_SEVERITY="critical"
        CLASSIFIED_ACTION="권한 확인 필요"
        return 0
    fi
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

    # R3: 권한
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
    if echo "$TEXT" | grep -qE 'exit code 2|exit 2|BLOCKED:|FAIL:.*quality'; then
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

    return 1  # 미분류
}
```

### 1-3. error-rulebook.md 구조

```markdown
# 에러 분류 룰북

| 코드 | 패턴 | 심각도 | 자동 대응 | 수동 대응 |
|------|------|--------|----------|----------|
| RATE_LIMIT | HTTP 429, rate limit | warning | 백오프 대기 | API 호출 빈도 조정 |
| AUTH_EXPIRED | HTTP 401, unauthorized | critical | - | 토큰 갱신 |
| PERMISSION | HTTP 403, EACCES | critical | - | 권한 확인 |
| HTTP_CLIENT_ERROR | HTTP 4xx (기타) | warning | - | 요청 파라미터 확인 |
| LOCK_CONFLICT | ENOENT lock, EBUSY | warning | lock 프로세스 확인 | 수동 해제 |
| NETWORK | ETIMEOUT, ECONNREFUSED | warning | health check | 서비스 재시작 |
| DEPENDENCY | Cannot find module | warning | npm install | 패키지 버전 확인 |
| HOOK_GATE | exit code 2, BLOCKED | info | - | 게이트 조건 해결 |
| CONTEXT_OVERFLOW | context compact | info | 대기 | 핵심 파일 재로드 |
| UNKNOWN | 미분류 | info | - | 로그 수동 분석 |
```

---

## 2. D6: 중복 보고 방지 (수신 측)

### 2-1. 현재 상태

P0에서 **발신 측** dedup 완료 (chain-messenger.sh의 `_check_dedup`/`_record_sent`).
P1에서 **수신 측** dedup 추가 — 같은 msg_id 메시지를 2번 처리하지 않음.

### 2-2. 수신 측 dedup 설계

공통 헬퍼를 만들지 않고, 각 hook에 인라인 추가 (단순 — 함수 2개, 10줄).

```bash
# 수신 측 dedup 패턴 (pm-chain-forward.sh, coo-chain-report.sh 공통)
_RECEIVED_LOG="${PROJECT_DIR}/.claude/runtime/chain-received.log"

_check_received() {
    local MSG_ID="$1"
    [ ! -f "$_RECEIVED_LOG" ] && return 1
    local NOW=$(date +%s)
    while IFS='|' read -r TS ID; do
        [ -z "$TS" ] && continue
        [ $((NOW - TS)) -lt 300 ] && [ "$ID" = "$MSG_ID" ] && return 0
    done < "$_RECEIVED_LOG"
    return 1
}

_record_received() {
    local MSG_ID="$1"
    mkdir -p "$(dirname "$_RECEIVED_LOG")" 2>/dev/null
    echo "$(date +%s)|$MSG_ID" >> "$_RECEIVED_LOG"
    # stale 정리
    local NOW=$(date +%s) TMP="${_RECEIVED_LOG}.tmp"
    while IFS='|' read -r TS ID; do
        [ -z "$TS" ] && continue
        [ $((NOW - TS)) -lt 300 ] && echo "$TS|$ID"
    done < "$_RECEIVED_LOG" > "$TMP" 2>/dev/null
    mv "$TMP" "$_RECEIVED_LOG" 2>/dev/null
}
```

### 2-3. 적용 위치

**pm-chain-forward.sh**: PAYLOAD 파싱 직후, verdict 판단 전에:
```bash
# msg_id 추출 + dedup
INCOMING_MSG_ID=$(jq -r '.msg_id // empty' "$REPORT_FILE" 2>/dev/null)
if [ -n "$INCOMING_MSG_ID" ] && _check_received "$INCOMING_MSG_ID"; then
    hook_result "SKIP: dedup msg_id=$INCOMING_MSG_ID (이미 처리됨)"
    exit 0
fi
[ -n "$INCOMING_MSG_ID" ] && _record_received "$INCOMING_MSG_ID"
```

**coo-chain-report.sh**: pm-report.json 읽기 직후, report 생성 전에:
```bash
INCOMING_MSG_ID=$(jq -r '.msg_id // empty' "$PM_REPORT" 2>/dev/null)
if [ -n "$INCOMING_MSG_ID" ] && _check_received "$INCOMING_MSG_ID"; then
    hook_result "SKIP: dedup msg_id=$INCOMING_MSG_ID (이미 처리됨)"
    exit 0
fi
[ -n "$INCOMING_MSG_ID" ] && _record_received "$INCOMING_MSG_ID"
```

---

## 3. D8-5: CLAUDE.md 슬림화

### 3-1. 현재 분석

현재 741줄. 목표 300줄 이하.

### 3-2. 분리 전략

| 현재 섹션 | 줄 수 | 조치 | 이유 |
|-----------|------|------|------|
| 세션 시작 필수 읽기 | 12 | **유지** | 핵심 |
| 절대 규칙 | 12 | **유지** | 핵심 |
| PDCA 자동 순차 진행 | 12 | **유지** | 핵심 |
| PDCA 체인 핸드오프 프로토콜 | 54 | **분리** | 상세 프로토콜은 참고용 |
| 세션 시작 복구 프로토콜 | 6 | **유지** | 짧음 |
| PDCA 프로세스 레벨 시스템 | 22 | **유지** | 핵심 |
| bkit PDCA 워크플로우 | 108 | **압축** | 체크리스트+역할표+Design필수항목+TDD+Check 통합 → 40줄 |
| 에이전트팀 운영 | 196 | **압축** | 핵심 규칙만 남기고 상세를 분리 → 60줄 |
| Plan Mode | 5 | **유지** | 짧음 |
| 토큰 최적화: 서브에이전트 위임 | 23 | **유지** | 핵심 |
| 브라우저 QA ~ Skills ~ Git Worktree ~ Hooks ~ 플러그인 | 30 | **분리** | 도구 참조는 필요 시 열람 |
| SDK 실행 시 필수 프로세스 | 46 | **분리** | 에이전트팀 환경에서는 hooks가 처리 |
| 작업 완료 기준 | 12 | **유지** | 핵심 |
| 작업 완료 보고 + 정리 | 26 | **유지** | 핵심 |
| TASK.md 작성/타입별 규칙 | 36 | **분리** | TASK 작성 시에만 필요 |
| 개발 완료 후 QA | 8 | **유지** | 짧음 |
| 프로젝트 파일 구조 | 54 | **분리** | 탐색 시에만 필요 |
| 총가치각도기 규칙 | 6 | **유지** | 짧음 |
| 기술 스택 | 8 | **유지** | 짧음 |
| 커밋 컨벤션 | 7 | **유지** | 짧음 |
| 배포 프로세스 | 22 | **분리** | 배포 시에만 필요 |
| 개발 완료 상태 업데이트 | 8 | **유지** | 짧음 |
| Vercel Preview QA | 5 | **분리** | 배포와 함께 참조 |
| 에이전트팀 작업 완료 조건 | 9 | **유지** | 핵심 |
| 모찌리포트 카테고리 규칙 | 5 | **유지** | 짧음 |

### 3-3. 분리 대상 → CLAUDE-DETAIL.md (약 440줄)

1. **PDCA 체인 핸드오프 프로토콜** (54줄) — 체인 개발 시 참조
2. **bkit PDCA 워크플로우 상세** (68줄 절감) — Design 필수항목/TDD/Check 템플릿
3. **에이전트팀 운영 상세** (136줄 절감) — 팀원 구성 패턴/파일 경계/TeammateIdle 등
4. **브라우저 QA + Skills + Worktree + Hooks + 플러그인** (30줄)
5. **SDK 실행 시 필수 프로세스** (46줄) — hooks가 이미 커버
6. **TASK.md 작성/타입별 규칙** (36줄) — TASK 작성 시에만
7. **프로젝트 파일 구조** (54줄) — 탐색 시에만
8. **배포 프로세스 + Vercel Preview** (27줄) — 배포 시에만

### 3-4. CLAUDE.md 압축 패턴

**Before** (에이전트팀 운영 196줄):
```
### 에이전트팀 정의 (40줄)
### 실행 환경 (절대 규칙) (15줄)
### 세션 관리 (10줄)
### 리더-팀원 역할 분리 (30줄)
### PDCA 기록 (20줄)
### 팀원 구성 패턴 (25줄)
### Delegate 모드 (6줄)
### Plan 승인 (6줄)
### 병렬 위임 (12줄)
### 파일 경계 (8줄)
### TeammateIdle (4줄)
### 팀원 종료 (6줄)
### Split Pane (4줄)
### 리더 메모리 보존 (15줄)
### 태스크 수행 순서 (15줄)
```

**After** (60줄 압축):
```
### 핵심 규칙 요약
- 리더: Plan/Design 작성, 팀원 배정, 검증. src/ 직접 수정 금지.
- 팀원: 리더 배정 TASK 실행, 코드 작성. .claude/ 수정 금지.
- delegate 모드 필수. Plan 승인 후 구현.
- 파일 경계 명시. 같은 파일 2명 수정 금지.
- 팀원 완료 → 즉시 TeamDelete. idle 방치 금지.
- PDCA 기록은 리더 전용 의무.

### 실행 환경
[테이블: 모델, thinking, 퍼미션 — 유지]

### 태스크 수행 순서
[11단계 체크리스트 — 유지]

상세 → CLAUDE-DETAIL.md 참조
```

### 3-5. CLAUDE.md에 남기는 참조 라인

분리된 섹션 위치에 한 줄 참조만:
```markdown
> 상세: [CLAUDE-DETAIL.md](CLAUDE-DETAIL.md) — 체인 프로토콜, 팀원 패턴, 파일 구조, 배포, SDK
```

---

## 4. 수정 파일 목록

| 파일 | 변경 | 줄 수 |
|------|------|------|
| `.claude/hooks/helpers/error-classifier.sh` | **신규** | ~80줄 |
| `docs/ops/error-rulebook.md` | **신규** | ~50줄 |
| `.claude/hooks/pm-chain-forward.sh` | received-log dedup 추가 | +25줄 |
| `.claude/hooks/coo-chain-report.sh` | received-log dedup 추가 | +25줄 |
| `CLAUDE.md` | 741줄 → ~290줄 (압축+분리) | -450줄 |
| `CLAUDE-DETAIL.md` | **신규** (분리된 상세 규칙) | ~450줄 |

---

## 5. 구현 순서

### Wave 2: TDD Red
1. `__tests__/hooks/error-classifier.test.ts` — 에러 분류 7패턴 + 미분류 + 심각도
2. `__tests__/hooks/chain-dedup-receiver.test.ts` — 수신 측 dedup 3시나리오
3. `npx vitest run` → 전부 Red 확인

### Wave 3: 코드 수정 Green
1. error-classifier.sh 생성
2. error-rulebook.md 생성
3. pm-chain-forward.sh + coo-chain-report.sh 수신 dedup 추가
4. CLAUDE.md 슬림화 + CLAUDE-DETAIL.md 분리
5. TDD Green 확인

### Wave 4: 검증
1. 전체 TDD Green (기존 + 신규)
2. Gap 분석
3. PDCA 상태 갱신

---

## 6. TDD 테스트 설계

### 6-1. error-classifier.test.ts (EC-1~EC-12)

| ID | 테스트 내용 | 타입 |
|----|-----------|------|
| EC-1 | "HTTP 429 Too Many Requests" → RATE_LIMIT | function |
| EC-2 | "HTTP 401 Unauthorized" → AUTH_EXPIRED | function |
| EC-3 | "HTTP 403 Forbidden" → PERMISSION | function |
| EC-4 | "HTTP 400 Bad Request" → HTTP_CLIENT_ERROR | function |
| EC-5 | "ENOENT lock file" → LOCK_CONFLICT | function |
| EC-6 | "Permission denied" → PERMISSION | function |
| EC-7 | "ECONNREFUSED" → NETWORK | function |
| EC-8 | "Cannot find module 'foo'" → DEPENDENCY | function |
| EC-9 | "exit code 2" → HOOK_GATE | function |
| EC-10 | "context auto-compact triggered" → CONTEXT_OVERFLOW | function |
| EC-11 | "something random" → UNKNOWN (return 1) | function |
| EC-12 | 심각도 검증: AUTH_EXPIRED=critical, RATE_LIMIT=warning, HOOK_GATE=info | function |

### 6-2. chain-dedup-receiver.test.ts (CDR-1~CDR-6)

| ID | 테스트 내용 | 타입 |
|----|-----------|------|
| CDR-1 | pm-chain-forward — 동일 msg_id 2회 → 두 번째 "SKIP: dedup" | hook |
| CDR-2 | pm-chain-forward — 다른 msg_id → 정상 처리 | hook |
| CDR-3 | pm-chain-forward — msg_id 없으면 dedup 안 함 (정상 처리) | hook |
| CDR-4 | coo-chain-report — 동일 msg_id 2회 → 두 번째 "SKIP: dedup" | hook |
| CDR-5 | coo-chain-report — 다른 msg_id → 정상 처리 | hook |
| CDR-6 | chain-received.log stale 항목(>5분) 자동 정리 | function |
