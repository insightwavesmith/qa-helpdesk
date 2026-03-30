# Agent Ops Hardening (에이전트 운영 강화) Design — P0 Items

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Agent Ops Hardening P0 (D5+D7+D8-1+D8-4) |
| 작성일 | 2026-03-30 |
| Plan | `docs/01-plan/features/agent-ops-hardening.plan.md` |
| 프로세스 레벨 | L2 |
| 수정 파일 | hooks 3개 + helpers 2개 + config 1개 |
| 신규 파일 | 테스트 1개 + helper 1개 + fixtures 3개 |
| TDD | 35건 (OFR-1~OFR-35) |

---

## 0. 현재 아키텍처 + 실패 지점 매핑

```
TaskCompleted (CC 런타임 이벤트)
  ↓ settings.local.json hooks 배열 순서대로 실행
  ├── [1] task-completed.sh        ← 마커 + 알림 + BOARD
  ├── [2] task-quality-gate.sh     ← tsc + build 게이트
  ├── ...
  └── [8] pdca-chain-handoff.sh    ← 체인 시작점
        ↓ Match Rate ≥ 95%
        ├── stdout: ACTION_REQUIRED: send_message(PM_LEADER)
        ↓ 리더가 stdout 파싱 → MCP send_message
  PM session: pm-chain-forward.sh
        ↓ verdict=pass
        ├── peer-resolver → MOZZI peer ID
        ├── chain-messenger → send_chain_message
        ↓
  COO session: coo-chain-report.sh
        ↓ coo-smith-report.json 생성
        └── webhook wake → Smith님 알림
```

### 실패 지점 (실전 2일 역추출)

```
[CF-4] CC가 TaskCompleted 이벤트 자체를 안 발생 ──────────┐
[TF-1] 팀원 .claude/ 수정 → leader 승인 블로킹 22분 ──────┤ 체인 시작 전
[TF-2] 팀원 sleep 폴링 54분 → idle 토큰 낭비 ──────────────┘

[CF-1] Bearer 토큰 누락 → webhook 401 ────────────────────┐
[CF-2] peer scope 불일치 → 상대방 ID 못 찾음 ──────────────┤ 체인 중간
[CF-3] PM→COO 전송 실패 → 무시하고 exit 0 ─────────────────┤
[COO-3] COO가 PM 검수 건너뛰고 직접 보고 ──────────────────┘

[COO-4] 숫자만 전달 → Smith님 맥락 부재 ──────────────────┐
[COO-5] 같은 보고 2번 → Smith님 혼란 ─────────────────────┤ 체인 끝
[TF-3] 좀비 pane → 토큰 지속 소모 ─────────────────────────┤
[TF-4] TASK 경로 미전달 → 팀원 엉뚱한 작업 ────────────────┤ 팀 운영
[TF-5] compaction → 핵심 컨텍스트 유실 ────────────────────┤
[TF-6] 같은 파일 동시 수정 → lock file 충돌 ──────────────┘
```

---

## 1. D5: 승인 블로킹 자동 감지 + 해제

### 1-1. 문제 분석

**사건**: backend-dev가 `.claude/hooks/task-quality-gate.sh` 수정 시도 → leader pane에 "Allow edit to .claude/" 승인 프롬프트 표시 → 아무도 Enter 안 침 → 22분간 thinking 멈춤.

**근본 원인**: `bypassPermissions` 모드에서도 `.claude/` 디렉토리는 보호 대상. CC가 팀원의 `.claude/` 파일 수정을 leader pane으로 라우팅 → leader가 인지 못하면 무한 대기.

### 1-2. 해결 3중 방어

#### 방어 1: 예방 (spawn 프롬프트 규칙)

팀원 spawn 시 프롬프트에 필수 포함:

```
[금지] .claude/ 디렉토리 내 파일 직접 수정 금지.
hooks, settings, runtime 파일 변경이 필요하면 리더에게 보고.
리더가 직접 수정 처리함.
```

**검증**: TASK 파일 "하지 말 것" 섹션에 `.claude/ 직접 수정 금지` 항목 존재 여부를 TDD로 확인 (OFR-4).

#### 방어 2: hooks 경로 보호 (validate-delegate.sh 확장)

현재 `validate-delegate.sh`는 리더의 `src/` 직접 수정을 차단. 이를 확장하여 **팀원의 `.claude/` 수정도 차단**:

```bash
# validate-delegate.sh 추가 (line ~40 이후)
# 팀원이 .claude/ 수정 시도 차단
if [ "$IS_TEAMMATE" = "true" ]; then
    FILE_PATH="${TOOL_INPUT_FILE_PATH:-}"
    if echo "$FILE_PATH" | grep -q "\.claude/"; then
        echo "BLOCKED: 팀원은 .claude/ 직접 수정 불가. 리더에게 보고하세요."
        exit 2
    fi
fi
```

**적용 위치**: PreToolUse hook (Edit, Write 도구에서 실행)

#### 방어 3: 감지 + 경고 (최후 방어)

tmux pane 캡처로 "approve" 패턴 감지하는 건 불안정하므로 **미구현**. 방어 1+2가 충분.

### 1-3. 수정 파일

| 파일 | 변경 | 줄 수 |
|------|------|------|
| `.claude/hooks/validate-delegate.sh` | 팀원 `.claude/` 수정 차단 추가 | +8줄 |

---

## 2. D7: 실전 실패 15건 + 1건 TDD

### 2-0. 설계 원칙

1. **테스트 파일 1개**: `__tests__/hooks/ops-failure-regression.test.ts` (OFR-1~OFR-35)
2. **패턴**: regression.test.ts의 "사건 → 테스트" 패턴 계승. 각 `describe`에 사건 설명 주석.
3. **격리**: `createTestEnv()` + `prepareHookScript()` + `cleanupTestEnv()`. 실제 프로젝트 파일 변경 없음.
4. **mock**: `createMockCurl` 패턴으로 HTTP 호출 모킹. 실제 broker 불필요.
5. **기존 테스트 불변**: chain-e2e.test.ts (38건), regression.test.ts (10건) 수정 안 함.

### 2-1. COO-3: PM 건너뛰기 — chain_step 순서 검증

**사건**: COO가 CTO 완료 보고를 받고 PM 검수 없이 바로 Smith님에게 보고.

**근본 원인**: coo-chain-report.sh가 `last-pm-report.json`이 없어도 `last-completion-report.json`에서 직접 보고서 생성 가능한 경로가 존재하지 않음 — 실제로는 COO 에이전트가 hook 대신 직접 send_message 호출. hook 로직 자체는 정상이지만, **hook을 거치지 않는 경로를 차단**해야 함.

**TDD 전략**: coo-chain-report.sh가 `last-pm-report.json` 없으면 보고서 생성 안 하는지 확인 + pm_verdict 필드 존재 검증.

```
OFR-1: coo-chain-report — pm-report 없으면 exit 0 (보고서 생성 안 함)
OFR-2: coo-chain-report — pm_verdict 필드가 coo-smith-report.json에 필수 포함
OFR-3: coo-chain-report — chain_step이 "coo_report"인지 (pm_to_coo 이후만)
```

### 2-2. COO-4: 숫자만 전달 — 보고서 필수 필드 검증

**사건**: COO가 "Match Rate 97%" 숫자만 보고. task_file, pm_notes, process_level 등 맥락 없음.

**근본 원인**: coo-chain-report.sh 출력 포맷에는 필드가 있지만, COO 에이전트가 hook 출력 대신 자체 요약 생성.

**TDD 전략**: coo-smith-report.json 필수 필드 존재 검증.

```
OFR-4: coo-smith-report.json에 task_file, match_rate, pm_verdict, pm_notes 전부 존재
OFR-5: match_rate가 숫자 타입이고 0~100 범위
OFR-6: pm_notes가 빈 문자열이 아님 (최소 1자)
```

### 2-3. COO-5: 중복 보고 — chain-messenger dedup

**사건**: 같은 COMPLETION_REPORT가 2번 전송됨.

**근본 원인**: chain-messenger.sh에 dedup 로직 없음. retry 성공 후 caller가 다시 호출하면 중복.

**TDD 전략**: chain-messenger에 sent-log 기반 dedup 추가 후 테스트.

```
OFR-7: 동일 msg_id 2회 send_chain_message → 두 번째는 SEND_STATUS="dedup_skip"
OFR-8: 다른 msg_id → 정상 전송 (dedup 간섭 없음)
OFR-9: sent-log 파일이 5분 이상 된 항목 자동 정리 (stale 방지)
```

### 2-4. TF-1: 승인 블로킹 22분

**사건**: 팀원이 `.claude/hooks/task-quality-gate.sh` 수정 → leader 승인 대기 22분.

**TDD 전략**: D5 구현의 검증. validate-delegate.sh가 팀원의 .claude/ 수정을 차단하는지.

```
OFR-10: IS_TEAMMATE=true + .claude/ 파일 경로 → exit 2 (차단)
OFR-11: IS_TEAMMATE=true + src/ 파일 경로 → exit 0 (허용)
OFR-12: IS_TEAMMATE=false + .claude/ 파일 경로 → exit 0 (리더는 허용)
```

### 2-5. TF-2: sleep 폴링 54분

**사건**: 팀원이 다른 팀원 작업 완료를 기다리며 `sleep 5` + while loop 54분 실행.

**근본 원인**: 에이전트 행동 이슈. 코드로 직접 차단 어려움.

**TDD 전략**: hooks 33개에 `sleep` 패턴이 없는지 정적 검증. (hook이 sleep으로 blocking되지 않음을 보장)

```
OFR-13: .claude/hooks/*.sh 전체에 "sleep [0-9]" 패턴 없음 (retry delay 제외)
OFR-14: chain-messenger.sh의 sleep은 _CM_RETRY_DELAY 변수 사용 (하드코딩 아님)
```

### 2-6. TF-3: 좀비 pane

**사건**: TeamDelete 실행 후에도 tmux pane이 살아있어 토큰 지속 소모.

**근본 원인**: TeamDelete가 CC 내부적으로 pane kill을 보장하지 않음. force-team-kill.sh로 수동 정리 필요.

**TDD 전략**: force-team-kill.sh 실행 후 registry 상태 검증 (기존 FK 테스트 보강).

```
OFR-15: force-team-kill 후 registry 전 멤버 state="terminated"
OFR-16: force-team-kill 후 config.json isActive=false
OFR-17: leader pane(%0)은 kill 대상에서 제외 ([BLOCK])
```

### 2-7. TF-4: TASK 미전달

**사건**: 팀원 spawn 시 TASK 파일 경로를 안 줘서 팀원이 뭘 해야 하는지 모름.

**TDD 전략**: team-context.json에 taskFiles가 비어있으면 안 되는 검증.

```
OFR-18: team-context.json의 taskFiles 배열이 비어있으면 안 됨
OFR-19: taskFiles의 각 경로가 실제 .claude/tasks/ 에 존재
```

### 2-8. TF-5: compaction 손실

**사건**: auto-compaction 후 현재 TASK, 팀원 상태, 체인 진행 단계 전부 유실.

**TDD 전략**: D8-2 구현 검증. context-checkpoint.sh가 SESSION-STATE.md를 올바르게 생성하는지.

```
OFR-20: context-checkpoint.sh 실행 → SESSION-STATE.md 생성
OFR-21: SESSION-STATE.md에 Current TASK, Phase, Teammates 필드 존재
OFR-22: SESSION-STATE.md에 timestamp 포함 (stale 판단용)
```

### 2-9. TF-6: lock file 불일치

**사건**: 2명의 팀원이 같은 파일을 동시 수정 → 충돌.

**TDD 전략**: TASK 파일의 파일 경계(수정 파일 목록) 간 겹침 검증.

```
OFR-23: 같은 team의 TASK 파일들에서 수정 파일 목록 추출 → 겹침 0건
```

### 2-10. CF-1: Bearer 토큰 누락

**사건**: webhook 호출 시 Authorization 헤더 빠져서 401.

**근본 원인**: `send_webhook_wake`에서 `$OPENCLAW_WEBHOOK_TOKEN`이 비어있을 때 fallback 토큰 사용 — 하지만 해당 환경에서 env var가 설정되지 않았고 fallback도 만료됨.

**TDD 전략**: chain-messenger의 webhook 호출에 Authorization 헤더 필수 포함 검증.

```
OFR-24: send_webhook_wake — curl 명령에 "Authorization: Bearer" 포함
OFR-25: OPENCLAW_WEBHOOK_TOKEN 환경변수 비어있어도 fallback 토큰으로 헤더 생성
OFR-26: Authorization 헤더 값이 "Bearer " 접두사 + 비어있지 않은 토큰
```

### 2-11. CF-2: peer scope 불일치

**사건**: list-peers에서 상대방이 안 보임. scope=machine vs scope=repo 불일치.

**근본 원인**: peer-resolver.sh가 `scope: "repo"` 고정. 상대방이 다른 작업 디렉토리에서 시작한 경우 repo scope에 안 걸림.

**TDD 전략**: peer-resolver의 3전략 fallback이 올바르게 동작하는지 검증.

```
OFR-27: peer-resolver — strategy 1(peer-map) 실패 → strategy 2(tmux PID) 시도
OFR-28: peer-resolver — strategy 2 실패 → strategy 3(summary match) 시도
OFR-29: peer-resolver — 3전략 전부 실패 → RESOLVED_PEER_ID 빈 문자열
```

### 2-12. CF-3: PM→COO 미도착

**사건**: pm-chain-forward.sh에서 COO(MOZZI)에게 전송 실패했는데 exit 0으로 무시.

**근본 원인**: pm-chain-forward.sh의 모든 실패 경로가 exit 0. `ACTION_REQUIRED` stdout만 출력하고 끝. 리더가 stdout을 안 읽으면 메시지 유실.

**TDD 전략**: 전송 실패 시 ACTION_REQUIRED가 stdout에 반드시 출력되는지 검증.

```
OFR-30: broker down → stdout에 "ACTION_REQUIRED" 포함
OFR-31: peer ID 못 찾음 → stdout에 "ACTION_REQUIRED" 포함
OFR-32: send 실패 → stdout에 "ACTION_REQUIRED" + PAYLOAD JSON 포함
```

### 2-13. CF-4 + Smith님 추가: TaskCompleted 미발동

**사건**: 작업 끝났는데 CC가 TaskCompleted 이벤트를 안 발생시켜서 체인이 시작 안 됨.

**근본 원인**: CC 런타임 레벨 이슈로 hook 코드에서 직접 해결 불가. 하지만 **전제 조건 검증**으로 "TaskCompleted가 발동했을 때 체인이 확실히 작동하는지"를 보장할 수 있음.

**TDD 전략 (2중)**:

1) **설정 검증**: pdca-chain-handoff.sh가 settings.local.json TaskCompleted 배열에 등록되어 있는지
2) **전제 조건**: team-context + analysis 파일 존재 시 chain 출력이 나오는지 (early exit 안 하는지)

```
OFR-33: settings.local.json TaskCompleted에 pdca-chain-handoff.sh 등록 확인
OFR-34: team-context + analysis(≥95%) 존재 → chain 출력 (ACTION_REQUIRED 또는 자동 전송)
OFR-35: team-context 없음 → silent exit 0 (정상 — 비대상)
```

### 2-14. TDD 전체 목록

| ID | 사건 | 테스트 내용 | 타입 |
|----|------|-----------|------|
| OFR-1 | COO-3 PM 건너뛰기 | pm-report 없으면 보고서 생성 안 함 | hook |
| OFR-2 | COO-3 | pm_verdict 필드 필수 포함 | hook |
| OFR-3 | COO-3 | chain_step="coo_report" 검증 | hook |
| OFR-4 | COO-4 숫자만 전달 | 보고서 필수 4필드 존재 | hook |
| OFR-5 | COO-4 | match_rate 0~100 숫자 | hook |
| OFR-6 | COO-4 | pm_notes 비어있지 않음 | hook |
| OFR-7 | COO-5 중복 보고 | 동일 msg_id 2회 → dedup_skip | helper |
| OFR-8 | COO-5 | 다른 msg_id → 정상 전송 | helper |
| OFR-9 | COO-5 | sent-log stale 항목 정리 | helper |
| OFR-10 | TF-1 승인 블로킹 | teammate + .claude/ → exit 2 | hook |
| OFR-11 | TF-1 | teammate + src/ → exit 0 | hook |
| OFR-12 | TF-1 | leader + .claude/ → exit 0 | hook |
| OFR-13 | TF-2 sleep 폴링 | hooks에 sleep 하드코딩 없음 | static |
| OFR-14 | TF-2 | chain-messenger sleep은 변수 사용 | static |
| OFR-15 | TF-3 좀비 pane | kill 후 registry terminated | hook |
| OFR-16 | TF-3 | kill 후 config isActive=false | hook |
| OFR-17 | TF-3 | leader pane 보호 | hook |
| OFR-18 | TF-4 TASK 미전달 | taskFiles 비어있으면 안 됨 | config |
| OFR-19 | TF-4 | taskFiles 경로 실제 존재 | config |
| OFR-20 | TF-5 compaction | checkpoint → SESSION-STATE.md 생성 | hook |
| OFR-21 | TF-5 | SESSION-STATE에 필수 필드 | hook |
| OFR-22 | TF-5 | SESSION-STATE에 timestamp | hook |
| OFR-23 | TF-6 lock file | TASK 파일 경계 겹침 0건 | static |
| OFR-24 | CF-1 Bearer 누락 | webhook에 Authorization 포함 | helper |
| OFR-25 | CF-1 | env 비어도 fallback 토큰 | helper |
| OFR-26 | CF-1 | Bearer + 비어있지 않은 값 | helper |
| OFR-27 | CF-2 peer scope | strategy 1→2 fallback | helper |
| OFR-28 | CF-2 | strategy 2→3 fallback | helper |
| OFR-29 | CF-2 | 3전략 전부 실패 → 빈 ID | helper |
| OFR-30 | CF-3 PM→COO | broker down → ACTION_REQUIRED | hook |
| OFR-31 | CF-3 | peer 못 찾음 → ACTION_REQUIRED | hook |
| OFR-32 | CF-3 | send 실패 → ACTION_REQUIRED + PAYLOAD | hook |
| OFR-33 | CF-4 TaskCompleted | settings에 chain-handoff 등록 | static |
| OFR-34 | CF-4 | 전제 조건 충족 → chain 출력 | hook |
| OFR-35 | CF-4 | team-context 없음 → silent exit | hook |

**테스트 타입 분포**:
- hook (bash 실행): 21건
- helper (bash 함수): 9건
- static (파일 내용 검증): 4건
- config (JSON 구조 검증): 1건

### 2-15. 테스트 코드 구조

```typescript
// __tests__/hooks/ops-failure-regression.test.ts
// OPS FAILURE REGRESSION — 실전 운영 2일간 발생한 실패 케이스 TDD
//
// COO 실패: OFR-1~6 (PM 건너뛰기, 숫자만 전달)
// COO 중복: OFR-7~9 (chain-messenger dedup)
// 팀 실패: OFR-10~23 (승인블로킹, sleep, 좀비, TASK, compaction, lock)
// 체인 실패: OFR-24~35 (Bearer, peer, PM→COO, TaskCompleted)

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  createTestEnv,
  runHook,
  cleanupTestEnv,
  prepareHookScript,
  prepareHookWithHelpers,
  writeTeamContext,
  writePmReport,
  writeAnalysisFile,
  prepareCooChainReport,
  preparePmChainForward,
  runBashFunction,
  writeCompletionReport,
  loadFixture,
} from './helpers'

const PROJECT_DIR = '/Users/smith/projects/bscamp'
```

### 2-16. Fixture 설계

```
__tests__/hooks/fixtures/
├── coo_report_valid.json       ← OFR-4~6: 정상 COO 보고서 (필수 필드 전부)
├── coo_report_minimal.json     ← OFR-4~6: 숫자만 있는 불량 보고서
├── chain_sent_log_sample.txt   ← OFR-7~9: dedup 테스트용 전송 이력
```

---

## 3. D8-1: Hook 출력 최소화

### 3-1. 현재 문제

33개 hook이 평균 10줄+ stdout 출력 → 전부 리더 컨텍스트에 주입 → 하루 수백 번 실행 → 토큰 누적 소모.

### 3-2. 공통 래퍼: hook-output.sh

```bash
#!/bin/bash
# helpers/hook-output.sh — Hook 출력 최소화 래퍼
# source해서 사용: hook_log "상세 메시지" / hook_result "1줄 요약"

_HOOK_LOG_DIR="${PROJECT_DIR:-.}/.claude/runtime/hook-logs"
_HOOK_NAME="${HOOK_NAME:-$(basename "$0" .sh)}"
_HOOK_LOG_FILE=""

hook_init() {
    mkdir -p "$_HOOK_LOG_DIR"
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
```

### 3-3. 적용 패턴

**Before** (task-quality-gate.sh 예):
```bash
echo "=== Task Quality Gate ==="
echo "프로세스 레벨: L2"
echo "TSC 검사 중..."
echo "TSC 결과: 에러 0건"
echo "빌드 검사 중..."
echo "빌드 결과: 성공"
echo "Match Rate: 97%"
echo "품질 게이트 통과"
# → 8줄이 컨텍스트에 주입
```

**After**:
```bash
source "$(dirname "$0")/helpers/hook-output.sh"
hook_init
hook_log "프로세스 레벨: L2"
hook_log "TSC: 에러 0건"
hook_log "빌드: 성공"
hook_log "Match Rate: 97%"
hook_result "PASS: quality-gate L2 tsc=0 build=ok rate=97%"
# → 1줄만 컨텍스트에 주입. 나머지는 로그 파일.
```

### 3-4. 적용 우선 대상 (출력이 많은 hook)

| Hook | 현재 출력 | 적용 후 |
|------|----------|---------|
| task-quality-gate.sh | ~15줄 | 1줄 |
| pdca-chain-handoff.sh | ~10줄 | 1줄 |
| validate-delegate.sh | ~5줄 | 1줄 |
| session-resume-check.sh | ~20줄 | 2줄 |
| task-completed.sh | ~8줄 | 1줄 |

### 3-5. 수정 파일

| 파일 | 변경 |
|------|------|
| `.claude/hooks/helpers/hook-output.sh` | **신규** — 공통 래퍼 |
| `.claude/hooks/task-quality-gate.sh` | echo → hook_log/hook_result |
| `.claude/hooks/pdca-chain-handoff.sh` | echo → hook_log/hook_result |
| `.claude/hooks/task-completed.sh` | echo → hook_log/hook_result |

나머지 hook은 점진 적용 (이번 Wave에서 상위 5개만).

---

## 4. D8-4: 서브에이전트 위임 규칙

### 4-1. CLAUDE.md 추가 규칙

```markdown
## 토큰 최적화: 서브에이전트 위임 (2026-03-30 적용)

**리더는 탐색/조사 작업을 서브에이전트에 위임한다. 리더 컨텍스트에는 결과 요약만 유입.**

### 위임 대상
| 작업 | 도구 | 모델 |
|------|------|------|
| 코드 탐색 (파일 찾기, 패턴 검색) | Agent(Explore, sonnet) | Sonnet |
| 기존 코드/테스트 패턴 조사 | Agent(Explore, sonnet) | Sonnet |
| 문서 검색 + 요약 | Agent(general, sonnet) | Sonnet |
| Gap 분석 | Agent(gap-detector, sonnet) | Sonnet |
| 코드 품질 검토 | Agent(code-analyzer, sonnet) | Sonnet |

### 리더가 직접 하는 것 (위임 금지)
- 아키텍처 판단/결정
- PDCA 상태 파일 업데이트
- 팀원 조율/메시지
- 최종 품질 판단 (Gap 분석 결과 해석)
- 체인 메시지 전송

### 효과
- 탐색 결과가 리더 컨텍스트에 직접 쌓이지 않음 (2000줄 → 요약 20줄)
- 리더 세션 수명 30-40% 연장
- Sonnet은 Opus 대비 비용 1/5
```

### 4-2. 구현

코드 변경 없음. CLAUDE.md에 규칙 추가만으로 즉시 적용.

---

## 5. 코드 수정 상세

### 5-1. chain-messenger.sh dedup 추가 (OFR-7~9)

```bash
# send_chain_message() 함수 시작부에 추가
_CM_SENT_LOG="${PROJECT_DIR:-.}/.claude/runtime/chain-sent.log"

_check_dedup() {
    local MSG_ID="$1"
    if [ ! -f "$_CM_SENT_LOG" ]; then
        return 1  # 로그 없음 → 중복 아님
    fi
    # 5분(300초) 이내 동일 msg_id 있으면 중복
    local NOW=$(date +%s)
    while IFS='|' read -r TS ID; do
        local AGE=$((NOW - TS))
        if [ "$AGE" -lt 300 ] && [ "$ID" = "$MSG_ID" ]; then
            return 0  # 중복
        fi
    done < "$_CM_SENT_LOG"
    return 1
}

_record_sent() {
    local MSG_ID="$1"
    echo "$(date +%s)|$MSG_ID" >> "$_CM_SENT_LOG"
    # stale 정리 (300초 이상 된 항목 제거)
    local NOW=$(date +%s)
    if [ -f "$_CM_SENT_LOG" ]; then
        local TMP="${_CM_SENT_LOG}.tmp"
        while IFS='|' read -r TS ID; do
            [ $((NOW - TS)) -lt 300 ] && echo "$TS|$ID"
        done < "$_CM_SENT_LOG" > "$TMP"
        mv "$TMP" "$_CM_SENT_LOG"
    fi
}

# send_chain_message() 내부, health check 이후에 추가:
send_chain_message() {
    local FROM_ID="$1"
    local TO_ID="$2"
    local PAYLOAD="$3"
    local MSG_ID="${4:-}"  # 선택적 4번째 인자
    SEND_STATUS="broker_down"
    SEND_DETAIL=""

    # dedup check
    if [ -n "$MSG_ID" ] && _check_dedup "$MSG_ID"; then
        SEND_STATUS="dedup_skip"
        SEND_DETAIL="msg_id=$MSG_ID already sent within 5min"
        return 0
    fi

    # ... 기존 로직 ...

    # 전송 성공 후 기록
    if [ "$SEND_STATUS" = "ok" ] && [ -n "$MSG_ID" ]; then
        _record_sent "$MSG_ID"
    fi
}
```

### 5-2. validate-delegate.sh 팀원 .claude/ 차단 (OFR-10~12)

```bash
# 기존 리더 src/ 차단 블록 이후에 추가

# ── 팀원의 .claude/ 수정 차단 ──
if [ "$IS_TEAMMATE" = "true" ]; then
    # Edit, Write 도구의 file_path 추출
    FILE_PATH=""
    if [ -n "${TOOL_INPUT_FILE_PATH:-}" ]; then
        FILE_PATH="$TOOL_INPUT_FILE_PATH"
    elif [ -n "${TOOL_INPUT:-}" ]; then
        FILE_PATH=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty' 2>/dev/null)
    fi

    if echo "$FILE_PATH" | grep -q '\.claude/'; then
        echo "BLOCKED: 팀원은 .claude/ 직접 수정 불가. 리더에게 내용 보고 후 리더가 수정."
        exit 2
    fi
fi
```

### 5-3. context-checkpoint.sh 신규 (OFR-20~22)

```bash
#!/bin/bash
# helpers/context-checkpoint.sh — compaction 대비 상태 자동 저장
# 호출: source context-checkpoint.sh && save_checkpoint
set -uo pipefail

PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"
STATE_FILE="$PROJECT_DIR/.claude/runtime/SESSION-STATE.md"

save_checkpoint() {
    local CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"
    local TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # team-context에서 정보 추출
    local TEAM=$(jq -r '.team // "unknown"' "$CONTEXT_FILE" 2>/dev/null || echo "unknown")
    local TASK_FILES=$(jq -r '.taskFiles[]? // empty' "$CONTEXT_FILE" 2>/dev/null | head -3)

    # TASK 파일에서 현재 진행 상태 추출
    local TASK_STATUS=""
    for TF in $TASK_FILES; do
        local FULL_PATH="$PROJECT_DIR/.claude/tasks/$TF"
        if [ -f "$FULL_PATH" ]; then
            local DONE=$(grep -c '\- \[x\]' "$FULL_PATH" 2>/dev/null || echo 0)
            local TOTAL=$(grep -c '\- \[' "$FULL_PATH" 2>/dev/null || echo 0)
            TASK_STATUS="${TASK_STATUS}\n- ${TF}: ${DONE}/${TOTAL} done"
        fi
    done

    # 팀원 상태 (registry)
    local REGISTRY="$PROJECT_DIR/.claude/runtime/teammate-registry.json"
    local TEAMMATES=""
    if [ -f "$REGISTRY" ]; then
        TEAMMATES=$(jq -r '.members | to_entries[] | "\(.key): \(.value.state)"' "$REGISTRY" 2>/dev/null || echo "no registry")
    fi

    cat > "$STATE_FILE" << EOF
## Session State (auto-saved)
- Timestamp: $TIMESTAMP
- Team: $TEAM
- Tasks:$(echo -e "$TASK_STATUS")
- Teammates: $TEAMMATES
- Note: This file is auto-generated. Current state may differ.
EOF

    echo "CHECKPOINT: SESSION-STATE.md saved at $TIMESTAMP"
}
```

---

## 6. TDD 테스트 설계

### 6-1. COO 실패 테스트 (OFR-1~9)

```typescript
// ─── COO-3: PM 건너뛰기 ───
describe('OFR-1~3: COO-3 PM 건너뛰기 — pm-report 없으면 보고 차단', () => {
  let env: ReturnType<typeof createTestEnv>
  let hookPath: string

  beforeEach(() => {
    env = createTestEnv()
    // coo-chain-report.sh 준비 (broker mock 포함)
    hookPath = prepareCooChainReport(env, {
      mockBroker: { health: true, peers: ['mozzi-1'], sendOk: true },
      webhookOk: true,
    })
  })

  afterEach(() => cleanupTestEnv(env.tmpDir))

  it('OFR-1: last-pm-report.json 없으면 보고서 생성 안 함', () => {
    // pm-report 파일을 만들지 않음
    writeTeamContext(env.tmpDir, 'COO')
    const result = runHook(hookPath)
    expect(result.exitCode).toBe(0)
    // coo-smith-report.json이 생성되지 않아야 함
    const reportPath = join(env.tmpDir, '.claude/runtime/coo-smith-report.json')
    expect(existsSync(reportPath)).toBe(false)
  })

  it('OFR-2: 보고서에 pm_verdict 필드 필수', () => {
    writeTeamContext(env.tmpDir, 'COO')
    writePmReport(env.tmpDir)  // pm_verdict: 'pass' 포함
    const result = runHook(hookPath)
    const reportPath = join(env.tmpDir, '.claude/runtime/coo-smith-report.json')
    if (existsSync(reportPath)) {
      const report = JSON.parse(readFileSync(reportPath, 'utf-8'))
      expect(report.payload).toHaveProperty('pm_verdict')
      expect(report.payload.pm_verdict).toBeTruthy()
    }
  })

  it('OFR-3: chain_step이 "coo_report"', () => {
    writeTeamContext(env.tmpDir, 'COO')
    writePmReport(env.tmpDir)
    const result = runHook(hookPath)
    const reportPath = join(env.tmpDir, '.claude/runtime/coo-smith-report.json')
    if (existsSync(reportPath)) {
      const report = JSON.parse(readFileSync(reportPath, 'utf-8'))
      expect(report.payload.chain_step).toBe('coo_report')
    }
  })
})

// ─── COO-4: 숫자만 전달 ───
describe('OFR-4~6: COO-4 숫자만 전달 — 보고서 필수 필드 검증', () => {
  let env: ReturnType<typeof createTestEnv>
  let hookPath: string

  beforeEach(() => {
    env = createTestEnv()
    hookPath = prepareCooChainReport(env, {
      mockBroker: { health: true, peers: ['mozzi-1'], sendOk: true },
      webhookOk: true,
    })
    writeTeamContext(env.tmpDir, 'COO')
    writePmReport(env.tmpDir)
  })

  afterEach(() => cleanupTestEnv(env.tmpDir))

  it('OFR-4: task_file, match_rate, pm_verdict, pm_notes 전부 존재', () => {
    const result = runHook(hookPath)
    const reportPath = join(env.tmpDir, '.claude/runtime/coo-smith-report.json')
    if (existsSync(reportPath)) {
      const report = JSON.parse(readFileSync(reportPath, 'utf-8'))
      const p = report.payload
      expect(p).toHaveProperty('task_file')
      expect(p).toHaveProperty('match_rate')
      expect(p).toHaveProperty('pm_verdict')
      expect(p).toHaveProperty('pm_notes')
    }
  })

  it('OFR-5: match_rate가 숫자 0~100', () => {
    const result = runHook(hookPath)
    const reportPath = join(env.tmpDir, '.claude/runtime/coo-smith-report.json')
    if (existsSync(reportPath)) {
      const report = JSON.parse(readFileSync(reportPath, 'utf-8'))
      const rate = report.payload.match_rate
      expect(typeof rate).toBe('number')
      expect(rate).toBeGreaterThanOrEqual(0)
      expect(rate).toBeLessThanOrEqual(100)
    }
  })

  it('OFR-6: pm_notes 비어있지 않음', () => {
    const result = runHook(hookPath)
    const reportPath = join(env.tmpDir, '.claude/runtime/coo-smith-report.json')
    if (existsSync(reportPath)) {
      const report = JSON.parse(readFileSync(reportPath, 'utf-8'))
      expect(report.payload.pm_notes?.length).toBeGreaterThan(0)
    }
  })
})

// ─── COO-5: 중복 보고 (chain-messenger dedup) ───
describe('OFR-7~9: COO-5 중복 보고 — chain-messenger dedup', () => {
  let env: ReturnType<typeof createTestEnv>
  let messengerPath: string

  beforeEach(() => {
    env = createTestEnv()
    // chain-messenger.sh를 prepareHookWithHelpers로 준비
    messengerPath = prepareHookWithHelpers(
      join(PROJECT_DIR, '.claude/hooks/helpers/chain-messenger.sh'),
      env.tmpDir,
      env.hooksDir,
    )
  })

  afterEach(() => cleanupTestEnv(env.tmpDir))

  it('OFR-7: 동일 msg_id 2회 → 두 번째 dedup_skip', () => {
    // 1회 전송
    const r1 = runBashFunction(messengerPath,
      'send_chain_message "from1" "to1" "test" "msg-dup-001"; echo "STATUS=$SEND_STATUS"',
      { BROKER_URL: 'http://localhost:17899', CHAIN_RETRY_DELAY: '0' },
    )
    // 2회 전송 (동일 msg_id)
    const r2 = runBashFunction(messengerPath,
      'send_chain_message "from1" "to1" "test" "msg-dup-001"; echo "STATUS=$SEND_STATUS"',
      { BROKER_URL: 'http://localhost:17899', CHAIN_RETRY_DELAY: '0' },
    )
    expect(r2.stdout).toContain('dedup_skip')
  })

  it('OFR-8: 다른 msg_id → 정상 전송', () => {
    const r1 = runBashFunction(messengerPath,
      'send_chain_message "from1" "to1" "test" "msg-A"; echo "S1=$SEND_STATUS"',
      { BROKER_URL: 'http://localhost:17899', CHAIN_RETRY_DELAY: '0' },
    )
    const r2 = runBashFunction(messengerPath,
      'send_chain_message "from1" "to1" "test" "msg-B"; echo "S2=$SEND_STATUS"',
      { BROKER_URL: 'http://localhost:17899', CHAIN_RETRY_DELAY: '0' },
    )
    expect(r2.stdout).not.toContain('dedup_skip')
  })

  it('OFR-9: sent-log에 5분 지난 항목은 정리됨', () => {
    const logFile = join(env.tmpDir, '.claude/runtime/chain-sent.log')
    // 10분 전 항목 수동 기록
    const oldTs = Math.floor(Date.now() / 1000) - 600
    writeFileSync(logFile, `${oldTs}|old-msg-001\n`)
    // 새 전송 트리거 (stale 정리 발동)
    runBashFunction(messengerPath,
      'send_chain_message "f" "t" "p" "new-msg"; echo done',
      { BROKER_URL: 'http://localhost:17899', CHAIN_RETRY_DELAY: '0' },
    )
    const content = readFileSync(logFile, 'utf-8')
    expect(content).not.toContain('old-msg-001')
  })
})
```

### 6-2. 팀 실패 테스트 (OFR-10~23)

```typescript
// ─── TF-1: 승인 블로킹 ───
describe('OFR-10~12: TF-1 승인 블로킹 — validate-delegate 팀원 .claude/ 차단', () => {
  let env: ReturnType<typeof createTestEnv>
  let hookPath: string

  beforeEach(() => {
    env = createTestEnv()
    hookPath = prepareHookScript(
      join(PROJECT_DIR, '.claude/hooks/validate-delegate.sh'),
      env.tmpDir,
      env.hooksDir,
    )
  })

  afterEach(() => cleanupTestEnv(env.tmpDir))

  it('OFR-10: teammate + .claude/ 경로 → exit 2 차단', () => {
    const result = runHook(hookPath, {
      IS_TEAMMATE: 'true',
      TOOL_INPUT_FILE_PATH: '/Users/smith/projects/bscamp/.claude/hooks/test.sh',
    })
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain('BLOCKED')
  })

  it('OFR-11: teammate + src/ 경로 → exit 0 허용', () => {
    const result = runHook(hookPath, {
      IS_TEAMMATE: 'true',
      TOOL_INPUT_FILE_PATH: '/Users/smith/projects/bscamp/src/app/page.tsx',
    })
    expect(result.exitCode).toBe(0)
  })

  it('OFR-12: leader + .claude/ 경로 → exit 0 허용', () => {
    const result = runHook(hookPath, {
      IS_TEAMMATE: 'false',
      TOOL_INPUT_FILE_PATH: '/Users/smith/projects/bscamp/.claude/hooks/test.sh',
    })
    expect(result.exitCode).toBe(0)
  })
})

// ─── TF-2: sleep 폴링 ───
describe('OFR-13~14: TF-2 sleep 폴링 — hooks에 sleep 하드코딩 없음', () => {
  const HOOKS_DIR = join(PROJECT_DIR, '.claude/hooks')

  it('OFR-13: *.sh에 "sleep [0-9]" 하드코딩 없음 (retry delay 변수 제외)', () => {
    const files = readdirSync(HOOKS_DIR).filter(f => f.endsWith('.sh'))
    const violations: string[] = []

    for (const file of files) {
      const content = readFileSync(join(HOOKS_DIR, file), 'utf-8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        // sleep N 패턴 (변수 $VAR는 허용)
        if (/sleep\s+\d/.test(line) && !line.startsWith('#')) {
          violations.push(`${file}:${i + 1}: ${line}`)
        }
      }
    }

    expect(violations, `sleep 하드코딩 발견:\n${violations.join('\n')}`).toEqual([])
  })

  it('OFR-14: chain-messenger.sh의 sleep은 변수 사용', () => {
    const content = readFileSync(join(HOOKS_DIR, 'helpers/chain-messenger.sh'), 'utf-8')
    const sleepLines = content.split('\n').filter(l =>
      l.includes('sleep') && !l.trim().startsWith('#')
    )
    for (const line of sleepLines) {
      // sleep $VAR 또는 sleep "$VAR" 패턴만 허용
      expect(line, `하드코딩된 sleep: ${line}`).toMatch(/sleep\s+["']?\$/)
    }
  })
})

// ─── TF-3: 좀비 pane ───
describe('OFR-15~17: TF-3 좀비 pane — force-team-kill registry 검증', () => {
  // ... FK 테스트 패턴과 동일, 핵심만 재검증 ...
})

// ─── TF-4: TASK 미전달 ───
describe('OFR-18~19: TF-4 TASK 미전달 — team-context taskFiles 검증', () => {
  it('OFR-18: 현재 team-context.json의 taskFiles 비어있지 않음', () => {
    const ctxPath = join(PROJECT_DIR, '.claude/runtime/team-context.json')
    if (existsSync(ctxPath)) {
      const ctx = JSON.parse(readFileSync(ctxPath, 'utf-8'))
      expect(ctx.taskFiles?.length, 'taskFiles가 비어있음').toBeGreaterThan(0)
    }
  })

  it('OFR-19: taskFiles 경로가 실제 존재', () => {
    const ctxPath = join(PROJECT_DIR, '.claude/runtime/team-context.json')
    if (existsSync(ctxPath)) {
      const ctx = JSON.parse(readFileSync(ctxPath, 'utf-8'))
      const missing: string[] = []
      for (const tf of ctx.taskFiles || []) {
        if (!existsSync(join(PROJECT_DIR, '.claude/tasks', tf))) {
          missing.push(tf)
        }
      }
      expect(missing, `존재하지 않는 TASK:\n${missing.join('\n')}`).toEqual([])
    }
  })
})

// ─── TF-5: compaction 대비 ───
describe('OFR-20~22: TF-5 compaction — context-checkpoint.sh 검증', () => {
  let env: ReturnType<typeof createTestEnv>

  beforeEach(() => {
    env = createTestEnv()
    writeTeamContext(env.tmpDir, 'CTO')
    // TASK 파일 생성
    writeFileSync(join(env.tasksDir, 'TASK-TEST.md'),
      '---\nteam: CTO\nstatus: in-progress\n---\n# TASK\n- [x] 완료\n- [ ] 미완료\n')
  })

  afterEach(() => cleanupTestEnv(env.tmpDir))

  it('OFR-20: save_checkpoint → SESSION-STATE.md 생성', () => {
    const cpPath = join(env.hooksDir, 'helpers/context-checkpoint.sh')
    // checkpoint 스크립트 복사 + PROJECT_DIR 패치
    // ... prepareHookScript 패턴 ...
    const result = runBashFunction(cpPath, 'save_checkpoint', {
      PROJECT_DIR: env.tmpDir,
    })
    const statePath = join(env.tmpDir, '.claude/runtime/SESSION-STATE.md')
    expect(existsSync(statePath), 'SESSION-STATE.md 미생성').toBe(true)
  })

  it('OFR-21: SESSION-STATE에 Team, Tasks 필드', () => {
    // ... save_checkpoint 실행 후 ...
    const statePath = join(env.tmpDir, '.claude/runtime/SESSION-STATE.md')
    // 생성 후 내용 검증
    // const content = readFileSync(statePath, 'utf-8')
    // expect(content).toContain('Team:')
    // expect(content).toContain('Tasks:')
  })

  it('OFR-22: timestamp 포함', () => {
    // ... save_checkpoint 실행 후 ...
    // expect(content).toMatch(/Timestamp: \d{4}-\d{2}-\d{2}T/)
  })
})

// ─── TF-6: lock file ───
describe('OFR-23: TF-6 lock file — TASK 파일 경계 겹침 검증', () => {
  it('OFR-23: 같은 팀 TASK들의 수정 파일 목록에 겹침 없음', () => {
    const tasksDir = join(PROJECT_DIR, '.claude/tasks')
    const files = readdirSync(tasksDir).filter(f => f.startsWith('TASK-') && f.endsWith('.md'))

    // 각 TASK에서 "수정 파일" 테이블의 파일 경로 추출
    const filesByTask: Record<string, string[]> = {}
    for (const file of files) {
      const content = readFileSync(join(tasksDir, file), 'utf-8')
      // "| `path/to/file` |" 패턴 매칭
      const paths = [...content.matchAll(/\|\s*`([^`]+)`\s*\|/g)].map(m => m[1])
        .filter(p => p.includes('/'))  // 파일 경로만
      if (paths.length > 0) filesByTask[file] = paths
    }

    // 겹침 검사
    const taskNames = Object.keys(filesByTask)
    const overlaps: string[] = []
    for (let i = 0; i < taskNames.length; i++) {
      for (let j = i + 1; j < taskNames.length; j++) {
        const common = filesByTask[taskNames[i]].filter(p =>
          filesByTask[taskNames[j]].includes(p)
        )
        if (common.length > 0) {
          overlaps.push(`${taskNames[i]} ∩ ${taskNames[j]}: ${common.join(', ')}`)
        }
      }
    }

    expect(overlaps, `파일 경계 겹침:\n${overlaps.join('\n')}`).toEqual([])
  })
})
```

### 6-3. 체인 실패 테스트 (OFR-24~35)

```typescript
// ─── CF-1: Bearer 토큰 누락 ───
describe('OFR-24~26: CF-1 Bearer 누락 — webhook Authorization 검증', () => {
  it('OFR-24: chain-messenger.sh send_webhook_wake에 Authorization 포함', () => {
    const content = readFileSync(
      join(PROJECT_DIR, '.claude/hooks/helpers/chain-messenger.sh'), 'utf-8')
    // curl 명령에 -H "Authorization: Bearer 가 있는지
    expect(content).toMatch(/curl.*-H.*Authorization:\s*Bearer/)
  })

  it('OFR-25: OPENCLAW_WEBHOOK_TOKEN 비어있어도 fallback 토큰', () => {
    const content = readFileSync(
      join(PROJECT_DIR, '.claude/hooks/helpers/chain-messenger.sh'), 'utf-8')
    // 기본값 패턴: ${OPENCLAW_WEBHOOK_TOKEN:-mz-hook-...}
    expect(content).toMatch(/OPENCLAW_WEBHOOK_TOKEN:-[^}]+}/)
  })

  it('OFR-26: fallback 토큰 값이 비어있지 않음', () => {
    const content = readFileSync(
      join(PROJECT_DIR, '.claude/hooks/helpers/chain-messenger.sh'), 'utf-8')
    const match = content.match(/OPENCLAW_WEBHOOK_TOKEN:-([^}]+)}/)
    expect(match).toBeTruthy()
    expect(match![1].trim().length).toBeGreaterThan(5)
  })
})

// ─── CF-2: peer scope 불일치 ───
describe('OFR-27~29: CF-2 peer scope — peer-resolver fallback 검증', () => {
  let env: ReturnType<typeof createTestEnv>

  beforeEach(() => {
    env = createTestEnv()
  })

  afterEach(() => cleanupTestEnv(env.tmpDir))

  it('OFR-27: strategy 1 실패 → strategy 2 시도', () => {
    // peer-map.json에 stale ID → strategy 1 miss → strategy 2
    // (tmux 없으면 strategy 3으로 바로 넘어감)
    const resolverPath = prepareHookWithHelpers(
      join(PROJECT_DIR, '.claude/hooks/helpers/peer-resolver.sh'),
      env.tmpDir, env.hooksDir,
    )
    // ... peer-map에 존재하지 않는 ID 기록 → fallback 검증 ...
  })

  it('OFR-28: 3전략 순서대로 시도하는지', () => {
    const content = readFileSync(
      join(PROJECT_DIR, '.claude/hooks/helpers/peer-resolver.sh'), 'utf-8')
    // Strategy 1: peer-map.json
    const s1 = content.indexOf('peer-map.json')
    // Strategy 2: tmux
    const s2 = content.indexOf('tmux list-panes')
    // Strategy 3: summary
    const s3 = content.indexOf('summary')
    expect(s1).toBeLessThan(s2)
    expect(s2).toBeLessThan(s3)
  })

  it('OFR-29: 전부 실패 → RESOLVED_PEER_ID 빈 문자열', () => {
    // broker 응답: peers=[] (아무도 없음)
    // peer-map: 없음
    // tmux: 없음 (테스트 환경)
    const resolverPath = prepareHookWithHelpers(
      join(PROJECT_DIR, '.claude/hooks/helpers/peer-resolver.sh'),
      env.tmpDir, env.hooksDir,
    )
    const result = runBashFunction(resolverPath,
      'resolve_peer "NONEXIST_ROLE"; echo "ID=$RESOLVED_PEER_ID"',
      { BROKER_URL: 'http://localhost:19999' },  // dead port
    )
    expect(result.stdout).toContain('ID=')
    // ID= 뒤에 빈 문자열
    const id = result.stdout.match(/ID=(.*)/)?.[1]?.trim() || ''
    expect(id).toBe('')
  })
})

// ─── CF-3: PM→COO 미도착 ───
describe('OFR-30~32: CF-3 PM→COO 미도착 — pm-chain-forward 에러 처리', () => {
  let env: ReturnType<typeof createTestEnv>

  beforeEach(() => {
    env = createTestEnv()
  })

  afterEach(() => cleanupTestEnv(env.tmpDir))

  it('OFR-30: broker down → ACTION_REQUIRED 출력', () => {
    const hookPath = preparePmChainForward(env, {
      mockBroker: { health: false, peers: [], sendOk: false },
    })
    writeTeamContext(env.tmpDir, 'PM')
    writePmVerdict(env.tmpDir, 'pass', 'PM 검수 완료')
    writeCompletionReport(env.tmpDir)
    const result = runHook(hookPath)
    expect(result.stdout).toContain('ACTION_REQUIRED')
  })

  it('OFR-31: peer 못 찾음 → ACTION_REQUIRED 출력', () => {
    const hookPath = preparePmChainForward(env, {
      mockBroker: { health: true, peers: [], sendOk: false },  // peers 비어있음
    })
    writeTeamContext(env.tmpDir, 'PM')
    writePmVerdict(env.tmpDir, 'pass', 'PM 검수 완료')
    writeCompletionReport(env.tmpDir)
    const result = runHook(hookPath)
    expect(result.stdout).toContain('ACTION_REQUIRED')
  })

  it('OFR-32: send 실패 → ACTION_REQUIRED + PAYLOAD JSON', () => {
    const hookPath = preparePmChainForward(env, {
      mockBroker: { health: true, peers: ['mozzi-1'], sendOk: false },
    })
    writeTeamContext(env.tmpDir, 'PM')
    writePmVerdict(env.tmpDir, 'pass', 'PM 검수 완료')
    writeCompletionReport(env.tmpDir)
    const result = runHook(hookPath)
    expect(result.stdout).toContain('ACTION_REQUIRED')
    // PAYLOAD가 JSON 파싱 가능해야
    expect(result.stdout).toContain('"type"')
  })
})

// ─── CF-4 + CF-5: TaskCompleted 미발동 ───
describe('OFR-33~35: CF-4 TaskCompleted 미발동 — 체인 전제 조건', () => {
  it('OFR-33: settings.local.json TaskCompleted에 pdca-chain-handoff.sh 등록', () => {
    const raw = readFileSync(
      join(PROJECT_DIR, '.claude/settings.local.json'), 'utf-8')
    const settings = JSON.parse(raw)
    const hooks = settings.hooks?.TaskCompleted || []
    const chainHook = hooks.find((h: any) =>
      h.command?.includes('pdca-chain-handoff.sh')
    )
    expect(chainHook, 'pdca-chain-handoff.sh가 TaskCompleted에 미등록').toBeTruthy()
  })

  it('OFR-34: 전제 조건 충족 → chain 출력 (exit 0, non-empty stdout)', () => {
    const env = createTestEnv()
    try {
      const hookPath = prepareChainHandoffV2(env, {
        changedFiles: ['src/app/api/test.ts'],
        rate: 97,
        mockBroker: { health: false, peers: [], sendOk: false },
      })
      writeTeamContext(env.tmpDir, 'CTO')
      writeAnalysisFile(env.tmpDir, 97)
      const result = runHook(hookPath)
      // exit 0이고 체인 관련 출력이 있어야 (ACTION_REQUIRED 또는 자동 전송)
      expect(result.exitCode).toBe(0)
      expect(result.stdout.length).toBeGreaterThan(0)
    } finally {
      cleanupTestEnv(env.tmpDir)
    }
  })

  it('OFR-35: team-context 없으면 silent exit 0', () => {
    const env = createTestEnv()
    try {
      const hookPath = prepareChainHandoffV2(env, {
        changedFiles: ['src/app/api/test.ts'],
        rate: 97,
        mockBroker: { health: false, peers: [], sendOk: false },
      })
      // team-context.json을 만들지 않음
      const result = runHook(hookPath)
      expect(result.exitCode).toBe(0)
      // ACTION_REQUIRED 없어야 (비대상)
      expect(result.stdout).not.toContain('ACTION_REQUIRED')
    } finally {
      cleanupTestEnv(env.tmpDir)
    }
  })
})
```

### 6-4. writePmVerdict helper (helpers.ts에 이미 존재) 참고

기존 helpers.ts에 `writePmVerdict`, `writePmReport`, `writeCompletionReport`, `prepareCooChainReport`, `preparePmChainForward`, `prepareChainHandoffV2`가 전부 있으므로 추가 helper 불필요. `context-checkpoint.sh`용 `prepareContextCheckpoint` helper만 추가.

---

## 7. 구현 순서 (Wave)

### Wave 1: TDD Red (테스트 먼저)
- [ ] W1-1: `__tests__/hooks/ops-failure-regression.test.ts` 작성 (OFR-1~35, 35건)
- [ ] W1-2: Fixtures 3개 작성 (`coo_report_valid.json`, `coo_report_minimal.json`, `chain_sent_log_sample.txt`)
- [ ] W1-3: 전부 Red 확인 (`npx vitest run __tests__/hooks/ops-failure-regression.test.ts`)

### Wave 2: 코드 수정 (Green)
- [ ] W2-1: `.claude/hooks/validate-delegate.sh` — 팀원 .claude/ 차단 추가 (D5)
- [ ] W2-2: `.claude/hooks/helpers/chain-messenger.sh` — dedup 로직 추가 (D7/D6)
- [ ] W2-3: `.claude/hooks/helpers/context-checkpoint.sh` — **신규** (D8-2)
- [ ] W2-4: `.claude/hooks/helpers/hook-output.sh` — **신규** 공통 래퍼 (D8-1)
- [ ] W2-5: `.claude/hooks/task-quality-gate.sh` — hook-output 적용 (D8-1)
- [ ] W2-6: `.claude/hooks/pdca-chain-handoff.sh` — hook-output 적용 (D8-1)
- [ ] W2-7: `.claude/hooks/task-completed.sh` — hook-output 적용 (D8-1)
- [ ] W2-8: OFR-1~35 Green 확인

### Wave 3: CLAUDE.md + 설정 (D8-4)
- [ ] W3-1: CLAUDE.md에 서브에이전트 위임 규칙 추가
- [ ] W3-2: TASK 표준 템플릿에 "하지 말 것: .claude/ 직접 수정" 추가

### Wave 4: 검증
- [ ] W4-1: `npx vitest run __tests__/hooks/` — 전체 TDD Green
- [ ] W4-2: 기존 테스트 regression 없음 (chain-e2e 38건, regression 10건 유지)
- [ ] W4-3: Gap 분석 → `docs/03-analysis/agent-ops-hardening.analysis.md`
- [ ] W4-4: `.pdca-status.json` + `docs/.pdca-status.json` 업데이트

---

## 8. 파일 경계 (충돌 방지)

| 파일 | 담당 | 변경 유형 |
|------|------|----------|
| `__tests__/hooks/ops-failure-regression.test.ts` | backend-dev | **신규** |
| `__tests__/hooks/fixtures/coo_report_valid.json` | backend-dev | **신규** |
| `__tests__/hooks/fixtures/coo_report_minimal.json` | backend-dev | **신규** |
| `__tests__/hooks/fixtures/chain_sent_log_sample.txt` | backend-dev | **신규** |
| `.claude/hooks/validate-delegate.sh` | backend-dev | 수정 (+8줄) |
| `.claude/hooks/helpers/chain-messenger.sh` | backend-dev | 수정 (+35줄 dedup) |
| `.claude/hooks/helpers/hook-output.sh` | backend-dev | **신규** |
| `.claude/hooks/helpers/context-checkpoint.sh` | backend-dev | **신규** |
| `.claude/hooks/task-quality-gate.sh` | backend-dev | 수정 (echo→hook_log) |
| `.claude/hooks/pdca-chain-handoff.sh` | backend-dev | 수정 (echo→hook_log) |
| `.claude/hooks/task-completed.sh` | backend-dev | 수정 (echo→hook_log) |
| `CLAUDE.md` | leader | 수정 (서브에이전트 규칙 추가) |

---

## 9. 에러 처리

### chain-messenger dedup

| 상황 | 처리 |
|------|------|
| sent-log 파일 없음 | 신규 생성, 중복 아님으로 판단 |
| sent-log 파일 읽기 실패 | 중복 아님으로 판단 (안전 방향) |
| msg_id 미제공 (빈 문자열) | dedup 스킵, 기존 동작 유지 |
| stale 정리 중 mv 실패 | 원본 유지, 다음 호출에서 재시도 |

### validate-delegate .claude/ 차단

| 상황 | 처리 |
|------|------|
| IS_TEAMMATE 미설정 | 기본 false → 차단 안 함 (리더 취급) |
| TOOL_INPUT_FILE_PATH 비어있음 | 차단 안 함 (경로 불명 → 안전 방향) |
| jq 미설치 | TOOL_INPUT에서 파싱 실패 → 차단 안 함 |

### context-checkpoint

| 상황 | 처리 |
|------|------|
| team-context.json 없음 | "unknown" 팀으로 저장 |
| TASK 파일 없음 | 빈 상태로 저장 |
| registry 없음 | "no registry"로 저장 |
| 쓰기 실패 | stderr 경고, exit 0 (차단 안 함) |

---

## 10. 하지 말 것

- 기존 chain-e2e.test.ts (38건) 수정 금지 — 신규 파일로 추가
- 기존 regression.test.ts (10건) 수정 금지
- hook exit code 변경 금지 — 모든 hook은 기존대로 exit 0 (차단만 exit 2)
- coo-chain-report.sh의 보고서 포맷 변경 금지 — 필드 추가만 허용
- peer-resolver.sh의 3전략 순서 변경 금지
- CLAUDE.md에서 기존 규칙 삭제 금지 — 추가만
