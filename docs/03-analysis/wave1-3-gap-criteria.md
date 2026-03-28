# Wave 1~3 Gap 분석 기준

> PM팀 선행 준비 — CTO-2 Wave 1~3 완료 시 즉시 Gap 분석 실행
> 작성: 2026-03-28
> Design: docs/02-design/features/agent-team-operations.design.md

---

## Gap 분석 방법

각 Wave별로 **설계 항목 vs 실제 구현**을 1:1 대조.
Match Rate = (일치 항목 / 전체 항목) × 100. 90% 이상이면 Pass.

---

## Wave 1: TASK 소유권 (13항목)

### W1-1: frontmatter-parser.sh

| # | 설계 항목 | 검증 방법 | Pass 기준 |
|---|----------|----------|----------|
| 1 | `parse_frontmatter_field()` 함수 존재 | `grep "parse_frontmatter_field" .claude/hooks/helpers/frontmatter-parser.sh` | 함수 정의 존재 |
| 2 | `scan_unchecked()` 함수 존재 | `grep "scan_unchecked"` | 함수 정의 존재 |
| 3 | `load_team_context()` 함수 존재 | `grep "load_team_context"` | 함수 정의 존재 |
| 4 | team 필드 파싱 | fixture TASK 파일로 `parse_frontmatter_field "team"` 실행 | "CTO" 반환 |
| 5 | status 필드 파싱 | `parse_frontmatter_field "status"` | "pending" 반환 |
| 6 | frontmatter 없는 파일 → team="" | 프론트매터 없는 fixture로 테스트 | 빈 문자열 반환 (크래시 안 함) |
| 7 | assignees 배열 파싱 | YAML 배열 포함 fixture | 에러 없이 처리 |

### W1-2: team-context.json

| # | 설계 항목 | 검증 방법 | Pass 기준 |
|---|----------|----------|----------|
| 8 | 파일 경로 `.claude/runtime/team-context.json` | `ls` 확인 | 경로 일치 |
| 9 | team, session, created 필드 | `jq '.team, .session, .created'` | 3개 필드 존재 + 비어있지 않음 |
| 10 | taskFiles 배열 | `jq '.taskFiles'` | 배열 타입 + TASK 파일명 포함 |

### W1-3: teammate-registry.json 초기화

| # | 설계 항목 | 검증 방법 | Pass 기준 |
|---|----------|----------|----------|
| 11 | 파일 경로 `.claude/runtime/teammate-registry.json` | `ls` 확인 | 존재 |
| 12 | 설계 스키마와 일치 (team, createdAt, updatedAt, shutdownState, members) | `jq 'keys'` | 5개 키 존재 |
| 13 | members 초기 상태 | `jq '.members | to_entries[] | .value.state'` | 전부 "active" 또는 "spawning" |

**Wave 1 합격: 13항목 중 12개 이상 (92%+)**

---

## Wave 2: 종료 자동화 (16항목)

### W2-1: auto-shutdown.sh

| # | 설계 항목 | 검증 방법 | Pass 기준 |
|---|----------|----------|----------|
| 1 | 파일 존재 `.claude/hooks/auto-shutdown.sh` | `ls` | 존재 + 실행 권한 |
| 2 | 3단계 프로토콜 구현 (graceful → force → cleanup) | 코드에서 3단계 흐름 확인 | 3단계 로직 존재 |
| 3 | `set_member_state()` 헬퍼 | `grep "set_member_state"` | 함수 정의 존재 |
| 4 | `set_member_terminated_by()` 헬퍼 | `grep "set_member_terminated_by"` | 함수 정의 존재 |
| 5 | `build_registry_from_config()` 헬퍼 | `grep "build_registry_from_config"` | 함수 정의 존재 |
| 6 | `cleanup_and_exit()` 헬퍼 | `grep "cleanup_and_exit"` | 함수 정의 존재 |
| 7 | is-teammate.sh source → 팀원 실행 차단 | `grep "is-teammate\|IS_TEAMMATE"` | 팀원이면 exit 0 |
| 8 | 리더 보호 (pane_index=0 skip) | `grep "pane_index.*0\|BLOCK"` | 리더 pane 보호 로직 |
| 9 | shutdownState 전이: running → shutdown_initiated → force_killing → cleanup → done | 코드에서 상태 전이 확인 | 5개 상태 전이 |
| 10 | registry updatedAt 갱신 | `grep "updatedAt"` | 상태 변경 시 갱신 |

### W2-2: force-team-kill.sh 수정

| # | 설계 항목 | 검증 방법 | Pass 기준 |
|---|----------|----------|----------|
| 11 | 레지스트리 갱신 추가 | `grep "teammate-registry\|registry"` | 종료 시 registry 업데이트 |
| 12 | terminatedBy = "force_kill" 마킹 | `grep "force_kill"` | 마킹 로직 |
| 13 | terminatedAt 타임스탬프 | `grep "terminatedAt"` | ISO 타임스탬프 기록 |
| 14 | 리더 보호: paneId=%0이면 BLOCK | 코드 확인 | **tmux 없어도 paneId 자체로 BLOCK** |
| 15 | PROJECT_DIR 변수 | `grep "PROJECT_DIR"` | 경로 변수 존재 |
| 16 | tmux kill-pane 후 fallback (이미 죽은 경우) | `grep "SKIP\|이미 종료"` | graceful 처리 |

**Wave 2 합격: 16항목 중 15개 이상 (94%+)**

> 특별 주의: 항목 14 (리더 보호) — 아까 TDD에서 실패한 버그. tmux 없는 환경에서도 반드시 BLOCK 되어야 함.

---

## Wave 3: Hook 정비 (9항목)

### W3-1: auto-team-cleanup.sh 수정

| # | 설계 항목 | 검증 방법 | Pass 기준 |
|---|----------|----------|----------|
| 1 | frontmatter-parser.sh source | `grep "source.*frontmatter-parser\|. .*frontmatter-parser"` | import 존재 |
| 2 | 팀 소속 TASK만 스캔 | `grep "team.*context\|load_team_context"` | 크로스팀 TASK 제외 로직 |
| 3 | auto-shutdown 호출 안 함 | `grep -v "auto-shutdown"` 또는 주석 처리 확인 | auto-shutdown 호출 없음 |
| 4 | 알림만 (echo/log) | 코드 확인 | kill/terminate 없이 알림만 |

### W3-2: settings.local.json

| # | 설계 항목 | 검증 방법 | Pass 기준 |
|---|----------|----------|----------|
| 5 | TeammateIdle: [] (빈 배열) | `jq '.hooks.TeammateIdle'` | `[]` 또는 누락 |
| 6 | teammate-idle.sh 미등록 | `grep "teammate-idle" .claude/settings.local.json` | 0건 |

### W3-3: CLAUDE.md 규칙 업데이트 초안

| # | 설계 항목 | 검증 방법 | Pass 기준 |
|---|----------|----------|----------|
| 7 | 팀 상시 유지 명시 | `grep "상시 유지\|세션.*유지"` | 문구 존재 |
| 8 | 종료 프로세스 변경 (auto-shutdown) | `grep "auto-shutdown"` | 새 종료 프로세스 기술 |
| 9 | 크로스팀 MCP 통신 규칙 | `grep "set_summary\|claude-peers\|MCP"` | 통신 규약 기술 |

**Wave 3 합격: 9항목 중 8개 이상 (89%+ → 반올림 90%)**

---

## TDD 재실행 기준 (Wave 4)

Wave 1~3 완료 후 전체 TDD 재실행:

```bash
npx vitest run __tests__/hooks/
```

### 기대 결과

| 테스트 파일 | 건수 | 기대 |
|------------|:----:|------|
| frontmatter-parser.test.ts | 기존 | 전부 pass |
| teammate-registry.test.ts | 기존 | 전부 pass |
| auto-shutdown.test.ts | 기존 | 전부 pass |
| force-team-kill.test.ts | 기존 | **E-5 포함 전부 pass** (리더 보호 수정됨) |
| auto-team-cleanup.test.ts | 기존 | 전부 pass |
| peers-lifecycle.test.ts | 기존 | **LIFE-1,2,4 pass** (Wave 0에서 broker 설치됨) |
| peers-mcp.test.ts | 기존 | 전부 pass |
| regression.test.ts | 기존 | 전부 pass |

**TDD 합격: 67건 중 67건 pass (100%)**
기존 5건 실패가 전부 해소되어야 함:
- E-5: force-team-kill 리더 보호 → Wave 2에서 수정
- LIFE-1,2,4: broker 미기동 → Wave 0에서 해소

---

## 종합 Gap 분석 합격 기준

| Wave | 항목 | 합격 |
|:----:|:----:|:----:|
| 0 | 21건 (별도 문서) | 20/21+ |
| 1 | 13건 | 12/13+ |
| 2 | 16건 | 15/16+ |
| 3 | 9건 | 8/9+ |
| TDD | 67건 | 67/67 |
| **합계** | **126건** | **Match Rate 90%+** |

---

## 실행 순서 (PM이 CTO 완료 보고 받은 후)

1. Wave 0 완료 보고 → `wave0-comm-verification.md` 21건 실행
2. Wave 1~3 완료 보고 → 이 문서의 38항목 + TDD 67건 실행
3. 결과를 `docs/03-analysis/agent-team-operations.analysis.md`에 기록
4. Match Rate 90%+ → 완료 보고
5. Match Rate < 90% → CTO에 수정 항목 전달 → 재검증
