# Chain Context Fix (체인 자동화 근본 수정) 설계서

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | Chain Context Fix (체인 자동화 근본 수정) |
| 작성일 | 2026-03-30 |
| Plan | docs/01-plan/features/chain-context-fix.plan.md |
| 프로세스 레벨 | L2 |

| 관점 | 내용 |
|------|------|
| 문제 | 체인 자동화 실전 동작률 0%. TeamDelete→context 삭제→체인 끊김. 병렬 3팀 단일 파일 충돌. |
| 해결 | team-context 팀별 파일 분리 + 삭제→아카이빙 + 9개 hook resolver 통일 |
| 기능/UX 효과 | 체인 자동 발동률 0%→100%. 병렬 팀 독립 운영. |
| 핵심 가치 | CTO→PM→COO→Smith 체인이 실제로 자동으로 탄다. |

---

## 1. team-context-resolver.sh (신규 헬퍼)

### 함수 설계

```bash
# resolve_team_context() — 현재 세션의 team-context 파일 경로를 TEAM_CONTEXT_FILE에 설정
#
# 탐색 순서:
# 1. TEAM_CONTEXT_FILE 환경변수 이미 설정 + 파일 존재 → 그대로 (테스트/외부 주입용)
# 2. tmux 세션명 → team-context-{session}.json
# 3. tmux 없음 → team-context-local.json
# 4. 신규 파일 없고 레거시 team-context.json 존재 → 레거시 (하위 호환)
# 5. 아카이브 파일 존재 → 아카이브 (TeamDelete 후 체인 참조용)

# list_all_team_contexts() — 모든 활성 team-context 파일 목록 (glob 스캔)
```

### 핵심 설계 결정

- **파일 경로 규칙**: `.claude/runtime/team-context-{SESSION_NAME}.json`
- tmux 세션명 획득: `tmux display-message -p '#{session_name}'`
- tmux 없으면: `team-context-local.json`
- **레거시 호환**: 신규 파일 없고 `team-context.json` 존재 시 fallback
- **아카이브 호환**: 활성+레거시 없고 `.archived.json` 존재 시 읽기 (체인 핸드오프용)

---

## 2. TeamDelete 아카이빙

### AS-IS → TO-BE

```
AS-IS (validate-pdca-before-teamdelete.sh L44-48):
  rm -f "$CONTEXT_FILE"

TO-BE:
  ARCHIVED="${CONTEXT_FILE%.json}.archived.json"
  mv "$CONTEXT_FILE" "$ARCHIVED"
```

### 실행 순서 보장

```
1. TeamDelete 호출
2. validate-pdca-before-teamdelete.sh → resolver로 CONTEXT_FILE 결정 → mv 아카이빙
3. TeamDelete 실행 → 팀원 종료
4. TaskCompleted 발동 → pdca-chain-handoff.sh
5.   → resolve_team_context() → 활성 없음 → 아카이브 발견 → 읽기 OK
6.   → 체인 정상 발동! ✅
7. (1시간 후) session-resume-check.sh → 아카이브 정리
```

---

## 3. Hook 마이그레이션 패턴 (9개 동일)

모든 hook에 적용하는 변경:

```bash
# Before:
CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"

# After:
source "$(dirname "$0")/helpers/team-context-resolver.sh" 2>/dev/null
resolve_team_context
CONTEXT_FILE="$TEAM_CONTEXT_FILE"
```

frontmatter-parser.sh의 `load_team_context()`도 동일 패턴으로 resolver 경유.

### 수정 대상

| 파일 | 변경 | source 경로 |
|------|------|------------|
| `helpers/team-context-resolver.sh` | **신규** | N/A |
| `helpers/frontmatter-parser.sh` | load_team_context() → resolver | `${BASH_SOURCE[0]}` 기준 |
| `pdca-chain-handoff.sh` | L22 CONTEXT_FILE | `$(dirname "$0")/helpers/` |
| `task-completed.sh` | L39 CONTEXT_FILE | `$(dirname "$0")/helpers/` |
| `pm-chain-forward.sh` | L22 CONTEXT_FILE | `$(dirname "$0")/helpers/` |
| `teammate-idle.sh` | L8 CONTEXT_FILE | `$(dirname "$0")/helpers/` |
| `validate-pdca-before-teamdelete.sh` | L44 rm → mv + resolver | `$(dirname "$0")/helpers/` |
| `helpers/context-checkpoint.sh` | L12 CONTEXT_FILE | `${BASH_SOURCE[0]}` 기준 |
| `helpers/peer-resolver.sh` | L85 CONTEXT_FILE (resolve_self) | `${BASH_SOURCE[0]}` 기준 |
| `session-resume-check.sh` | 아카이브 정리 추가 | `$(dirname "$0")/helpers/` |

---

## 4. 아카이브 자동 정리

`session-resume-check.sh`에 추가:

```bash
# 1시간+ 된 아카이브 파일 삭제
RUNTIME_DIR="$PROJECT_DIR/.claude/runtime"
find "$RUNTIME_DIR" -name 'team-context-*.archived.json' -mmin +60 -delete 2>/dev/null
```

---

## 5. helpers.ts (테스트 헬퍼) 수정

`writeTeamContext()` 변경:

```typescript
// AS-IS: team-context.json 하드코딩
writeFileSync(join(dir, 'team-context.json'), ...)

// TO-BE: 동일 파일에 쓰되 TEAM_CONTEXT_FILE 환경변수도 반환
// → 기존 테스트는 team-context.json에 쓰고 resolver의 레거시 fallback으로 호환
// → 신규 테스트는 반환된 경로를 TEAM_CONTEXT_FILE로 주입
```

**핵심**: 기존 `writeTeamContext()`의 시그니처와 동작은 변경하지 않음. 레거시 `team-context.json`에 쓰고, resolver의 레거시 fallback(탐색 순서 4번째)이 이를 읽음. 기존 53건 TDD 코드 수정 불필요.

신규 테스트용 헬퍼 추가:
```typescript
// 세션별 context 파일 작성
export function writeSessionTeamContext(
  tmpDir: string, sessionName: string, team: string, opts?: {...}
): string
```

---

## 6. TDD 설계 (CC-1~12)

| ID | 시나리오 | 검증 방식 | 기대 결과 |
|----|---------|----------|----------|
| CC-1 | resolve tmux 세션 | TMUX_SESSION=sdk-cto 환경변수 mock | `team-context-sdk-cto.json` 경로 |
| CC-2 | resolve tmux 없음 | TMUX='' | `team-context-local.json` 경로 |
| CC-3 | resolve 레거시 fallback | team-context.json만 존재 | 레거시 파일 경로 |
| CC-4 | resolve 환경변수 override | TEAM_CONTEXT_FILE 직접 설정 | 설정값 그대로 |
| CC-5 | 병렬 팀 독립 context | CTO+PM 각각 writeSessionTeamContext | 별도 파일에 저장 |
| CC-6 | TeamDelete 아카이빙 | validate-pdca-before-teamdelete 실행 | mv .archived.json |
| CC-7 | 아카이브 체인 참조 | context 아카이빙 후 resolve | 아카이브 파일 반환 |
| CC-8 | TeamDelete 후 다른 팀 정상 | PM TeamDelete → CTO context 확인 | CTO 파일 유지 |
| CC-9 | 아카이브 자동 정리 | 62분 전 archived 파일 생성 + session-resume-check | 파일 삭제 |
| CC-10 | task-completed 병렬 | CTO+PM 각각 context → BOARD 갱신 | 각 팀 독립 갱신 |
| CC-11 | context 없는 세션 | 모든 context 파일 없음 | exit 0 (기존 동작) |
| CC-12 | load_team_context 통합 | frontmatter-parser → resolver 경유 | 팀별 파일 읽기 |

### 테스트 환경 설계

- **tmux 세션명 mock**: resolver에서 tmux 명령 대신 환경변수 `_MOCK_SESSION_NAME` 을 먼저 체크
- **기존 53건 호환**: `writeTeamContext()`는 레거시 `team-context.json`에 쓰고, resolver fallback으로 읽힘
- **prepareHookWithHelpers() 확장**: `team-context-resolver.sh`도 helpers/ 복사 대상에 포함 (자동)

---

## 7. OFR 회귀 영향 분석

| OFR ID | 사용하는 context 경로 | 영향 | 대응 |
|--------|---------------------|------|------|
| OFR-18 | task-completed.sh → CONTEXT_FILE | 중간 | writeTeamContext() 레거시 파일 → resolver fallback |
| OFR-19 | teammate-idle.sh → CONTEXT_FILE | 중간 | 동일 |
| OFR-20 | pdca-chain-handoff.sh → CONTEXT_FILE | 중간 | 동일 |
| OFR-34 | context-checkpoint.sh → CONTEXT_FILE | 중간 | 동일 |
| OFR-35 | chain output 테스트 | 낮음 | CONTEXT_FILE 환경변수 override |
| 나머지 | context 미참조 | 없음 | 변경 없음 |

**보장 방식**: resolver의 레거시 fallback이 `team-context.json` 존재 시 그대로 읽음 → 기존 테스트 코드 수정 불필요.

---

## 8. 수정 파일 총괄

| 파일 | 변경 | 변경량 |
|------|------|--------|
| `.claude/hooks/helpers/team-context-resolver.sh` | **신규** | ~50줄 |
| `.claude/hooks/helpers/frontmatter-parser.sh` | load_team_context() resolver 연동 | ~5줄 |
| `.claude/hooks/pdca-chain-handoff.sh` | CONTEXT_FILE → resolver | ~3줄 |
| `.claude/hooks/task-completed.sh` | CONTEXT_FILE → resolver | ~3줄 |
| `.claude/hooks/pm-chain-forward.sh` | CONTEXT_FILE → resolver | ~3줄 |
| `.claude/hooks/teammate-idle.sh` | CONTEXT_FILE → resolver | ~3줄 |
| `.claude/hooks/validate-pdca-before-teamdelete.sh` | rm → mv + resolver | ~5줄 |
| `.claude/hooks/helpers/context-checkpoint.sh` | CONTEXT_FILE → resolver | ~3줄 |
| `.claude/hooks/helpers/peer-resolver.sh` | CONTEXT_FILE → resolver (resolve_self) | ~3줄 |
| `.claude/hooks/session-resume-check.sh` | 아카이브 정리 추가 | ~3줄 |
| `__tests__/hooks/chain-context.test.ts` | **신규** CC-1~12 | ~350줄 |
| `__tests__/hooks/helpers.ts` | writeSessionTeamContext() 추가 | ~15줄 |
