# Chain Bulletproof TDD (체인 자동화 방탄 테스트) 설계서

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | Chain Bulletproof TDD (체인 자동화 방탄 테스트) |
| 작성일 | 2026-03-30 |
| 선행 Design | docs/02-design/features/chain-context-fix.design.md |
| 선행 구현 커밋 | e4c41dc (Chain Context Fix — 병렬 팀 분리 + 아카이빙 근본 수정) |
| 프로세스 레벨 | L2 |
| TASK | .claude/tasks/TASK-CHAIN-BULLETPROOF.md |

| 관점 | 내용 |
|------|------|
| 문제 | 체인 근본 수정(e4c41dc) 완료했으나 실전 검증 미완. 32개 엣지케이스 미커버. |
| 해결 | A1~F4 전 상황 TDD 커버 + 기존 374건 회귀 보장 + Smith님 실전 체크리스트 |
| 기능/UX 효과 | "어떤 상황이든 체인이 깨지지 않는다"를 테스트로 증명 |
| 핵심 가치 | 체인 자동화 신뢰도 100%. 재발 방지. |

---

## 1. 현재 상태 분석

### 1.1 관여 Hook 전체 목록

| Hook 스크립트 | 이벤트 | 역할 |
|---------------|--------|------|
| `pdca-chain-handoff.sh` (v3) | TaskCompleted | CTO 완료 → PM/COO 체인 발동 |
| `pm-chain-forward.sh` | TaskCompleted | PM 검수 → COO/CTO 전달 |
| `coo-chain-report.sh` | TaskCompleted | COO 보고 → webhook wake |
| `validate-pdca-before-teamdelete.sh` | PreToolUse(TeamDelete) | TeamDelete 전 context 아카이빙 |
| `validate-delegate.sh` | PreToolUse(Edit/Write) | requireApproval 게이트 |

### 1.2 관여 Helper 전체 목록

| Helper | 역할 |
|--------|------|
| `team-context-resolver.sh` | context 파일 경로 5단계 해석 |
| `peer-resolver.sh` | broker peer ID 3단계 검색 |
| `chain-messenger.sh` | 메시지 전송 + retry 3회 + dedup 5분 TTL |
| `match-rate-parser.sh` | Match Rate 숫자 추출 |
| `approval-handler.sh` | 승인 파일 관리 (pending/granted, TTL 300초) |
| `hook-output.sh` | stdout 최소화 + 파일 로그 |

### 1.3 기존 테스트 현황

| 테스트 파일 | 케이스 수 | 커버 범위 |
|-------------|-----------|----------|
| `pdca-chain-handoff.test.ts` | 25건 (PC-1~25) | match-rate 파싱, 핸드오프 조건, payload 구조 |
| `pdca-chain-handoff-v2.test.ts` | 23건 (RV-1~23) | v3 위험도 분기, curl 전송, 호환성 |
| `chain-e2e.test.ts` | 38건 (PR/CM/CH/PF/CR/FB) | peer-resolver, messenger, 통합, PM/COO, 반려 |
| `chain-e2e-realworld.test.ts` | 20건 (RW-1~20) | 병렬 팀, TeamDelete 타이밍, 풀플로우, approval |
| `team-context.test.ts` | 8건 (TC-1~8) | context 구조, 팀 식별 |
| **합계** | **114건** | — |

> 참고: TASK에서 "374건" 언급은 전체 프로젝트 테스트 포함. 체인 관련은 114건.

### 1.4 기존 테스트의 Gap (COO 상황 vs 기존 커버리지)

| 상황 ID | 기존 커버 | Gap |
|---------|----------|-----|
| A1 (context 파일 없음) | ✅ RW-6, PC-15 | — |
| A2 (빈 JSON `{}`) | ❌ | **신규 필요** |
| A3 (team 필드 없음) | ❌ | **신규 필요** |
| A4 (taskFiles 빈 배열) | ✅ TC-7 | — |
| A5 (3팀 동시 context) | ✅ RW-1~2 | — |
| A6 (한 팀 삭제→다른 팀 무영향) | ✅ RW-3~4 | — |
| A7 (아카이브만 존재) | ✅ RW-5 | — |
| A8 (레거시 fallback) | ✅ RW-20 | — |
| A9 (JSON 파싱 에러) | ❌ | **신규 필요** |
| B1 (TeamDelete→즉시 TaskCompleted) | ✅ RW-5 | — |
| B2 (TeamDelete 없이 단독) | ✅ PC-15~16 | — |
| B3 (TeamDelete 2번 연속) | ❌ | **신규 필요** |
| B4 (3팀 동시 TeamDelete) | ❌ | **신규 필요** |
| C1 (CTO→PM 자동 전달) | ✅ CH-1~4 | — |
| C2 (PM pass→COO) | ✅ PF-1, RW-8 | — |
| C3 (PM reject→CTO) | ✅ PF-2, RW-9 | — |
| C4 (COO→webhook wake) | ✅ CR-2, RW-10 | — |
| C5 (broker 미기동) | ✅ CM-2, CH-5 | — |
| C6 (webhook wake도 실패) | ✅ CR-3 | — |
| C7 (peer 못 찾음) | ✅ PR-3, CH-5 | — |
| C8 (중복 메시지 dedup) | ✅ RW-17 | — |
| D1 (tmux 없음) | ✅ RW-19 | — |
| D2 (jq 미설치) | ❌ | **신규 필요** |
| D3 (hook 5초+ 타임아웃) | ❌ | **신규 필요** |
| D4 (.pdca-status.json 없음) | ❌ | **신규 필요** |
| D5 (runtime 디렉토리 없음) | ❌ | **신규 필요** |
| E1 (.claude/ 수정→승인 요청) | ✅ RW-11~12 | — |
| E2 (승인→재개→완료→체인) | ✅ RW-13 | — |
| E3 (거부→exit 2→리더 이어받기) | ✅ RW-14 | — |
| E4 (타임아웃→exit 2) | ✅ RW-15 | — |
| E5 (requireApproval API 실패) | ❌ | **신규 필요** |
| F1 (hook 크래시 exit 1) | ❌ | **신규 필요** |
| F2 (git conflict 상태) | ❌ | **신규 필요** |
| F3 (아카이브 자동 정리) | ❌ | **신규 필요** |
| F4 (동시 2개 TaskCompleted) | ❌ | **신규 필요** |

**Gap 합계: 13건 신규 필요** (기존 커버 19건)

---

## 2. 상황별 상세 설계 (A1~F4)

### 2.A — Context 관련 (9건)

#### A1: team-context 파일이 아예 없음
- **관여 hook**: `pdca-chain-handoff.sh` → `team-context-resolver.sh`
- **현재 동작**: resolver 5단계 모두 실패 → `TEAM_CONTEXT_FILE=""` → handoff에서 `[ ! -f "$CONTEXT_FILE" ]` → exit 0
- **기대 동작**: silent exit 0, 로그 없음, 체인 안 탐 (정상)
- **기존 테스트**: ✅ RW-6, PC-15
- **TDD assertion**: `exit code === 0`, stdout에 `COMPLETION_REPORT` 없음

#### A2: team-context 파일 내용이 빈 JSON `{}`
- **관여 hook**: `pdca-chain-handoff.sh` L35~40 (`.team` 필드 추출)
- **현재 동작**: `jq -r '.team // empty'` → 빈 문자열 → `[ -z "$TEAM" ]` → exit 0
- **기대 동작**: exit 0 + 로그 "team 필드 없음"
- **기존 테스트**: ❌ Gap
- **TDD assertion**: `exit code === 0`, stdout에 "team" 관련 경고 또는 silent exit
- **수정 제안**: 현재 로직으로 정상 처리됨. 테스트만 추가.

#### A3: team-context에 team 필드 없음
- **관여 hook**: 동일 (A2와 같은 분기)
- **현재 동작**: `.team` 없으면 A2와 동일하게 빈 문자열 → exit 0
- **기대 동작**: exit 0 + 로그
- **기존 테스트**: ❌ Gap
- **TDD assertion**: `exit code === 0`
- **수정 제안**: A2와 동일. 별도 테스트로 `{"session":"test"}` (team 없음) 케이스 추가.

#### A4: team-context에 taskFiles 빈 배열
- **관여 hook**: `pdca-chain-handoff.sh` (taskFiles는 payload에 포함되나 체인 발동 조건에는 미사용)
- **현재 동작**: `TEAM` 필드 있으면 정상 진행. taskFiles 빈 배열은 비차단.
- **기대 동작**: exit 0 + 체인 정상 발동 (taskFiles는 참고용)
- **기존 테스트**: ✅ TC-7
- **TDD assertion**: `exit code === 0`, payload에 `taskFiles: []` 포함

#### A5: 3팀 동시 context 존재
- **관여 hook**: `team-context-resolver.sh` (세션별 파일 분리)
- **현재 동작**: `team-context-sdk-cto.json`, `team-context-sdk-pm.json`, `team-context-sdk-cto-2.json` 각각 독립 존재. resolver는 현재 세션의 파일만 반환.
- **기대 동작**: 각 팀 독립 체인, 간섭 0
- **기존 테스트**: ✅ RW-1~2
- **TDD assertion**: 3개 context 파일 동시 존재 상태에서 각각 독립 resolve

#### A6: 한 팀 TeamDelete → 다른 팀 context 영향
- **관여 hook**: `validate-pdca-before-teamdelete.sh` (mv → .archived)
- **현재 동작**: `team-context-sdk-cto.json` → `team-context-sdk-cto.archived.json`. 다른 팀 파일은 touch 안 함.
- **기대 동작**: 영향 0
- **기존 테스트**: ✅ RW-3~4
- **TDD assertion**: 삭제 대상 외 파일 존재 + 내용 변경 없음

#### A7: 아카이브 파일만 존재 (활성 없음)
- **관여 hook**: `team-context-resolver.sh` 5단계 (아카이브 fallback)
- **현재 동작**: `*.archived.json` 패턴으로 glob → 최신 아카이브 선택
- **기대 동작**: 아카이브에서 읽어 체인 발동
- **기존 테스트**: ✅ RW-5
- **TDD assertion**: `TEAM_CONTEXT_FILE`이 `.archived.json` 경로, 체인 정상 발동

#### A8: 레거시 team-context.json만 존재
- **관여 hook**: `team-context-resolver.sh` 4단계 (레거시 fallback)
- **현재 동작**: 세션별 파일 없고 `team-context.json` 존재 → 레거시 파일 사용
- **기대 동작**: 레거시로 읽기 + 체인 정상 발동
- **기존 테스트**: ✅ RW-20
- **TDD assertion**: `TEAM_CONTEXT_FILE`이 `team-context.json` 경로

#### A9: context 파일 JSON 파싱 에러
- **관여 hook**: `pdca-chain-handoff.sh` (`jq` 파싱)
- **현재 동작**: `jq -r '.team // empty' < "$CONTEXT_FILE"` → jq 에러 → `TEAM=""` → exit 0. **단, `set -e`가 있으면 jq 에러로 스크립트 종료 가능.**
- **기대 동작**: exit 0 + 에러 로그, 체인 블로킹 안 함
- **기존 테스트**: ❌ Gap
- **TDD assertion**: 깨진 JSON 입력 → `exit code === 0`
- **수정 제안**: `jq ... 2>/dev/null || true` 패턴으로 파싱 에러 안전 처리 확인 필요. 현재 `set -euo pipefail` 사용 시 `trap 'exit 0' ERR`이 잡아주지만, 명시적 `|| true` 추가 권장.

---

### 2.B — TeamDelete 타이밍 (4건)

#### B1: TeamDelete → 즉시 TaskCompleted
- **관여 hook**: `validate-pdca-before-teamdelete.sh` (mv) → `pdca-chain-handoff.sh` (resolver 5단계)
- **현재 동작**: TeamDelete hook이 `mv active → archived` → CC가 TaskCompleted 발화 → handoff hook이 resolver 호출 → 5단계에서 archived 파일 발견 → 체인 발동
- **기대 동작**: 아카이브에서 context 읽어서 체인 정상 발동
- **기존 테스트**: ✅ RW-5
- **TDD assertion**: active 없음 + archived 존재 → 체인 payload 정상 생성
- **위험 주의**: 이것이 체인의 핵심 경로. 반드시 통합 테스트로 검증.

#### B2: TeamDelete 없이 TaskCompleted (단독 세션)
- **관여 hook**: `pdca-chain-handoff.sh` (활성 context 직접 읽기)
- **현재 동작**: 활성 context 파일이 그대로 존재 → 정상 읽기
- **기대 동작**: 정상 체인 발동
- **기존 테스트**: ✅ PC-15~16
- **TDD assertion**: 활성 context → 체인 payload 생성

#### B3: TeamDelete 2번 연속 (같은 팀)
- **관여 hook**: `validate-pdca-before-teamdelete.sh`
- **현재 동작**: 1차 `mv active → archived` 성공. 2차 호출 시 active 파일 없음 → `CONTEXT_FILE=""` → **mv 실패 가능성**
- **기대 동작**: 첫 번째만 아카이빙, 두 번째는 no-op (exit 0)
- **기존 테스트**: ❌ Gap
- **TDD assertion**: 2차 호출 `exit code === 0`, archived 파일 1개만 존재
- **수정 제안**: `validate-pdca-before-teamdelete.sh`에서 `[ -f "$CONTEXT_FILE" ] && mv ...` 가드 추가 여부 확인. 현재 `trap 'exit 0' ERR`이 보호하지만, 명시적 가드 권장.

#### B4: 3팀 동시 TeamDelete
- **관여 hook**: 각 팀의 PreToolUse(TeamDelete) → 각각 자기 context만 아카이빙
- **현재 동작**: 세션별 파일이므로 이론상 독립. 단, **동시 mv가 파일시스템 레벨에서 race condition 가능성은 0** (파일명이 다르므로).
- **기대 동작**: 각각 자기 context만 아카이빙
- **기존 테스트**: ❌ Gap
- **TDD assertion**: 3개 파일 각각 `.archived` 존재, 서로 간섭 없음
- **수정 제안**: 테스트에서 3개 context 파일 생성 → 순차 mv 실행 → 3개 모두 아카이빙 확인.

---

### 2.C — 체인 라우팅 (8건)

#### C1: CTO 완료 → PM 자동 전달
- **관여 hook**: `pdca-chain-handoff.sh` → `peer-resolver.sh` → `chain-messenger.sh`
- **현재 동작**: L2/L3 + Match Rate ≥ 95% → `TO_ROLE=PM_LEADER` → broker 전송
- **기대 동작**: PM peer에 `COMPLETION_REPORT` 도달
- **기존 테스트**: ✅ CH-1~4
- **TDD assertion**: payload.to_role === "PM_LEADER", chain_step === "cto_to_pm"

#### C2: PM pass → COO 자동 전달
- **관여 hook**: `pm-chain-forward.sh` → peer-resolver → messenger
- **현재 동작**: `pm-verdict.json` verdict=pass → `TO_ROLE=MOZZI` → broker 전송
- **기대 동작**: MOZZI peer에 `COMPLETION_REPORT` 도달
- **기존 테스트**: ✅ PF-1, RW-8
- **TDD assertion**: payload.to_role === "MOZZI", chain_step === "pm_to_coo"

#### C3: PM reject → CTO FEEDBACK
- **관여 hook**: `pm-chain-forward.sh`
- **현재 동작**: verdict=reject → `TO_ROLE=CTO_LEADER`, type=FEEDBACK
- **기대 동작**: CTO에 issues 포함 FEEDBACK 전달
- **기존 테스트**: ✅ PF-2, RW-9
- **TDD assertion**: payload.type === "FEEDBACK", payload.issues 존재

#### C4: COO 보고 → webhook wake
- **관여 hook**: `coo-chain-report.sh` → `send_webhook_wake()`
- **현재 동작**: `coo-smith-report.json` 저장 → webhook curl 호출
- **기대 동작**: webhook 200 OK, `action_required: "smith_approval"`
- **기존 테스트**: ✅ CR-2, RW-10
- **TDD assertion**: webhook URL 호출, Authorization Bearer 헤더 존재

#### C5: broker 미기동
- **관여 hook**: `pdca-chain-handoff.sh` (health check 실패 분기)
- **현재 동작**: `curl -sf /health` 실패 → inline fallback 시도 → 실패 시 `ACTION_REQUIRED` 메시지 + exit 0
- **기대 동작**: 체인 블로킹 안 함, 수동 핸드오프 가능하도록 payload 출력
- **기존 테스트**: ✅ CM-2, CH-5
- **TDD assertion**: `exit code === 0`, stdout에 `ACTION_REQUIRED` 포함

#### C6: webhook wake도 실패
- **관여 hook**: `coo-chain-report.sh` → `send_webhook_wake()` 실패 분기
- **현재 동작**: curl 실패 → `WEBHOOK_STATUS="fail"` → `ACTION_REQUIRED` 메시지 + exit 0
- **기대 동작**: 블로킹 안 함, 수동 보고 가이드 출력
- **기존 테스트**: ✅ CR-3
- **TDD assertion**: `exit code === 0`, stdout에 `ACTION_REQUIRED` 포함

#### C7: peer-resolver가 대상 peer 못 찾음
- **관여 hook**: `peer-resolver.sh` → `resolve_peer()` 3단계 모두 실패
- **현재 동작**: return 1 → handoff에서 `ACTION_REQUIRED` + exit 0
- **기대 동작**: 수동 핸드오프 로그 + exit 0
- **기존 테스트**: ✅ PR-3, CH-5
- **TDD assertion**: `exit code === 0`, `ACTION_REQUIRED` 메시지

#### C8: 중복 메시지 dedup
- **관여 hook**: `chain-messenger.sh` → `send_chain_message()` dedup 체크
- **현재 동작**: `chain-sent.log`에서 5분 이내 동일 msg_id → `SEND_STATUS="dedup_skip"` → 전송 안 함
- **기대 동작**: 두 번째 전송 무시
- **기존 테스트**: ✅ RW-17
- **TDD assertion**: 두 번째 호출 → `SEND_STATUS === "dedup_skip"`

---

### 2.D — Hook 실행 환경 (5건)

#### D1: tmux 없는 환경
- **관여 hook**: `team-context-resolver.sh` 3단계 (tmux 없음 → local.json)
- **현재 동작**: `$TMUX` 미설정 → `team-context-local.json` 사용
- **기대 동작**: local.json fallback으로 체인 정상 작동
- **기존 테스트**: ✅ RW-19
- **TDD assertion**: `TEAM_CONTEXT_FILE` 이 `team-context-local.json` 경로

#### D2: jq 미설치
- **관여 hook**: 모든 hook (jq로 JSON 파싱)
- **현재 동작**: `jq` 명령 not found → `set -euo pipefail` + `trap 'exit 0' ERR` → exit 0
- **기대 동작**: exit 0 + 에러 로그, 체인 블로킹 안 함
- **기존 테스트**: ❌ Gap
- **TDD assertion**: jq를 PATH에서 제거한 상태로 실행 → `exit code === 0`
- **수정 제안**: hook 시작부에 `command -v jq >/dev/null || { hook_log "jq not found"; exit 0; }` 가드 추가 권장. 현재 trap이 보호하지만 명시적이 더 안전.

#### D3: hook 실행 시간 5초+ 초과
- **관여 hook**: 모든 hook (CC의 hook 타임아웃 정책에 의존)
- **현재 동작**: CC가 hook에 기본 타임아웃 적용 (10초). 5초+면 broker 통신 지연이 주 원인.
- **기대 동작**: 타임아웃 시 exit 0 (블로킹 안 함)
- **기존 테스트**: ❌ Gap
- **TDD assertion**: curl에 `--max-time 3` 설정 확인 + 응답 지연 시뮬레이션
- **수정 제안**: `chain-messenger.sh`의 curl에 `--connect-timeout 2 --max-time 3` 명시 확인. 미설정 시 추가 권장.

#### D4: .pdca-status.json 없음
- **관여 hook**: `validate-pdca-before-teamdelete.sh` (pdca-status 확인)
- **현재 동작**: `[ ! -f "$PDCA_STATUS" ]` → exit 2 (TeamDelete 차단)
- **기대 동작**: TeamDelete 차단 + 경고 메시지
- **기존 테스트**: ❌ Gap
- **TDD assertion**: pdca-status 없음 → `exit code === 2`, stderr에 경고
- **주의**: 이것은 체인 자체가 아니라 TeamDelete 가드. 체인 블로킹은 아님.

#### D5: runtime 디렉토리 없음
- **관여 hook**: 여러 hook (`.claude/runtime/` 경로 사용)
- **현재 동작**: `mkdirSync`(vitest) 또는 `mkdir -p`(bash)로 자동 생성하는 경우와, 존재 가정하고 쓰는 경우 혼재
- **기대 동작**: 자동 생성 또는 exit 0
- **기존 테스트**: ❌ Gap
- **TDD assertion**: runtime 디렉토리 삭제 상태로 hook 실행 → `exit code === 0`
- **수정 제안**: 각 hook 시작부에 `mkdir -p "$PROJECT_DIR/.claude/runtime"` 추가 권장.

---

### 2.E — requireApproval 통합 (5건)

#### E1: .claude/ 수정 → 승인 요청
- **관여 hook**: `validate-delegate.sh` → `approval-handler.sh`
- **현재 동작**: `is_approval_required(".claude/foo")` → true → `check_approval()` → pending 없음 → `request_approval()` → pending JSON 생성 + exit 2
- **기대 동작**: pending 파일 생성, exit 2, (Slack 알림은 별도)
- **기존 테스트**: ✅ RW-11~12
- **TDD assertion**: pending 파일 생성 확인, `exit code === 2`

#### E2: 승인 → 작업 재개 → 완료 → 체인 발동
- **관여 hook**: `validate-delegate.sh` (승인 확인) → `pdca-chain-handoff.sh` (체인 발동)
- **현재 동작**: granted 파일에 타임스탬프 → 300초 이내 → exit 0 (허용) → 작업 완료 → TaskCompleted → 체인
- **기대 동작**: 전체 플로우 정상
- **기존 테스트**: ✅ RW-13
- **TDD assertion**: granted 파일 존재 → Edit 허용 → TaskCompleted → 체인 payload 생성

#### E3: 거부 → exit 2 → 리더 이어받기 → 체인
- **관여 hook**: `validate-delegate.sh` (거부 감지) → 리더 세션에서 TaskCompleted
- **현재 동작**: granted 파일에 `"rejected"` → exit 2 → 팀원 중단 → 리더가 직접 또는 다른 팀원으로 완료 → TaskCompleted
- **기대 동작**: 거부 시 팀원 차단, 리더 TaskCompleted 시 체인 정상
- **기존 테스트**: ✅ RW-14
- **TDD assertion**: `"rejected"` → `exit code === 2`, 이후 리더 TaskCompleted → 체인

#### E4: 타임아웃 → exit 2
- **관여 hook**: `approval-handler.sh` (TTL 300초 초과)
- **현재 동작**: granted 파일 타임스탬프가 현재 시간 - 300초 이상 → 만료 → exit 2
- **기대 동작**: E3과 동일
- **기존 테스트**: ✅ RW-15
- **TDD assertion**: 만료된 타임스탬프 → `exit code === 2`

#### E5: requireApproval API 실패 → fallback exit 2
- **관여 hook**: `approval-handler.sh` → `request_approval()` 실패
- **현재 동작**: pending 파일 쓰기 실패 시 (디렉토리 없음 등) → `trap 'exit 0' ERR` 또는 쓰기 에러
- **기대 동작**: exit 2 (차단 유지 — 승인 없이 진행 불가)
- **기존 테스트**: ❌ Gap
- **TDD assertion**: approvals 디렉토리 쓰기 불가 → `exit code === 2` (안전 차단)
- **수정 제안**: `request_approval()`에서 `mkdir -p` 후 쓰기. 실패 시 명시적 exit 2. 현재는 trap 의존.

---

### 2.F — 에러 복구 (4건)

#### F1: hook 중간에 크래시 (exit 1)
- **관여 hook**: 모든 hook
- **현재 동작**: `trap 'exit 0' ERR` 설정된 hook → exit 0으로 변환. 미설정 hook → exit 1 전파 → CC가 무시하고 진행 (hook 실패는 비차단).
- **기대 동작**: 다른 hook 영향 없음, 체인 다음 단계는 안 탐 (해당 hook만 실패)
- **기존 테스트**: ❌ Gap
- **TDD assertion**: 강제 exit 1 주입 → 다른 hook 정상 실행 확인
- **참고**: CC의 hook 실행 정책 — 각 hook은 독립 프로세스. 하나의 실패가 다른 hook에 영향 안 줌.

#### F2: git conflict 상태에서 hook 실행
- **관여 hook**: `pdca-chain-handoff.sh` (`git diff HEAD~1` 사용)
- **현재 동작**: merge conflict 시 `git diff HEAD~1` 실패 → `CHANGED_FILES=""` → `HAS_SRC=0` → L1으로 분류 (안전)
- **기대 동작**: exit 0, 체인 블로킹 안 함
- **기존 테스트**: ❌ Gap
- **TDD assertion**: git conflict 시뮬레이션 → `exit code === 0`
- **수정 제안**: `git diff HEAD~1 --name-only 2>/dev/null || echo ""` 패턴 확인.

#### F3: 아카이브 1시간+ → 자동 정리
- **관여 hook**: `session-resume-check.sh` (아카이브 정리)
- **현재 동작**: `find .claude/runtime/ -name "*.archived.json" -mmin +60 -delete` (추정)
- **기대 동작**: 오래된 아카이브 삭제
- **기존 테스트**: ❌ Gap
- **TDD assertion**: 1시간+ 아카이브 → 정리 후 파일 없음 확인
- **참고**: 정리 후에도 체인 핸드오프에 영향 없음 (이미 처리 완료된 아카이브).

#### F4: 동시에 2개 TaskCompleted 이벤트
- **관여 hook**: `pdca-chain-handoff.sh` (2번 동시 호출)
- **현재 동작**: 각 호출은 독립 프로세스. dedup이 `msg_id`에 epoch+PID 포함하므로 중복 아님. 각각 체인 메시지 전송 시도.
- **기대 동작**: 각각 독립 처리, 경합 없음
- **기존 테스트**: ❌ Gap
- **TDD assertion**: 2번 연속 빠른 호출 → 각각 독립 payload, `exit code === 0`
- **주의**: 실제 동시 실행은 bash에서 `&` 백그라운드로 테스트. 파일 쓰기 경합(`last-completion-report.json`)은 마지막 쓰기 우선 (acceptable — 두 보고서 중 하나만 유지).

---

## 3. COO 상황 외 추가 엣지케이스 (PM팀 자체 발견)

| ID | 상황 | 관여 hook | 기대 동작 | 위험도 |
|----|------|----------|----------|--------|
| G1 | `chain-sent.log` 파일이 없음 (첫 실행) | chain-messenger.sh | 자동 생성 후 정상 전송 | 낮음 |
| G2 | `peer-map.json`에 stale peer ID | peer-resolver.sh | broker에서 확인 실패 → 2단계(PID) fallback | 중간 |
| G3 | Match Rate 파일이 여러 개 + 1일 초과 | match-rate-parser.sh | 전체 최신 파일 fallback | 중간 |
| G4 | `last-completion-report.json` 파일 크기 0 | pm-chain-forward.sh | jq 파싱 실패 → exit 0 | 중간 |
| G5 | webhook URL에 특수문자 (환경변수 오염) | coo-chain-report.sh | curl 실패 → ACTION_REQUIRED | 낮음 |
| G6 | 동일 세션에서 CTO→PM→COO 체인 완주 (단일 세션 풀사이클) | 전체 hook | 각 단계 순차 정상 | **높음** |

---

## 4. 수정 제안 목록 (CTO팀 구현용)

> 코드 수정 금지. CTO팀에 전달할 제안 사항만 기록.

| # | 대상 파일 | 제안 | 관련 상황 | 우선순위 |
|---|-----------|------|----------|---------|
| R1 | `pdca-chain-handoff.sh` | jq 파싱에 `\|\| true` 명시 추가 (A9 방어) | A9 | 권장 |
| R2 | `pdca-chain-handoff.sh` | `git diff HEAD~1 2>/dev/null \|\| echo ""` 패턴 (F2 방어) | F2 | 권장 |
| R3 | `validate-pdca-before-teamdelete.sh` | `[ -f "$CONTEXT_FILE" ] && mv ...` 명시적 가드 (B3 방어) | B3 | 권장 |
| R4 | 모든 hook 시작부 | `mkdir -p "$PROJECT_DIR/.claude/runtime"` 추가 (D5 방어) | D5 | 필수 |
| R5 | 모든 hook 시작부 | `command -v jq >/dev/null \|\| { echo "jq not found"; exit 0; }` (D2 방어) | D2 | 권장 |
| R6 | `chain-messenger.sh` | curl에 `--connect-timeout 2 --max-time 3` 명시 (D3 방어) | D3 | 권장 |
| R7 | `approval-handler.sh` | `request_approval()` 실패 시 명시적 exit 2 (E5 방어) | E5 | 필수 |

---

## 5. TDD 케이스 정의서

### 5.1 파일 구조

```
__tests__/hooks/chain-bulletproof.test.ts    ← 신규 파일 (32건+)
__tests__/hooks/helpers.ts                   ← 기존 헬퍼 재사용
```

> 기존 테스트 파일 수정 금지. 신규 파일만 추가.

### 5.2 전체 케이스 목록

#### 필수 (위험도 최고+높음 — 13건)

| # | 케이스 ID | 상황 | describe 그룹 | 테스트 내용 | assertion |
|---|-----------|------|-------------|------------|-----------|
| 1 | BP-A5 | 3팀 동시 context | A. Context | 3개 세션별 context 파일 → 각각 독립 resolve | 각 resolve 결과 ≠ 다른 팀 파일 |
| 2 | BP-A6 | 한 팀 삭제→무영향 | A. Context | CTO context 아카이빙 후 PM context 무사 | PM context 파일 존재 + 내용 동일 |
| 3 | BP-A7 | 아카이브만 존재 | A. Context | 활성 없고 archived만 → 체인 발동 | payload 정상 생성, exit 0 |
| 4 | BP-B1 | TeamDelete→즉시 TC | B. TeamDelete | mv archived → handoff hook → archived 읽기 | 체인 payload의 team 필드 정상 |
| 5 | BP-B4 | 3팀 동시 TeamDelete | B. TeamDelete | 3개 context → 순차 mv → 3개 archived | 3개 모두 .archived 존재 |
| 6 | BP-C1 | CTO→PM 전달 | C. Routing | L2 + 95% → PM_LEADER 전달 | to_role=PM, chain_step=cto_to_pm |
| 7 | BP-C2 | PM pass→COO | C. Routing | verdict=pass → MOZZI 전달 | to_role=MOZZI, chain_step=pm_to_coo |
| 8 | BP-C3 | PM reject→CTO | C. Routing | verdict=reject → CTO FEEDBACK | type=FEEDBACK, issues 존재 |
| 9 | BP-C4 | COO→webhook | C. Routing | webhook curl 호출 | Authorization Bearer 존재 |
| 10 | BP-C5 | broker 미기동 | C. Routing | health check 실패 → ACTION_REQUIRED | exit 0, ACTION_REQUIRED 출력 |
| 11 | BP-E1 | .claude/ 승인 요청 | E. Approval | .claude/foo 편집 → pending 생성 | pending 파일 존재, exit 2 |
| 12 | BP-E2 | 승인→체인 발동 | E. Approval | granted → Edit 허용 → handoff 정상 | exit 0, payload 생성 |
| 13 | BP-E3 | 거부→exit 2 | E. Approval | rejected → 차단 | exit 2, pending 삭제 |

#### 권장 (위험도 중간 — 14건)

| # | 케이스 ID | 상황 | describe 그룹 | 테스트 내용 | assertion |
|---|-----------|------|-------------|------------|-----------|
| 14 | BP-A2 | 빈 JSON `{}` | A. Context | context가 `{}` → exit 0 | exit 0, payload 없음 |
| 15 | BP-A3 | team 필드 없음 | A. Context | `{"session":"x"}` → exit 0 | exit 0, payload 없음 |
| 16 | BP-A8 | 레거시 fallback | A. Context | team-context.json만 → 레거시 읽기 | resolver 결과 = team-context.json |
| 17 | BP-A9 | JSON 파싱 에러 | A. Context | 깨진 내용 `{{{` → exit 0 | exit 0, 비차단 |
| 18 | BP-B3 | TeamDelete 2연속 | B. TeamDelete | 2차 mv 대상 없음 → no-op | exit 0, archived 1개 |
| 19 | BP-C7 | peer 못 찾음 | C. Routing | 3단계 모두 실패 → ACTION_REQUIRED | exit 0, ACTION_REQUIRED |
| 20 | BP-C8 | 중복 dedup | C. Routing | 동일 msg_id 2회 → 2번째 skip | SEND_STATUS = dedup_skip |
| 21 | BP-D1 | tmux 없음 | D. Environment | TMUX 미설정 → local.json | resolver = local.json |
| 22 | BP-D3 | hook 타임아웃 | D. Environment | curl 지연 시뮬레이션 → timeout | exit 0, 비차단 |
| 23 | BP-D4 | pdca-status 없음 | D. Environment | TeamDelete 시 pdca 파일 없음 | exit 2 (TeamDelete 차단) |
| 24 | BP-D5 | runtime 디렉토리 없음 | D. Environment | .claude/runtime/ 삭제 → hook 실행 | exit 0 또는 자동 생성 |
| 25 | BP-E5 | approval API 실패 | E. Approval | approvals/ 쓰기 불가 → exit 2 | exit 2, 안전 차단 |
| 26 | BP-F1 | hook 크래시 | F. Recovery | 강제 exit 1 → 다음 hook 무영향 | 독립 hook 정상 실행 |
| 27 | BP-F4 | 동시 2개 TC | F. Recovery | 2회 빠른 연속 호출 → 독립 | 각각 exit 0, 독립 payload |

#### 선택 (위험도 낮음 — 5건)

| # | 케이스 ID | 상황 | describe 그룹 | 테스트 내용 | assertion |
|---|-----------|------|-------------|------------|-----------|
| 28 | BP-A1 | context 파일 없음 | A. Context | 파일 없음 → silent exit 0 | exit 0, stdout 비어있음 |
| 29 | BP-A4 | taskFiles 빈 배열 | A. Context | taskFiles=[] → 체인 발동 | payload에 taskFiles=[] |
| 30 | BP-D2 | jq 미설치 | D. Environment | PATH에서 jq 제거 → exit 0 | exit 0, 비차단 |
| 31 | BP-F2 | git conflict | F. Recovery | conflict 상태 → exit 0 | exit 0, 비차단 |
| 32 | BP-F3 | 아카이브 정리 | F. Recovery | 1시간+ archived → 삭제 | 정리 후 파일 없음 |

#### 추가 (PM 자체 발견 — 6건)

| # | 케이스 ID | 상황 | describe 그룹 | 테스트 내용 | assertion |
|---|-----------|------|-------------|------------|-----------|
| 33 | BP-G1 | sent.log 없음 | G. Extra | 첫 전송 시 로그 자동 생성 | 파일 생성 + 전송 성공 |
| 34 | BP-G2 | stale peer-map | G. Extra | peer-map ID가 broker에 없음 → fallback | 2단계 이상에서 resolve |
| 35 | BP-G3 | 오래된 analysis | G. Extra | 1일+ 파일만 → 전체 최신 fallback | Match Rate 정상 추출 |
| 36 | BP-G4 | 빈 report 파일 | G. Extra | 0바이트 JSON → jq 실패 → exit 0 | exit 0, 비차단 |
| 37 | BP-G5 | webhook URL 오염 | G. Extra | 특수문자 URL → curl 실패 → ACTION_REQUIRED | exit 0, ACTION_REQUIRED |
| 38 | BP-G6 | 단일 세션 풀사이클 | G. Extra | CTO→PM→COO 순차 → 각 payload 정상 | 3단계 모두 정상 exit 0 |

**총 38건** (필수 13 + 권장 14 + 선택 5 + 추가 6)

### 5.3 테스트 구조 설계

```typescript
// __tests__/hooks/chain-bulletproof.test.ts

import { describe, it, expect, afterEach } from 'vitest';
import { /* 기존 helpers */ } from './helpers';

// ═══ A. Context 관련 ══════════════════════════════
describe('A. Context Edge Cases', () => {
  // BP-A1 ~ BP-A9
});

// ═══ B. TeamDelete 타이밍 ═════════════════════════
describe('B. TeamDelete Timing', () => {
  // BP-B1 ~ BP-B4
});

// ═══ C. 체인 라우팅 ══════════════════════════════
describe('C. Chain Routing', () => {
  // BP-C1 ~ BP-C8
});

// ═══ D. Hook 실행 환경 ═══════════════════════════
describe('D. Hook Environment', () => {
  // BP-D1 ~ BP-D5
});

// ═══ E. requireApproval 통합 ════════════════════
describe('E. Approval Integration', () => {
  // BP-E1 ~ BP-E5
});

// ═══ F. 에러 복구 ═══════════════════════════════
describe('F. Error Recovery', () => {
  // BP-F1 ~ BP-F4
});

// ═══ G. 추가 엣지케이스 ═════════════════════════
describe('G. Additional Edge Cases', () => {
  // BP-G1 ~ BP-G6
});
```

---

## 6. 기존 테스트 회귀 분석

### 6.1 영향받는 기존 테스트

| 기존 파일 | 영향 여부 | 이유 |
|-----------|----------|------|
| `pdca-chain-handoff.test.ts` (25건) | ⚠️ 간접 | R1(jq || true) 적용 시 에러 분기 변경 가능. 단, 정상 경로는 동일. |
| `pdca-chain-handoff-v2.test.ts` (23건) | ⚠️ 간접 | R2(git diff fallback) 적용 시 L1 분류 로직 미세 변경. |
| `chain-e2e.test.ts` (38건) | ✅ 무영향 | peer-resolver, messenger는 수정 대상 아님. |
| `chain-e2e-realworld.test.ts` (20건) | ✅ 무영향 | context resolver 로직 변경 없음. |
| `team-context.test.ts` (8건) | ✅ 무영향 | context 구조 변경 없음. |

### 6.2 회귀 방지 전략

1. **수정 전 기존 114건 전체 Green 확인**: `npx vitest run __tests__/hooks/`
2. **수정 제안(R1~R7) 적용 시 기존 테스트 먼저 실행** → Green 유지 확인 → 신규 38건 추가
3. **CI에 체인 테스트 전체 포함**: `npx vitest run __tests__/hooks/chain-*.test.ts __tests__/hooks/pdca-chain-*.test.ts`
4. **수정 제안별 영향 분석**:
   - R1 (jq || true): PC-* 테스트의 에러 분기 테스트 확인 필요
   - R2 (git diff fallback): RV-* 테스트의 L1 분류 확인 필요
   - R3~R7: 기존 정상 경로 변경 없음 → 회귀 위험 낮음

---

## 7. Smith님 실전 검증 체크리스트

> 아래 체크리스트는 CTO팀 구현 + TDD 통과 후, Smith님이 직접 실전에서 검증하는 시나리오.

### 7.1 사전 조건

- [ ] 모든 TDD (기존 114건 + 신규 38건) Green 확인
- [ ] `npm run build` 성공
- [ ] broker가 실행 중 (`curl -sf http://localhost:7899/health`)
- [ ] tmux 세션 3개 준비 가능 (sdk-cto, sdk-pm, hermes)

### 7.2 시나리오 1: 정상 체인 풀플로우

> CTO 완료 → PM 검수 pass → COO 보고 → Smith님 Slack 수신

| # | 단계 | Smith님 행동 | 확인 사항 | ✅ |
|---|------|-------------|----------|---|
| 1 | CTO팀 작업 시작 | tmux sdk-cto에서 CTO팀 작업 실행 | 팀 생성 정상 | |
| 2 | CTO팀 작업 완료 | TaskCompleted 대기 | `.claude/runtime/last-completion-report.json` 생성됨 | |
| 3 | PM 자동 수신 | tmux sdk-pm 확인 | PM이 COMPLETION_REPORT 수신 메시지 출력 | |
| 4 | PM 검수 pass | PM이 자동 처리 또는 verdict 작성 | `pm-verdict.json` → `verdict: "pass"` | |
| 5 | COO 자동 수신 | tmux hermes 확인 | COO가 보고서 수신 | |
| 6 | COO→Smith 보고 | Slack 알림 확인 | `coo-smith-report.json` 생성 + Slack에 action_required 도착 | |
| 7 | Smith님 승인 | Slack에서 승인 | 체인 종료, 다음 TASK 자동 시작 | |

### 7.3 시나리오 2: PM 반려 → CTO 재작업

| # | 단계 | Smith님 행동 | 확인 사항 | ✅ |
|---|------|-------------|----------|---|
| 1 | CTO 완료 | 시나리오 1의 1~3 동일 | PM이 보고서 수신 | |
| 2 | PM 검수 reject | PM이 `verdict: "reject"` + issues 작성 | FEEDBACK 메시지 CTO에 전달 | |
| 3 | CTO 수신 | tmux sdk-cto 확인 | CTO가 FEEDBACK + issues 수신 | |
| 4 | CTO 재작업 | 수정 후 다시 완료 | 두 번째 체인 발동 (시나리오 1로 복귀) | |

### 7.4 시나리오 3: 병렬 팀 독립 동작

| # | 단계 | Smith님 행동 | 확인 사항 | ✅ |
|---|------|-------------|----------|---|
| 1 | 3팀 동시 가동 | sdk-cto, sdk-cto-2, sdk-pm 동시 작업 | 3개 context 파일 존재 | |
| 2 | CTO-1 완료 | CTO-1 TaskCompleted | CTO-1 체인만 발동, CTO-2/PM 무영향 | |
| 3 | CTO-1 TeamDelete | CTO-1 팀 삭제 | CTO-1만 archived, CTO-2/PM context 무사 | |
| 4 | CTO-2 계속 작업 | CTO-2 작업 진행 | CTO-2 context 정상 | |

### 7.5 시나리오 4: broker 다운 → 수동 핸드오프

| # | 단계 | Smith님 행동 | 확인 사항 | ✅ |
|---|------|-------------|----------|---|
| 1 | broker 중지 | `kill $(lsof -ti:7899)` | broker 프로세스 종료 | |
| 2 | CTO 완료 | TaskCompleted 발화 | ACTION_REQUIRED + PAYLOAD 출력 | |
| 3 | 수동 전달 | PM에게 PAYLOAD 복사 전달 | PM이 수동으로 처리 | |
| 4 | broker 재시작 | broker 다시 기동 | 다음 체인은 자동 | |

### 7.6 시나리오 5: 승인 플로우 (Slack)

| # | 단계 | Smith님 행동 | 확인 사항 | ✅ |
|---|------|-------------|----------|---|
| 1 | 팀원이 .claude/ 수정 시도 | 팀원이 Edit 호출 | pending 파일 생성 + exit 2 (차단) | |
| 2 | Slack 알림 수신 | Smith님 Slack 확인 | 승인 요청 알림 도착 | |
| 3-A | 승인 | Slack에서 승인 | granted 파일 생성 → 팀원 재시도 → 성공 | |
| 3-B | 거부 | Slack에서 거부 | granted에 "rejected" → 팀원 차단 유지 → 리더 이어받기 | |
| 4 | 체인 계속 | 작업 완료 후 TaskCompleted | 승인/거부 관계없이 체인 정상 발동 | |

### 7.7 시나리오 6: L0/L1 → COO 직행

| # | 단계 | Smith님 행동 | 확인 사항 | ✅ |
|---|------|-------------|----------|---|
| 1 | hotfix 커밋 | `fix:` prefix로 커밋 | L0 자동 감지 | |
| 2 | TaskCompleted | hook 발동 | PM 건너뛰고 MOZZI(COO)에 직접 전달 | |
| 3 | COO 수신 | hermes 세션 확인 | ANALYSIS_REPORT 수신 | |
| 4 | webhook wake | Slack 확인 | Smith님에게 직접 보고 | |

---

## 8. 구현 순서 권장 (CTO팀용)

| 순서 | 작업 | 관련 수정 | 예상 규모 |
|------|------|----------|----------|
| 1 | R4: 모든 hook에 `mkdir -p runtime` | D5 방어 | 각 hook 1줄 추가 |
| 2 | R7: approval-handler exit 2 명시 | E5 방어 | 3줄 수정 |
| 3 | R5: jq 존재 확인 가드 | D2 방어 | 각 hook 1줄 추가 |
| 4 | R1, R2: jq/git fallback | A9, F2 방어 | 2줄씩 수정 |
| 5 | R3: TeamDelete 이중 mv 가드 | B3 방어 | 1줄 추가 |
| 6 | R6: curl 타임아웃 명시 | D3 방어 | 1줄 수정 |
| 7 | 신규 테스트 38건 작성 | 전체 | 신규 파일 1개 |
| 8 | 전체 회귀 테스트 | 기존 114건 Green | 실행만 |

---

## Appendix: 런타임 파일 경로 정리

| 파일 | 경로 | 생성 시점 | 소비 시점 |
|------|------|----------|----------|
| team-context-{session}.json | .claude/runtime/ | 팀 생성 시 | hook에서 팀 식별 |
| team-context-{session}.archived.json | .claude/runtime/ | TeamDelete 시 | 체인 핸드오프 (5단계 fallback) |
| team-context.json | .claude/runtime/ | 레거시 | 하위 호환 (4단계 fallback) |
| peer-map.json | .claude/runtime/ | 수동 등록 | peer-resolver 1단계 |
| last-completion-report.json | .claude/runtime/ | CTO handoff | PM 수신 |
| pm-verdict.json | .claude/runtime/ | PM 검수 | pm-chain-forward |
| last-pm-report.json | .claude/runtime/ | PM forward | COO 수신 |
| coo-smith-report.json | .claude/runtime/ | COO 보고 | Smith님 확인 |
| coo-feedback.json | .claude/runtime/ | Smith 반려 | COO→PM 역방향 |
| chain-sent.log | .claude/runtime/ | 전송 시 | dedup 5분 TTL |
| chain-received.log | .claude/runtime/ | 수신 시 | dedup 5분 TTL |
| approvals/pending/{key}.json | .claude/runtime/ | 승인 요청 | approval-handler |
| approvals/granted/{key} | .claude/runtime/ | 승인/거부 | approval-handler (TTL 300초) |
| hook-logs/*.log | .claude/runtime/ | hook 실행 | 디버깅 |
