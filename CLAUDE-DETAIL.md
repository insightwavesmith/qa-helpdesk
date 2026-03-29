# CLAUDE-DETAIL.md — 상세 프로토콜 + 운영 가이드

> **CLAUDE.md에서 분리된 상세 규칙.** 핵심 규칙은 CLAUDE.md, 상세 절차는 이 파일 참조.
> 삭제된 규칙 없음 — 전부 이 파일로 이동됨.

---

## PDCA 체인 핸드오프 상세 프로토콜

### 체인 흐름
```
CTO 완료 → hook 자체 QA(95%) → [pass] → PM 검수 → [pass] → COO → Smith님 대화형 보고
                                [fail] exit 2 → CTO 자체 수정
                                                 PM [fail] → FEEDBACK → CTO 수정
                                                 Smith님 반려 → COO → PM → CTO
```

### PM 검수 프로토콜 (W2-2)

PM팀이 CTO로부터 `COMPLETION_REPORT` 수신 시:

1. **Gap 분석 검증**: `docs/03-analysis/{기능}.analysis.md`를 열어 Match Rate + 불일치 항목 확인
2. **설계서 대조**: Plan/Design 문서와 구현 결과가 기획 의도에 부합하는지 판단
3. **판정**:
   - **pass** → COO에게 `COMPLETION_REPORT` (chain_step: `pm_to_coo`) 전송. pm_verdict: "pass", pm_notes에 검수 의견 포함.
   - **reject** → CTO에게 `FEEDBACK` (chain_step: `pm_to_cto`) 전송. issues 배열에 구체적 수정 사항 명시.
4. **PM은 Match Rate를 재계산하지 않음** — CTO가 산출한 수치를 신뢰. 기획 적합성만 판단.

### COO 보고 프로토콜 (W2-3)

COO(mozzi)가 PM으로부터 `COMPLETION_REPORT` 수신 시:

1. **COO는 Match Rate 검증 안 함** — PM 검수 완료 결과를 신뢰
2. **Smith님 보고 생성**: task_file, match_rate, pm_notes를 종합하여 대화형 보고
3. **Smith님 판단**:
   - **승인** → chain_step: `smith_ok`. 배포 가능 상태.
   - **반려** → COO가 `FEEDBACK` (chain_step: `coo_to_pm`)을 PM에게 전송. PM이 CTO에 재전달.
4. **COO 역할**: Smith님에게 요약+맥락+대화형 보고 담당. Smith님 피드백을 팀에 전달하는 인터페이스.

### 메시지 프로토콜 (`bscamp-team/v1`)

| 타입 | 용도 | 방향 |
|------|------|------|
| `COMPLETION_REPORT` | 완료 보고 | CTO→PM, PM→COO |
| `FEEDBACK` | 반려/수정 요청 | PM→CTO, COO→PM |
| `ACK` | 수신 확인 | 양방향 |

### chain_step 상태
```
cto_qa → cto_to_pm → pm_review → pm_to_coo → coo_report → smith_ok
                                                           smith_reject → coo_to_pm → pm_to_cto
```

### Hook 동작 (`pdca-chain-handoff.sh`, TaskCompleted #8)
- Match Rate < 95% → exit 2 (CTO 자체 수정, 메시지 발송 안 함)
- Match Rate ≥ 95% → stdout에 `ACTION_REQUIRED: send_message(PM_LEADER, COMPLETION_REPORT)` 출력
- 리더가 stdout을 읽고 MCP `send_message` 도구로 PM에게 전송
- broker 미기동 시 → 수동 fallback (차단하지 않음, exit 0)

---

## bkit PDCA 워크플로우 상세

### 폴더 구조 (iCloud 동기화)
```
docs/                                    ← iCloud 심볼릭 링크 (절대 삭제/이동 금지)
├── 01-plan/features/{기능}.plan.md      ← 요구사항, 범위, 성공 기준
├── 02-design/features/{기능}.design.md  ← 데이터 모델, API, 컴포넌트
├── 03-analysis/{기능}.analysis.md       ← Gap 분석 (설계 vs 구현)
├── 04-report/features/{기능}.report.md  ← 완료 보고서
├── mockup/                              ← UX 목업 (HTML/이미지)
└── .pdca-status.json                    ← 진행 상태 추적
```

### 실행 전 체크 (매 태스크)
```
□ docs/01-plan/features/{기능}.plan.md 있는가? → 없으면 작성
□ docs/02-design/features/{기능}.design.md 있는가? → 없으면 작성
□ .pdca-status.json에 해당 기능 상태 기록했는가?
→ 3개 다 YES여야 코딩 시작 가능
```

### 상태 업데이트 (절대 규칙)
각 단계 완료 시 반드시 아래 2개 파일 업데이트. 누락 시 작업 미완료 처리.
- `.pdca-status.json` (루트) — status, tasks, updatedAt
- `docs/.pdca-status.json` — features 객체에 phase, matchRate, documents, notes 추가/갱신
- **코딩 시작 전**: 두 파일에 해당 기능 항목 추가 (status: "implementing")
- **코딩 완료 후**: 두 파일 status를 "completed"로, matchRate, notes 갱신
- **커밋 전 최종 체크**: `.pdca-status.json` 업데이트 안 됐으면 커밋 금지

### 배포 후 런타임 검증 필수 (RET-004)
배포가 포함된 작업은 Match Rate만으로 완료 불가. 아래 3가지 추가 확인:
- **환경 체크**: IAM 권한, 환경변수, 네트워크 설정이 프로덕션에 반영됐는가?
- **로그 확인**: 배포 후 실제 요청 1회 → 에러 로그 0건 확인
- **핵심 플로우**: 로그인 → DB 쿼리 성공 → 데이터 표시 확인
- "배포 성공" ≠ "서비스 정상". 로컬 테스트 통과 ≠ 프로덕션 정상. **로그를 봐야 안다.**

### 역할별 담당
| 역할 | Plan | Design | Do | Check | Act |
|------|:----:|:------:|:--:|:-----:|:---:|
| **Leader** | 작성 | 작성+승인 | 분배 | 최종 검토 | 판단 |
| **frontend-dev** | - | 컴포넌트 설계 | 프론트 구현 | - | 프론트 수정 |
| **backend-dev** | - | API/DB 설계 | 백엔드 구현 | - | 백엔드 수정 |
| **qa-engineer** | - | - | - | Gap 분석 + QA | 버그 리포트 |

### Design 문서 필수 항목
```markdown
# {기능} 설계서
## 1. 데이터 모델 — 엔티티, 필드, 타입, 관계
## 2. API 설계 — Method, Endpoint, 요청/응답
## 3. 컴포넌트 구조 — 페이지 구성, 상태 관리
## 4. 에러 처리 — 에러 코드, 사용자 메시지
## 5. 구현 순서 — 체크리스트 (의존성 순서)
## 6. TDD 테스트 설계 — 테스트 코드 구조, mock, assert (L2/L3 필수)
```

> **L2/L3 Design에 `## 6. TDD 테스트 설계` 섹션이 없으면 Do 진입 차단.**
> validate-design.sh hook이 자동 검증. L0/L1은 면제.

### TDD 워크플로우 (L2/L3 전용 — 2026-03-28 적용)

**L2/L3 작업의 Do 단계는 TDD로 진행한다.**

```
테스트 먼저 작성 → 코드 구현 → 리팩터 (Red → Green → Refactor)
```

#### 테스트 프레임워크: vitest
#### 테스트 파일 경로: `__tests__/{feature}/*.test.ts`
#### Fixture 경로: `__tests__/{feature}/fixtures/*.json`

#### Plan 문서에 테스트 시나리오 필수 포함:
```markdown
## 성공 기준 (테스트 시나리오)
### Happy Path
- [API/함수] → [기대 결과]
### Edge Cases (P0/P1/P2)
- [예외 상황] → [기대 에러/fallback]
### Mock Data
- fixtures/{데이터}.json
```

#### TDD 진행 순서:
1. Plan의 테스트 시나리오 → `__tests__/{feature}/` 에 테스트 파일 작성
2. `npx vitest run __tests__/{feature}/` → 전부 실패 확인 (Red)
3. src/ 코드 구현 → 테스트 통과 (Green)
4. 리팩터 → 테스트 재통과

> L0/L1은 TDD 불필요. L2/L3만 적용.

### Check (Gap 분석) 필수 항목
```markdown
# {기능} Gap 분석
## Match Rate: XX%
## 일치 항목: ...
## 불일치 항목: ...
## 수정 필요: ...
```

---

## 에이전트팀 운영 상세

### 에이전트팀 정의 (세션별 역할 경계 — 2026-03-28 추가)

**세션 시작 시 "나는 어떤 팀인가?" 먼저 파악. 팀 역할 밖의 행동은 금지.**

| 팀 | 역할 | spawn 가능 | spawn 금지 | 산출물 범위 |
|----|------|-----------|-----------|------------|
| **PM** | 기획/분석/리서치 | pm-*, 리서치 에이전트, 분석 에이전트 | backend-dev, frontend-dev, qa-engineer | Plan, Design, 리포트, 목업 |
| **CTO** | 개발/구현/검증 | backend-dev, frontend-dev, qa-engineer | — | 코드, 테스트, 커밋, Gap 분석 |
| **마케팅** | 광고/콘텐츠/분석 | 분석 에이전트, 리서치 에이전트 | backend-dev, frontend-dev | 분석 문서, 전략, 크리에이티브 |

**핵심 규칙**:
- 기획팀이 "개발 진행" → **CTO팀에 핸드오프**. 직접 구현 팀원 spawn 금지.
- CTO팀이 "기획 변경 필요" → **PM팀에 핸드오프**. 직접 Plan 재작성 금지.
- 팀 간 인계: Plan/Design 문서 + TASK 파일이 인수인계서. 구두 전달 금지.
- 세션 팀 식별: `team-context.json` 또는 세션 초반 작업 맥락으로 판단.

### 실행 환경 (절대 규칙)
| 항목 | 값 | 비고 |
|------|-----|------|
| **실행 방식** | tmux 세션 | nohup/background 금지 |
| **모델** | Opus 4.6 / Sonnet 4.6 | 팀원 구성 패턴 참조 |
| **사고 모델** | thinking high | 반드시 활성화 |
| **에이전트팀** | 활성화 | CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 |
| **컨텍스트** | 1M (100만 토큰) | Max 플랜 기본 포함 |
| **세션 종료** | 수동 (자동종료 없음) | compaction으로 자동 관리 |
| **퍼미션** | bypassPermissions | 퍼미션 프롬프트 차단 방지 |

### 세션 관리
- **1M 컨텍스트**: 여러 TASK를 세션 이어서 진행 가능
- **50% 도달 시**: `/compact` 수동 실행. dumb zone(70-90%) 진입 전에 정리. 50%에서 compact하면 핵심 컨텍스트 유지율이 높다.
- **70% 이상**: compact 안 했으면 즉시 실행. 이 구간부터 품질 저하 시작.
- **90% 도달 시**: compaction이 자동 처리. 세션 종료하지 마라. 작업 계속 진행.
- **Plan→Do 전환**: Plan 세션의 탐색/질의 컨텍스트는 구현에 불필요. Plan 확정 후 새 세션에서 plan 파일만 로드하고 구현 시작 권장.
- **TASK 연속 진행**: 이전 TASK 컨텍스트 유지가 유리하면 세션 이어서 진행

### PDCA 기록 (리더 전용 의무 — 2026-03-28 추가)

**PDCA 상태 파일(docs/.pdca-status.json)과 TASK 체크박스 관리는 리더만의 책임이다.**
팀원은 PDCA 개념에 포함되지 않으며, PDCA 관련 hook은 팀원을 즉시 통과시킨다.

**팀원 완료 → 리더에게 보고 → 리더가 PDCA 기록.** 이것이 유일한 흐름.

#### TeamDelete 전 필수 (validate-pdca-before-teamdelete.sh가 강제):
1. `docs/.pdca-status.json` — updatedAt, phase, completedTasks, notes 갱신
2. `.claude/tasks/TASK-*.md` — 완료 항목 체크박스 처리
3. 위 2개 완료 후 TeamDelete 실행

- TeamDelete 시도 시 docs/.pdca-status.json이 10분+ 미갱신이면 **자동 차단**
- 팀원의 모든 PDCA hook → IS_TEAMMATE=true → 즉시 exit 0 (통과)
- pdca-update.sh, pdca-sync-monitor.sh, auto-team-cleanup.sh → 리더만 실행

### 팀원 구성 패턴

**Opus 4.6 (코드 구현/아키텍처 판단):**
- **backend-dev**: API, DB, 서버 로직
- **frontend-dev**: UI, 컴포넌트, 페이지
- **frontend-architect**: UI 아키텍처, 디자인시스템, React/Next.js
- **infra-architect**: AWS, K8s, Terraform, CI/CD
- **enterprise-expert**: 마이크로서비스, 엔터프라이즈 전략
- **security-architect**: 보안, OWASP, 인증 설계 리뷰

**Sonnet 4.6 (검증/분석/리포팅):**
- **qa-engineer**: tsc+build 검증, Gap 분석, 테스트
- **qa-strategist**: QA 전략, 품질 기준 수립
- **qa-monitor**: Docker 로그 실시간 모니터링, Zero Script QA
- **code-analyzer**: 코드 품질, 보안, 성능 분석
- **gap-detector**: 설계 vs 구현 Gap 분석
- **design-validator**: 설계 문서 완성도/일관성 검증
- **bkend-expert**: BaaS 백엔드, 인증, 데이터 모델링
- **report-generator**: PDCA 완료 보고서 생성
- **pdca-iterator**: Gap < 90% 자동 반복 개선
- **pipeline-guide**: 9단계 개발 파이프라인 가이드
- **starter-guide**: 초보자/비개발자 가이드

> PM팀(pm-lead, pm-discovery, pm-strategy, pm-research, pm-prd)은 별도 운영.

### Delegate 모드 (강제)
- Leader는 세션 시작 후 반드시 **Shift+Tab으로 delegate 모드 진입**
- delegate 모드에서 Leader가 할 수 있는 것: 팀원 생성, 메시지, 작업 배정, 태스크 관리
- delegate 모드에서 Leader가 할 수 없는 것: 코드 작성, 파일 수정, 빌드 실행
- Leader가 직접 코드를 쓰면 리젝

### Plan 승인 (강제)
- 팀원은 작업 시작 전 반드시 **계획을 먼저 세우고 Leader에게 승인 요청**
- Leader는 계획을 검토하고 승인 또는 수정 요청
- **승인 없이 구현 시작 = 작업 무효**
- 승인 기준: TASK.md의 "기대 동작"과 일치하는지, 파일 경계를 지키는지, 설계서와 충돌 없는지

### 병렬 위임 (Plan 확정 후)
- Plan 문서 확정 후, **독립적인 TASK는 여러 팀원에게 동시 위임** 가능
- 의존관계(dependsOn) 있는 TASK는 순차 진행 (선행 완료 후 후행 시작)
- 병렬 위임 시 Leader가 파일 경계를 반드시 명시 (충돌 방지)
- 팀원당 5~6개 TASK 최적. 팀원 수는 3~5명 이하 (조율 비용 증가 방지)
- **Wave 패턴**: Wave 1(DB/스키마) → Wave 2(API + UI 병렬) → Wave 3(검증)
- **Spawn 프롬프트 필수 항목**: 역할, TASK 목록, 소유 파일, 상류 계약(실제 타입/스키마 붙여넣기), 산출물 계약
- **계약 주입**: 추상 참조 대신 실제 TypeScript 타입/SQL 스키마를 spawn 메시지에 포함 (탐색 비용 제거)

### 파일 경계 (충돌 방지)
- **같은 파일을 2명 이상이 동시에 수정 금지**
- Leader가 작업 배정 시 팀원별 수정 가능 파일/디렉토리를 명시
- 공유 파일(types/, utils/) 수정이 필요하면 Leader가 순서 조율
- 경계 예시:
  - frontend-dev: `src/app/(main)/`, `src/components/`
  - backend-dev: `src/app/api/`, `src/actions/`, `src/lib/`, DB migration
  - qa-engineer: `docs/03-analysis/`, 테스트 파일

### TeammateIdle (자동 배정)
- 팀원이 할 일 끝나면 TeammateIdle hook이 자동으로 남은 TASK 확인
- 미완료 항목이 있으면 다음 작업 배정
- 전부 완료면 idle 허용 → 즉시 종료

### 팀원 종료 (절대 규칙 — 토큰 낭비 방지)
- **작업 완료 확인 즉시 TeamDelete 실행** — shutdown_request에 의존하지 말 것
- shutdown_request 1회 전송 후 10초 내 종료 안 되면 → TeamDelete로 팀 삭제
- 팀원이 idle 상태에서 대기하면 토큰이 지속 소모됨 — 절대 방치 금지
- Leader는 산출물 확인 + 커밋 완료 후 바로 TeamDelete
- 팀원 spawn 프롬프트에 반드시 포함: "작업 완료 후 Leader에게 보고하고 즉시 종료하세요"

### Split Pane (tmux)
- `agentTeamDisplay: "tmux"` 설정됨
- tmux 환경에서 팀원별 pane 분리 → 동시 모니터링 가능
- Shift+Up/Down: 팀원 선택, Enter: 팀원 세션 보기, Ctrl+T: 태스크 목록

### 리더 메모리 보존 (필수 — Validation 대상)

**시작과 끝에 반드시 정리. 이걸 안 하면 Validation 실패 처리.**

#### 세션 시작 시 (첫 번째 행동)
1. `~/.claude/agent-memory/leader/MEMORY.md` 읽기
2. 이전 세션 상태 파악 → 이어서 작업할지 새로 시작할지 판단
3. 시작 시간 + 받은 TASK 요약을 MEMORY.md 맨 위에 기록

#### 세션 종료 시 (마지막 행동)
1. `~/.claude/agent-memory/leader/MEMORY.md` 업데이트:
   - 완료된 태스크 (커밋 해시 포함)
   - 진행 중 태스크 (어디까지 했는지)
   - 남은 이슈 / 블로커
   - 변경된 파일 목록
   - 다음 세션에서 할 일
2. 이 파일이 없으면 TASK.md + 코드 상태로 파악

**검증**: SDK 완료 후 MEMORY.md의 마지막 업데이트 시간이 현재와 1시간 이내가 아니면 Validation 실패.

### 태스크 수행 순서 (강제)
```
1. TASK.md 읽기
2. 관련 파일 탐색 (TASK.md의 "관련 파일" 섹션 + 기존 docs)
3. research.md 작성 — 기존 코드 구조, 의존성, 수정 영향 범위 정리
   - "코드를 읽었다"는 증거. 이게 없으면 Plan 작성 불가.
   - 최소 포함: 수정 대상 파일 목록, 현재 동작 요약, 의존성 그래프
4. Plan 없으면 → docs/01-plan/features/{기능}.plan.md 작성
5. Design 없으면 → docs/02-design/features/{기능}.design.md 작성
6. .pdca-status.json 업데이트 (상태: designing → implementing)
7. 구현
8. Check → docs/03-analysis/{기능}.analysis.md 작성
9. Match Rate 90%+ 확인
10. .pdca-status.json 업데이트 (상태: completed)
11. openclaw gateway wake --text 'Done' --mode now
```

**2~3번이 핵심. 코드를 깊이 읽지 않고 Plan 쓰면 엉뚱한 설계가 나온다.**
**research.md 없이 바로 코딩하면 리젝된다.**

---

## SDK 실행 시 필수 프로세스 (hooks 대체)

settings.json hooks가 없는 환경(SDK 등)에서도 아래를 반드시 직접 실행한다.
이 규칙을 건너뛰면 코드 품질 검증 없이 배포되므로 절대 금지.

### 커밋 전 필수 실행 (순서대로)
```bash
# 1. 타입 체크
npx tsc --noEmit --quiet

# 2. 린트
npx next lint --quiet

# 3. 빌드
npm run build
```
3개 모두 에러 0이어야 커밋 가능. 하나라도 실패하면 수정 후 재실행.

### QA 필수 (qa-engineer 역할) — 백엔드/프론트 분리

구현 완료 후 반드시 qa-engineer에게 delegate:

**공통 (백엔드+프론트 모두):**
1. Gap 분석: 설계서(Design) vs 실제 구현 비교 → `docs/03-analysis/{기능}.analysis.md`
2. Match Rate 90%+ 확인
3. `npx tsc --noEmit && npm run build` 통과 → `touch /tmp/agent-build-passed`
4. `.pdca-status.json` 상태를 `completed`로 업데이트

**백엔드 (src/app/api/, src/lib/, services/):**
5. 코드 리뷰 실행 → `touch /tmp/agent-review-passed`

**프론트엔드 (src/app/(main)/, src/components/):**
5. 코드 리뷰 실행 → `touch /tmp/agent-review-passed`
6. 브라우저 QA: localhost:3000에서 변경 화면 확인 + 스크린샷 → `touch /tmp/agent-browser-qa-passed`

**마커 3개:**
- `/tmp/agent-build-passed` — tsc+build 통과 (공통)
- `/tmp/agent-review-passed` — 코드 리뷰 완료 (공통)
- `/tmp/agent-browser-qa-passed` — 브라우저 QA 완료 (프론트만)

마커 없이 commit/push 시 hook이 차단함. 마커는 커밋 후 자동 삭제 (1회성).

---

## TASK.md 작성 규칙

TASK.md를 작성할 때 각 기능별로 반드시 아래 3가지를 포함:

```
### T1: [기능명]
**이게 뭔지**: 한 줄로 이 기능이 뭔지 설명
**왜 필요한지**: 이 태스크가 나온 배경/맥락 (코드 리뷰 결과, 유저 피드백, 스펙 Gap 등)
**구현 내용**: 구체적으로 뭘 해야 하는지
```

예시:
```
### T1: Supabase 타입 재생성
**이게 뭔지**: DB 스키마에 맞는 TypeScript 타입 파일을 재생성하는 것
**왜 필요한지**: ai_summary, importance_score 등 새 컬럼 추가 후 타입이 안 맞아서 `(supabase as any)` 15군데 사용 중 → 타입 안전성 저하
**구현 내용**: `supabase gen types` 실행 → database.types.ts 갱신 → as any 제거
```

이 규칙을 지키지 않은 TASK.md는 리젝된다.

### TASK.md 타입별 행동 규칙 (절대 준수)

TASK.md의 `## 타입` 섹션을 반드시 확인 후 실행:

| 타입 | 허용 | 금지 |
|------|------|------|
| **목업** | HTML 목업 파일 생성, 보고서 작성 | src/ 코드 파일 수정, DB 변경 |
| **분석/리뷰** | 파일 읽기, 보고서 작성 | 모든 파일 수정 |
| **개발** | 코드 구현, DB 변경 | — |

**목업 또는 분석 타입에서 src/ 파일 수정 시도 = 즉시 중단 + Smith님 승인 요청**

---

## 개발 완료 후 QA (필수 — 건너뛰기 금지)
TASK.md의 `## 완료 후 QA` 섹션 실행:
1. `/bkit pdca check` 실행 → qa-strategist + qa-monitor 자동 수행
2. bkit QA 결과 확인 (Match Rate 90%+, Critical 0)
3. QA봇에게 결과 보고 (sessions_send → agent:qa-lead:main)

bkit QA는 코드/로그 기반 내부 검증. 브라우저 QA(고객 관점)는 QA봇이 별도 진행.

---

## 브라우저 QA (Chrome 확장)
- Claude Code Chrome 확장 설치됨. 에이전트팀이 직접 브라우저 QA 가능.
- 구현 완료 후 Chrome으로 localhost:3000 열어서 스크린샷 찍고 UI 검증할 것.
- 데스크탑(1920px) + 모바일(375px) 두 가지 뷰포트 확인 필수.
- 목업/디자인과 비교 → 차이점 발견 시 직접 수정.
- 콘솔 에러 확인.

## Skills (자동 로드)
`.claude/skills/`에 프로젝트 스킬 등록됨. 관련 작업 시 자동 참조:
- `nextjs-supabase.md` — App Router + Supabase 패턴
- `design-system.md` — 색상/폰트/반응형 규칙
- `email-parser.md` — 뉴스레터 BANNER_MAP + 파서 규칙
- `webapp-testing.md` — Playwright 브라우저 QA

## Git Worktree (병렬 작업 시)
팀원 간 파일 충돌 방지. 같은 파일 수정이 예상되면 worktree 사용:
```bash
# 팀원별 worktree 생성
git worktree add ../qa-helpdesk-frontend feature/frontend
git worktree add ../qa-helpdesk-backend feature/backend
# 작업 완료 후 머지
git merge feature/frontend
git worktree remove ../qa-helpdesk-frontend
```

## Hooks (자동 실행)
- **PreToolUse**: main 브랜치 경고 + claude -p 차단
- **TaskCompleted**: tsc 타입 체크 + lint 체크 + 모찌 알림 (OpenClaw webhook)
- **TeammateIdle**: 다음 태스크 자동 배정 (idle 방지)
- **Stop**: 컨텍스트 체크

## 플러그인
- **bkit** (v1.5.2) — PDCA 워크플로우, `/pdca plan {기능}`

---

## 프로젝트 파일 구조 (팀원 탐색 최소화용)
```
src/
├── actions/          ← Server Actions (DB CRUD)
│   ├── answers.ts    — 답변 생성/승인/거절 + embedQAPair 훅
│   ├── questions.ts  — 질문 생성 + AI 자동답변(createAIAnswerForQuestion)
│   ├── contents.ts   — 콘텐츠 CRUD
│   ├── embed-pipeline.ts — 임베딩 파이프라인 (embedContentToChunks)
│   ├── auth.ts       — 회원가입/로그인
│   ├── admin.ts      — 회원 관리 (역할 변경, 승인)
│   └── leads.ts, posts.ts, recipients.ts, search.ts, subscribers.ts
├── lib/              ← 핵심 비즈니스 로직
│   ├── knowledge.ts  — RAG 엔진 (454줄, generate(), buildSearchResults, ConsumerConfig)
│   ├── rag.ts        — generateRAGAnswer(), createAIAnswerForQuestion()
│   ├── gemini.ts     — Gemini API (embedding, flash, vision)
│   ├── qa-embedder.ts — QA 분리 임베딩 (embedQAPair)
│   ├── reranker.ts   — Gemini Flash reranking
│   ├── query-expander.ts — 쿼리 확장
│   ├── image-embedder.ts — Vision→텍스트→임베딩
│   ├── chunk-utils.ts — chunkText(700자, 100 overlap)
│   ├── supabase/     — client.ts, server.ts, middleware.ts
│   ├── email-*.ts    — 이메일/뉴스레터 렌더링
│   ├── newsletter-*.ts — 뉴스레터 스키마/템플릿
│   └── diagnosis/    — 광고 진단 엔진
├── app/
│   ├── (auth)/       — login, signup, pending, subscribe, unsubscribe
│   ├── (main)/admin/ — 관리자 페이지 (answers, content, email, knowledge, members, stats)
│   ├── (main)/dashboard/ — 역할별 대시보드
│   ├── (main)/posts/ — 정보공유 게시판
│   ├── (main)/questions/ — Q&A
│   └── (main)/protractor/ — 총가치각도기 (광고 진단)
├── components/       — 공통 UI (DashboardSidebar, ImageGallery 등)
├── types/            — database.ts, content.ts, supabase.ts
└── middleware.ts     — 인증 + 역할 기반 리다이렉트
```

### 핵심 의존성 흐름
```
questions.ts → rag.ts → knowledge.ts → gemini.ts
                                      → reranker.ts
                                      → query-expander.ts
answers.ts → qa-embedder.ts → gemini.ts → chunk-utils.ts
embed-pipeline.ts → gemini.ts → chunk-utils.ts
```

### DB 테이블 (주요)
- `profiles` — 사용자 (role: lead/member/student/alumni/admin)
- `questions` — Q&A 질문 (image_urls jsonb)
- `answers` — Q&A 답변 (image_urls jsonb, is_approved, is_ai_generated)
- `contents` — 콘텐츠 (body_md, email_summary, category, source_type)
- `knowledge_chunks` — RAG 벡터 (1,912개, embedding vector(768), source_type TEXT)
- `student_registry` — 수강생 명단 (78명, profiles와 미연결)
- `cohorts` — 기수 정보

---

## 배포 프로세스 (절대 규칙 — main push 전 QA 필수)

**main 브랜치 직접 push 금지. 반드시 아래 순서를 따른다.**

```
1. feature 브랜치 생성 (feat/xxx)
2. 구현 + tsc + lint + build 통과
3. feature 브랜치 push → PR 생성 → Vercel preview URL 자동 생성
4. preview URL에서 브라우저 QA (qa-engineer가 직접 실행)
   - 질문 목록/상세 페이지 정상 로드
   - 변경 기능 동작 확인
   - 기존 기능 깨짐 없는지 확인
   - 콘솔 에러 없는지 확인
   - QA 결과를 docs/03-analysis/{기능}.analysis.md에 기록
5. QA 통과 → touch /tmp/agent-qa-passed
6. main merge + push (validate-qa.sh hook이 마커 확인)
```

- **QA 안 하고 main push 시도 → validate-qa.sh가 차단 (exit 2) + 슬랙 노티**
- 긴급 핫픽스(장애 대응)만 예외: `git push --force` 직접 사용 가능
- feature 브랜치 push는 자유 (차단 없음)

## Vercel Preview QA 접근
- Preview URL에 `?x-vercel-protection-bypass=iMVr0xO0L5zsZczb6nrg2Ipei47Lzia1` 붙이면 인증 없이 접근 가능
- 예: `https://bscamp-git-feat-xxx-smith-kims-projects.vercel.app/?x-vercel-protection-bypass=iMVr0xO0L5zsZczb6nrg2Ipei47Lzia1`
- QA 테스트 계정: smith.kim@inwv.co / test1234!
