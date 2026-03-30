# Chain Context Fix (체인 자동화 근본 수정) Plan

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Chain Context Fix (체인 자동화 근본 수정) |
| 작성일 | 2026-03-30 |
| 프로세스 레벨 | L2 (hooks/runtime 수정) |
| 우선순위 | **P0-URGENT** |
| 배경 | 체인 자동화 구축 완료했으나 실전에서 **한 번도 자동 발동 안 됨**. TeamDelete가 team-context.json 삭제 → 직후 pdca-chain-handoff가 context 없어서 exit 0. 병렬 팀(CTO/CTO-2/PM) 동시 운영 시 단일 파일 덮어쓰기/삭제 충돌. |
| 항목 수 | 3건 (구조 변경 + 타이밍 수정 + 전체 hook 호환) |

### Value Delivered (4관점)

| 관점 | 내용 |
|------|------|
| **Problem** | 체인 자동화가 실전에서 0% 동작. TeamDelete→context 삭제→체인 끊김. 병렬 팀 충돌. |
| **Solution** | team-context 팀별 분리 + 삭제 대신 아카이빙 + 9개 hook 경로 통일 |
| **Function UX Effect** | 체인 자동 발동률 0% → 100%. 병렬 3팀 독립 운영. |
| **Core Value** | CTO→PM→COO→Smith 체인이 **실제로 자동으로 탄다.** |

---

## 장애 분석

### 직접 원인: TeamDelete → 삭제 → 체인 끊김

```
[시간순서]
1. CTO 팀 작업 완료 → 리더가 TeamDelete 호출
2. validate-pdca-before-teamdelete.sh 실행 (PreToolUse hook)
3.   → PDCA 파일 갱신 시간 체크 OK
4.   → rm -f team-context.json ← 여기서 삭제
5. TeamDelete 실행 → 팀원 종료
6. TaskCompleted 이벤트 발동 → task-completed.sh 실행
7.   → pdca-chain-handoff.sh 실행
8.   → [ ! -f "$CONTEXT_FILE" ] → exit 0  ← 체인 시작 안 됨
9. 아무 알림 없음. Smith님 모름.
```

**핵심**: TeamDelete의 PreToolUse hook이 context를 삭제하는데, TaskCompleted hook은 TeamDelete **이후**에 발동. 실행 순서가 삭제 → 참조.

### 구조적 원인: 단일 파일에 3팀이 충돌

```
team-context.json (1개 파일):
  CTO-1 세팅 → { "team": "CTO-1", ... }
  PM 세팅    → { "team": "PM", ... }     ← CTO-1 덮어씀
  CTO-2 세팅 → { "team": "CTO-2", ... }  ← PM 덮어씀

PM이 TeamDelete → rm -f team-context.json
  → CTO-1, CTO-2 체인도 전부 끊김
```

### 영향받는 Hook (9개)

| Hook | 사용 방식 | 장애 영향 |
|------|----------|----------|
| `pdca-chain-handoff.sh` | `.team`, `.taskFiles[0]` 읽기 | **체인 완전 끊김** |
| `task-completed.sh` | `.team`, `.taskFiles[]` 읽기 | BOARD.json 미갱신 |
| `pm-chain-forward.sh` | `.team` 읽기 (PM 필터) | PM 체인 끊김 |
| `teammate-idle.sh` | `.taskFiles[]`, `.team` 읽기 | idle 감지 실패 |
| `auto-team-cleanup.sh` | `load_team_context()` 호출 | cleanup 범위 오류 |
| `validate-pdca-before-teamdelete.sh` | `.team` 읽기 + **삭제** | 삭제 = 장애 근원 |
| `frontmatter-parser.sh` | `load_team_context()` 정의 | 모든 소비자 영향 |
| `context-checkpoint.sh` | `.team`, `.taskFiles[]` 읽기 | checkpoint 팀 누락 |
| `peer-resolver.sh` | `.team` 읽기 (self 식별) | peer 매칭 실패 |

---

## 구조 결정: 팀별 파일 분리 vs 단일 JSON 배열

### Option A: 팀별 파일 분리 (`team-context-{session}.json`)

```
.claude/runtime/
  team-context-sdk-cto.json    → { "team": "CTO-1", "session": "sdk-cto", ... }
  team-context-sdk-cto-2.json  → { "team": "CTO-2", "session": "sdk-cto-2", ... }
  team-context-sdk-pm.json     → { "team": "PM", "session": "sdk-pm", ... }
```

장점:
- **경합 제로** — 각 팀이 자기 파일만 읽기/쓰기
- TeamDelete가 자기 파일만 영향 — 다른 팀 context 안전
- 기존 hook의 `[ -f "$CONTEXT_FILE" ]` 패턴 유지 가능
- 구현 단순: 파일 경로만 세션명으로 분기

단점:
- 전체 팀 목록 필요 시 glob 스캔 (`team-context-*.json`)
- 각 hook에 "어떤 세션인지" 식별 로직 필요

### Option B: 단일 JSON에 팀 배열

```json
{
  "teams": {
    "sdk-cto": { "team": "CTO-1", ... },
    "sdk-pm": { "team": "PM", ... }
  }
}
```

장점:
- 파일 1개 유지, 전체 팀 상태 한눈에 파악

단점:
- **동시 쓰기 경합** — CTO와 PM이 동시에 jq로 수정하면 데이터 손실
- jq 쿼리 전부 변경 (`.team` → `.teams["sdk-cto"].team`)
- 더 복잡한 삭제 로직 (키 제거 vs 파일 삭제)
- lock 파일 필요 → 복잡도 급증

### **결론: Option A (팀별 파일 분리)**

이유:
1. **경합 문제가 근본 원인 중 하나**인데 Option B는 경합을 해결 못함
2. bash 기반 hook에서 파일 경합 방지하려면 flock 필요 → 과도한 복잡도
3. 기존 hook 패턴(`-f` 체크 → jq 읽기)을 최소 변경으로 유지 가능
4. 세션명은 tmux에서 즉시 획득 가능 (`tmux display-message -p '#{session_name}'`)

---

## 구현 범위

### 1. team-context 팀별 분리

**파일 경로 규칙**:
```
.claude/runtime/team-context-{SESSION_NAME}.json
```
- `SESSION_NAME` = tmux 세션명 (예: `sdk-cto`, `sdk-cto-2`, `sdk-pm`)
- tmux 없으면 (로컬 개발) → fallback: `team-context-local.json`

**공용 헬퍼 함수** — `helpers/team-context-resolver.sh` (신규):
```bash
# resolve_team_context() — 현재 세션의 team-context 파일 경로 반환
# 결과: TEAM_CONTEXT_FILE 변수에 경로 설정
#
# 탐색 순서:
# 1. 환경변수 TEAM_CONTEXT_FILE 이미 설정 → 그대로 사용 (테스트용)
# 2. tmux 세션명 → team-context-{session}.json
# 3. tmux 없음 → team-context-local.json
# 4. 신규 파일 없고 레거시 team-context.json 존재 → 레거시 파일 (마이그레이션)

resolve_team_context() {
    local PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"
    local RUNTIME_DIR="$PROJECT_DIR/.claude/runtime"

    # 이미 설정되어 있으면 (테스트 환경) 그대로
    if [ -n "${TEAM_CONTEXT_FILE:-}" ] && [ -f "$TEAM_CONTEXT_FILE" ]; then
        return 0
    fi

    # tmux 세션명 획득
    local SESSION_NAME
    SESSION_NAME=$(tmux display-message -p '#{session_name}' 2>/dev/null || echo "")

    if [ -n "$SESSION_NAME" ]; then
        TEAM_CONTEXT_FILE="$RUNTIME_DIR/team-context-${SESSION_NAME}.json"
    else
        TEAM_CONTEXT_FILE="$RUNTIME_DIR/team-context-local.json"
    fi

    # 신규 파일 없고 레거시 있으면 레거시 사용 (하위 호환)
    if [ ! -f "$TEAM_CONTEXT_FILE" ]; then
        local LEGACY="$RUNTIME_DIR/team-context.json"
        if [ -f "$LEGACY" ]; then
            TEAM_CONTEXT_FILE="$LEGACY"
        fi
    fi
}

# list_all_team_contexts() — 모든 활성 team-context 파일 목록
list_all_team_contexts() {
    local RUNTIME_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}/.claude/runtime"
    ls "$RUNTIME_DIR"/team-context-*.json 2>/dev/null | grep -v '.archived.'
}
```

**기존 hook 9개 수정 패턴** — 동일 패턴 적용:
```bash
# Before (현재):
CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"

# After (변경):
source "$(dirname "$0")/helpers/team-context-resolver.sh" 2>/dev/null
resolve_team_context
CONTEXT_FILE="$TEAM_CONTEXT_FILE"
```

**frontmatter-parser.sh `load_team_context()` 수정**:
```bash
# Before:
CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"

# After:
source "$(dirname "${BASH_SOURCE[0]}")/team-context-resolver.sh" 2>/dev/null
resolve_team_context
CONTEXT_FILE="$TEAM_CONTEXT_FILE"
```

이후 `load_team_context()`를 사용하는 hook(auto-team-cleanup.sh 등)은 자동 적용.

### 2. TeamDelete 순서 문제 해결

**현재 문제**: `rm -f` → context 소멸 → 체인 끊김

**해결**: 삭제 대신 **아카이빙**. 체인이 참조한 뒤 자동 정리.

`validate-pdca-before-teamdelete.sh` 변경:
```bash
# Before (현재):
rm -f "$CONTEXT_FILE"

# After:
ARCHIVED="${CONTEXT_FILE%.json}.archived.json"
mv "$CONTEXT_FILE" "$ARCHIVED"
echo "[PDCA 게이트] team-context 아카이빙 완료 (팀: $DELETED_TEAM)"
```

`resolve_team_context()` 아카이브 탐색 추가:
```bash
# 활성 파일 없으면 아카이브 체크 (체인 핸드오프용)
if [ ! -f "$TEAM_CONTEXT_FILE" ]; then
    local ARCHIVED="${TEAM_CONTEXT_FILE%.json}.archived.json"
    if [ -f "$ARCHIVED" ]; then
        TEAM_CONTEXT_FILE="$ARCHIVED"
    fi
fi
```

**아카이브 자동 정리** — `session-resume-check.sh`에 추가:
```bash
# 1시간+ 된 아카이브 파일 삭제
find "$RUNTIME_DIR" -name 'team-context-*.archived.json' -mmin +60 -delete 2>/dev/null
```

**실행 순서 보장**:
```
1. TeamDelete 호출
2. validate-pdca-before-teamdelete.sh → context 아카이빙 (삭제 아님)
3. TeamDelete 실행
4. TaskCompleted 발동 → pdca-chain-handoff.sh
5.   → resolve_team_context() → 활성 파일 없음 → 아카이브 발견 → 읽기 OK
6.   → 체인 정상 발동! ✅
7. (1시간 후) session-resume-check.sh → 아카이브 정리
```

### 3. 기존 hook 전부 호환

**수정 대상 9개 파일**:

| 파일 | 변경 내용 | 변경량 |
|------|----------|--------|
| `.claude/hooks/helpers/team-context-resolver.sh` | **신규** — resolve 로직 | ~50줄 |
| `.claude/hooks/helpers/frontmatter-parser.sh` | `load_team_context()` 경로 변경 | 3줄 |
| `.claude/hooks/pdca-chain-handoff.sh` | CONTEXT_FILE 해석 변경 | 3줄 |
| `.claude/hooks/task-completed.sh` | CONTEXT_FILE 해석 변경 | 3줄 |
| `.claude/hooks/pm-chain-forward.sh` | CONTEXT_FILE 해석 변경 | 3줄 |
| `.claude/hooks/teammate-idle.sh` | CONTEXT_FILE 해석 변경 | 3줄 |
| `.claude/hooks/auto-team-cleanup.sh` | frontmatter-parser 경유 (자동 적용) | 0줄 |
| `.claude/hooks/validate-pdca-before-teamdelete.sh` | rm → mv 아카이빙 | 3줄 |
| `.claude/hooks/helpers/context-checkpoint.sh` | CONTEXT_FILE 해석 변경 | 3줄 |
| `.claude/hooks/helpers/peer-resolver.sh` | CONTEXT_FILE 해석 변경 | 3줄 |

**하위 호환 보장**:
- 레거시 `team-context.json` 존재 시 자동 fallback (resolve 순서 4번째)
- 신규 파일 없고 레거시만 있으면 레거시 읽기 → 기존 TDD 53건 깨지지 않음
- 테스트에서 `TEAM_CONTEXT_FILE` 환경변수로 직접 주입 가능 → 기존 `writeTeamContext()` 헬퍼와 호환

---

## TDD 계획

### 신규 TDD — 병렬 팀 시나리오 (12건)

**CC (Chain Context) 시리즈**:

| ID | 시나리오 | 검증 내용 |
|----|---------|----------|
| **CC-1** | resolve_team_context tmux 세션 | sdk-cto → `team-context-sdk-cto.json` 경로 반환 |
| **CC-2** | resolve_team_context tmux 없음 | `team-context-local.json` fallback |
| **CC-3** | resolve_team_context 레거시 fallback | 신규 파일 없고 `team-context.json` 존재 → 레거시 반환 |
| **CC-4** | resolve_team_context 환경변수 override | `TEAM_CONTEXT_FILE` 설정 → 그대로 사용 |
| **CC-5** | 병렬 팀 독립 context | CTO + PM 동시 세팅 → 각각 별도 파일에 저장 확인 |
| **CC-6** | TeamDelete 아카이빙 | validate-pdca-before-teamdelete → `rm` 아닌 `mv .archived.json` |
| **CC-7** | 아카이브 체인 참조 | context 아카이빙 후 pdca-chain-handoff → 아카이브 읽기 → 체인 발동 |
| **CC-8** | TeamDelete 후 다른 팀 체인 정상 | PM TeamDelete → CTO context 영향 없음 → CTO 체인 정상 |
| **CC-9** | 아카이브 자동 정리 | 1시간+ 아카이브 → session-resume-check에서 삭제 |
| **CC-10** | task-completed 병렬 | CTO+PM 각각 TaskCompleted → 각 팀 BOARD.json 독립 갱신 |
| **CC-11** | context 없는 세션 silent exit | 어떤 context 파일도 없음 → exit 0 (기존 동작 유지) |
| **CC-12** | frontmatter-parser load_team_context 통합 | load_team_context() → resolver 경유 → 팀별 파일 읽기 |

### 회귀 TDD — 기존 53건 전부 통과

| 기존 스위트 | 건수 | 회귀 리스크 |
|------------|------|-----------|
| OFR-1~35 (P0 ops failure) | 35건 | 중간 — context 경로 변경 영향 (OFR-18,19,20,34,35) |
| EC-1~12 (error classifier) | 12건 | 낮음 — error-classifier는 context 미참조 |
| CDR-1~6 (chain dedup receiver) | 6건 | 낮음 — dedup은 context 미참조 |
| **합계** | **53건** | OFR 5건만 주의 |

**OFR 회귀 대응**:
- OFR-18,19,20: `writeTeamContext()` 헬퍼가 `runtimeDir/team-context.json`에 씀
  → 헬퍼에서 `TEAM_CONTEXT_FILE` 환경변수 설정하면 resolver가 그대로 사용 → 기존 테스트 코드 수정 불필요
- OFR-34,35: checkpoint + chain output 테스트
  → resolver의 환경변수 override(CC-4)로 호환

---

## 수정 파일 목록

| 파일 | 변경 | 담당 |
|------|------|------|
| `.claude/hooks/helpers/team-context-resolver.sh` | **신규** — resolve_team_context, list_all | backend-dev |
| `.claude/hooks/helpers/frontmatter-parser.sh` | load_team_context() 경로 → resolver | backend-dev |
| `.claude/hooks/pdca-chain-handoff.sh` | CONTEXT_FILE → resolver | backend-dev |
| `.claude/hooks/task-completed.sh` | CONTEXT_FILE → resolver | backend-dev |
| `.claude/hooks/pm-chain-forward.sh` | CONTEXT_FILE → resolver | backend-dev |
| `.claude/hooks/teammate-idle.sh` | CONTEXT_FILE → resolver | backend-dev |
| `.claude/hooks/validate-pdca-before-teamdelete.sh` | rm → mv 아카이빙 + resolver | backend-dev |
| `.claude/hooks/helpers/context-checkpoint.sh` | CONTEXT_FILE → resolver | backend-dev |
| `.claude/hooks/helpers/peer-resolver.sh` | CONTEXT_FILE → resolver | backend-dev |
| `.claude/hooks/session-resume-check.sh` | 아카이브 자동 정리 추가 | backend-dev |
| `__tests__/hooks/chain-context.test.ts` | **신규** — CC-1~12 TDD | backend-dev |
| `__tests__/hooks/helpers.ts` | writeTeamContext() 수정 — TEAM_CONTEXT_FILE 세팅 | backend-dev |

총 12파일 (신규 2, 수정 10)

---

## Wave 구성

### Wave 1: TDD Red (테스트 먼저)
- [ ] W1-1: `__tests__/hooks/chain-context.test.ts` — CC-1~12 작성
- [ ] W1-2: `__tests__/hooks/helpers.ts` — writeTeamContext() 에 `TEAM_CONTEXT_FILE` 환경변수 세팅 추가
- [ ] W1-3: 전부 Red 확인 + 기존 53건 Green 유지 확인

### Wave 2: 핵심 구현 (resolver + 아카이빙)
- [ ] W2-1: `team-context-resolver.sh` 신규 작성
- [ ] W2-2: `validate-pdca-before-teamdelete.sh` — rm → mv 아카이빙
- [ ] W2-3: `frontmatter-parser.sh` — load_team_context() resolver 연동
- [ ] W2-4: CC-1~7 Green 확인

### Wave 3: hook 전체 마이그레이션
- [ ] W3-1: `pdca-chain-handoff.sh` — resolver 연동
- [ ] W3-2: `task-completed.sh` — resolver 연동
- [ ] W3-3: `pm-chain-forward.sh` — resolver 연동
- [ ] W3-4: `teammate-idle.sh` — resolver 연동
- [ ] W3-5: `context-checkpoint.sh` — resolver 연동
- [ ] W3-6: `peer-resolver.sh` — resolver 연동
- [ ] W3-7: `session-resume-check.sh` — 아카이브 정리 추가
- [ ] W3-8: CC-8~12 Green 확인

### Wave 4: 회귀 검증
- [ ] W4-1: 기존 53건 TDD 전부 Green 확인
- [ ] W4-2: Gap 분석 → `docs/03-analysis/chain-context-fix.analysis.md`
- [ ] W4-3: `.pdca-status.json` 업데이트

---

## 의존성

| 항목 | 상태 |
|------|------|
| P0 완료 (OFR-1~35) | ✅ faa1d80 |
| P1 완료 (EC-1~12, CDR-1~6) | ✅ CTO-2 |
| team-context.json 스키마 | ✅ TC-1~8 이미 정의 |
| helpers.ts writeTeamContext() | ✅ 수정 범위 최소 |

**외부 의존성**: 없음. 완전 독립 구현.

---

## Phase 2 Plan과의 관계

| Phase 2 항목 | 이 TASK와의 관계 |
|-------------|----------------|
| **B2 runHeartbeatOnce** | 이 버그 수정 후에야 의미 있음. 체인이 안 타는데 즉시 patrol 해봐야 감지할 게 없음. |
| **B3 Memory flush** | team-context를 flush 대상에 포함하려면 팀별 파일 구조가 먼저 확정되어야 함. |
| **B1 requireApproval** | 독립. 관계 없음. |

**결론**: 이 TASK가 Phase 2의 **선행 조건**. 체인이 동작해야 B2/B3가 의미 있다.

---

## 예상 공수

| Wave | 내용 | 공수 |
|------|------|------|
| W1 | TDD Red (12건) | 0.3일 |
| W2 | resolver + 아카이빙 | 0.3일 |
| W3 | hook 7개 마이그레이션 | 0.3일 |
| W4 | 회귀 검증 + Gap | 0.1일 |
| **합계** | | **1일** |

변경 자체는 단순 (경로 해석 통일). 핵심은 회귀 없음 보장.

---

## 리스크

| 리스크 | 대응 |
|--------|------|
| tmux 세션명 획득 실패 | fallback: `team-context-local.json` |
| 기존 TDD가 `runtimeDir/team-context.json` 하드코딩 | `TEAM_CONTEXT_FILE` 환경변수 override로 호환 (CC-4) |
| 아카이브 파일 누적 | session-resume-check.sh에서 1시간+ 자동 삭제 |
| 레거시 team-context.json 잔존 | resolver fallback 순서 4번째로 처리 |

---

## PM 의견

1. **이게 P0-URGENT인 이유**: 체인 자동화를 6일 걸려 만들었는데 실전에서 0% 동작. 모든 자동 보고가 수동으로 돌아가고 있다. 이것부터 고쳐야 Phase 2(B2 heartbeat, B3 flush)가 의미 있다.

2. **Option A(팀별 파일) 선택 근거**: bash hook에서 파일 경합을 안전하게 처리하는 유일한 방법. Option B(단일 JSON)는 flock 없이는 동시 쓰기 데이터 손실 위험이 있고, bash에서 flock 관리는 과도한 복잡도.

3. **아카이빙이 핵심 아이디어**. "삭제하지 말고 치워두기"가 타이밍 문제를 근본 해결한다. 체인이 참조한 뒤 자연 소멸. 단순하고 안전하다.

4. **수정 패턴이 9개 hook에 동일** — `CONTEXT_FILE` 경로를 resolver로 교체하는 것뿐. 각 hook의 비즈니스 로직은 건드리지 않는다. 이게 회귀 리스크를 최소화하는 핵심.

5. **테스트 환경 호환이 관건**. 기존 53건 TDD는 `writeTeamContext()`로 `runtimeDir/team-context.json`에 쓴다. resolver의 `TEAM_CONTEXT_FILE` 환경변수 override가 이걸 깨지 않고 흡수해야 한다. CC-4 테스트가 이 보장을 검증한다.

## 검증 기준

- [ ] 병렬 팀(CTO + PM) 각각 체인 독립 동작 (CC-5, CC-8)
- [ ] TeamDelete 후 체인 정상 발동 (CC-7 — 현재 장애 시나리오 직접 검증)
- [ ] 다른 팀 체인 영향 0 (CC-8)
- [ ] TDD 커버리지: 신규 12건 + 기존 53건 = 65건 전부 Green
- [ ] Match Rate 90%+
