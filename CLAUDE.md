# CLAUDE.md — 프로젝트 규칙 (에이전트팀 필수 읽기)

## 세션 시작 필수 읽기 (예외 없음)
```
1. 이 파일 (CLAUDE.md) — 규칙
2. docs/adr/ADR-002-service-context.md — 서비스 이해 (우리가 뭘 만드는지)
3. docs/adr/ADR-001-account-ownership.md — 설계 원칙
4. docs/retrospective/README.md — 과거 사고 교훈 (같은 실수 반복 방지)
5. .claude/tasks/ 폴더 — 현재 TASK 확인
```
> 위 5개를 읽지 않고 작업 시작하면 리젝. 서비스를 이해하지 못한 코드는 의미 없다.
> 특히 4번 회고는 **마이그레이션, 대규모 변경, SDK 교체** 작업 시 반드시 해당 RET 항목 정독.

## 절대 규칙
0. **세션 시작 즉시 delegate 모드 진입**: Shift+Tab → delegate 모드. 팀원(frontend-dev, backend-dev, qa-engineer) 생성 후 작업 배정. Leader가 직접 코드 쓰면 리젝. 팀 없이 단독 작업 금지.
1. **코드 품질**: lint 에러 0개 유지. `npm run build` 반드시 성공.
2. **한국어 UI**: 모든 사용자 노출 텍스트는 한국어. 영어 라벨 금지.
3. **기존 파일 최소 변경**: 신규 파일 추가 선호. 기존 파일 대폭 수정 지양.
4. **디자인 시스템**: Primary `#F75D5D`, hover `#E54949`, Pretendard 폰트, 라이트 모드만.
5. **DB 안전**: RLS 정책 필수. SECURITY DEFINER → SET search_path = public. 변수명 테이블/타입과 겹치지 않게.
6. **bkit PDCA 강제**: 설계 문서 없이 코딩 시작 절대 금지. 아래 워크플로우 필수.
7. **ADR 필독 (2026-03-20 추가)**: TASK 시작 전 `docs/adr/` 폴더의 ADR(Architecture Decision Record) 전부 읽어라. 설계 원칙(계정 종속 구조, Storage 경로 패턴 등)이 적혀있다. DB만 맞추고 Storage/API/프론트에서 원칙 빠뜨리면 리젝.
8. **SERVICE-VISION.md 필독 (2026-03-20 추가)**: TASK 시작 전 `~/.openclaw/workspace/SERVICE-VISION.md` 읽어라. 서비스가 뭘 하는 건지, 사용자 흐름이 뭔지 모르고 개발하면 리젝. 스타일만 복사하는 목업은 실패.
9. **Destructive Detector (2026-03-24 추가)**: rm -rf, force push, 전체 DELETE 등 위험 작업은 hook이 자동 차단. 우회 불가. 긴급 핫픽스만 Smith님 직접 실행.

## PDCA 자동 순차 진행 (공통규칙, 예외 없음)

**이 규칙은 모든 에이전트팀(CTO-1, CTO-2, PM, 마케팅)에 공통 적용된다.**

1. Plan → Design → Do → Check → Act 순서를 자동으로 진행한다. **물어보지 마라.**
2. Plan 문서가 없으면 → 작성하고 다음 단계로 넘어간다.
3. Design 문서가 없으면 → 작성하고 다음 단계로 넘어간다.
4. 구현(Do) → 완료 후 자동으로 Check(Gap 분석) 실행.
5. **멈추는 유일한 조건**: Check에서 Match Rate < 90%. 이 경우 Act(수정) 후 재검증.
6. Match Rate ≥ 90% → 완료 보고서 생성 → 다음 기능으로 자동 이동.
7. 각 단계 전환 시 Smith님에게 확인 묻지 않는다. 자동 진행이 기본값.

## bkit PDCA 워크플로우 (필수)

**모든 기능 개발은 이 순서를 따른다. 예외 없음.**
**코딩부터 시작하면 리젝한다. Plan → Design 문서가 docs/에 있어야 코딩 시작 가능.**

```
Plan → Design → Do → Check → Act
```

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

### ⚠ 실행 전 체크 (매 태스크)
```
□ docs/01-plan/features/{기능}.plan.md 있는가? → 없으면 작성
□ docs/02-design/features/{기능}.design.md 있는가? → 없으면 작성
□ .pdca-status.json에 해당 기능 상태 기록했는가?
→ 3개 다 YES여야 코딩 시작 가능
```

### 규칙
1. **Plan 먼저**: `01-plan/features/`에 Plan 문서가 없으면 → 작성부터
2. **Design 필수**: Plan이 있어도 Design이 없으면 → Design 작성 후 코딩
3. **코딩 중 설계서 참조**: 설계에 없는 기능 임의 추가 금지
4. **Check 필수**: 구현 완료 → Gap 분석 (설계 vs 코드 비교)
5. **Match Rate**: 90% 이상이어야 완료. 미만이면 Act(수정) 후 재검증
5-1. **배포 후 런타임 검증 필수 (RET-004)**: 배포가 포함된 작업은 Match Rate만으로 완료 불가. 아래 3가지 추가 확인:
   - **환경 체크**: IAM 권한, 환경변수, 네트워크 설정이 프로덕션에 반영됐는가?
   - **로그 확인**: 배포 후 실제 요청 1회 → 에러 로그 0건 확인
   - **핵심 플로우**: 로그인 → DB 쿼리 성공 → 데이터 표시 확인
   - "배포 성공" ≠ "서비스 정상". 로컬 테스트 통과 ≠ 프로덕션 정상. **로그를 봐야 안다.**
6. **상태 업데이트 (절대 규칙)**: 각 단계 완료 시 반드시 아래 2개 파일 업데이트. 누락 시 작업 미완료 처리.
   - `.pdca-status.json` (루트) — status, tasks, updatedAt
   - `docs/.pdca-status.json` — features 객체에 phase, matchRate, documents, notes 추가/갱신
   - **코딩 시작 전**: 두 파일에 해당 기능 항목 추가 (status: "implementing")
   - **코딩 완료 후**: 두 파일 status를 "completed"로, matchRate, notes 갱신
   - **커밋 전 최종 체크**: `.pdca-status.json` 업데이트 안 됐으면 커밋 금지
7. **기존 문서 확인**: 같은 기능의 이전 plan/design/analysis가 있으면 반드시 읽고 시작

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
```

### Check (Gap 분석) 필수 항목
```markdown
# {기능} Gap 분석
## Match Rate: XX%
## 일치 항목: ...
## 불일치 항목: ...
## 수정 필요: ...
```

## 에이전트팀 운영 (필수 — 예외 없음)

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

### 리더-팀원 역할 분리 (공통규칙, 예외 없음)

**이 규칙은 모든 에이전트팀(CTO-1, CTO-2, PM, 마케팅)에 공통 적용된다.**

#### 리더(Lead)가 하는 것:
- 팀 생성 + 팀원 spawn
- TASK 분해 + 팀원에게 배정
- 팀원 간 조율 (shared task list 관리)
- 팀원 결과물 검증/체크
- 기획서/설계서 작성 (Plan, Design 문서)
- 최종 결과 종합 + 보고
- **PDCA 기록 (리더 전용 의무)** — 아래 섹션 참조

#### 리더가 절대 안 하는 것:
- **src/ 코드 직접 수정 (validate-delegate.sh가 차단)**
- 직접 구현/코딩
- 팀원 없이 혼자 작업

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

#### 팀원(Teammate)이 하는 것:
- 리더가 배정한 TASK 실행
- 코드 작성/수정
- 다른 팀원과 직접 메시지로 소통 (리더 거치지 않아도 됨)
- shared task list에서 자기 TASK claim + 완료 보고

#### 팀원 구성 패턴 (필요할 때 꺼내 쓰기):

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

#### 핵심:
- display mode: tmux (split panes) — `agentTeamDisplay: "tmux"` 설정
- 팀원끼리 직접 소통 가능 — 리더가 중계할 필요 없음
- shared task list로 자동 coordination
- TeammateIdle hook으로 팀원 idle 시 자동 다음 TASK 배정
- **리더가 직접 코드 쓰면 리젝. validate-delegate.sh hook이 강제 차단.**

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

## Plan Mode
- settings.json에 `defaultMode: "plan"` 설정됨
- Leader는 TASK.md 받으면 **먼저 Plan Mode로 코드 탐색** → 계획 수립 → 승인 후 구현
- Shift+Tab으로 Normal/Plan/Delegate 전환

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

### 커밋 메시지 규칙
- 한글로 작성
- 컨벤션: feat/fix/refactor/style/chore

## 작업 완료 기준 (강제 — 스킵 불가)

**아래 5개를 직접 실행하지 않으면 작업 미완료로 간주한다. SDK 스크립트가 사후 검증도 하지만, 에이전트가 먼저 직접 실행해야 한다.**

- [ ] `npx tsc --noEmit --quiet` — 타입 에러 0개
- [ ] `npx next lint --quiet` — lint 에러 0개
- [ ] `npm run build` — 빌드 성공
- [ ] 기존 기능 깨지지 않음 확인
- [ ] Gap 분석 문서 작성 (Match Rate 90%+)

**이 체크리스트를 실행하지 않고 "완료"라고 보고하면 리젝된다.**

## 작업 완료 보고 + 정리 (강제 — 2026-03-26 추가)

**모든 TASK 완료 후 반드시 아래 3가지를 수행한다.**

### 1. 완료 보고서
세션 종료 전 Smith님에게 보고:
```
## 완료 보고
- 완료: [완료된 항목 목록 + 커밋 해시]
- 미완료: [진행중/미착수 항목 + 사유]
- 다음 할 일: [우선순위 순]
- 교훈: [이번에 발견한 패턴, 실수, 주의사항]
```

### 2. 회고 기록 (사고 발생 시)
버그 3건 이상 또는 장애 발생 시 `docs/retrospective/` 에 회고 파일 작성:
- 파일명: `{YYYY-MM-DD}-{주제}.md`
- 필수 항목: 사고 요약, 타임라인, 근본 원인, 재발 방지
- `docs/retrospective/README.md` 인덱스에 RET-XXX 추가

### 3. 팀 정리
- 팀원 전원 종료 확인 (TeamDelete)
- ~/.claude/teams/ 좀비 디렉토리 정리
- ~/.claude/tasks/ 좀비 디렉토리 정리
- **작업 완료 후 팀원이 idle 상태로 남아있으면 즉시 종료 — 토큰 낭비**

## TASK.md 작성 규칙 (텐동 → 에이전트팀)

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

---

## TASK.md 타입별 행동 규칙 (절대 준수)

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

## 총가치각도기 (Protractor) 지표 규칙
- **지표 정의 single source of truth**: `src/lib/protractor/metric-groups.ts`
- 지표 추가/수정/삭제 시 이 파일만 수정. 다른 곳에 하드코딩 금지.
- 설계서: `docs/02-design/features/protractor-refactoring.design.md`
- 설계서 갱신 안 하면 commit 차단됨 (validate-design.sh)

## 기술 스택
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (PostgreSQL + Auth)
- MDXEditor (마크다운 WYSIWYG 에디터)
- Playwright (브라우저 QA)

## 커밋 컨벤션
- feat: 새 기능
- fix: 버그 수정
- refactor: 리팩토링
- style: UI/스타일
- chore: 설정/빌드

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

## 개발 완료 상태 업데이트 (절대 규칙)

TASK 완료 후 반드시 `project-status.md`를 업데이트해라.
- 완료된 기능을 "완료" 섹션으로 이동
- 커밋 해시 기록
- 미완료 항목은 "개발 대기" 섹션에 유지
- 이 파일이 현재 프로젝트의 진행 상태 정본(source of truth)

## Vercel Preview QA 접근
- Preview URL에 `?x-vercel-protection-bypass=iMVr0xO0L5zsZczb6nrg2Ipei47Lzia1` 붙이면 인증 없이 접근 가능
- 예: `https://bscamp-git-feat-xxx-smith-kims-projects.vercel.app/?x-vercel-protection-bypass=iMVr0xO0L5zsZczb6nrg2Ipei47Lzia1`
- QA 테스트 계정: smith.kim@inwv.co / test1234!

## 에이전트팀 작업 완료 조건 (절대 규칙)
1. tsc + build 통과
2. feature 브랜치 push
3. **Vercel preview URL 브라우저 QA 필수** — bypass 시크릿으로 접근하여 주요 페이지 동작 확인
4. QA 통과 후 `/tmp/agent-qa-passed` 마커 생성
5. main merge 시 validate-qa.sh가 마커 확인 → 없으면 차단

preview QA 없이는 작업 완료로 인정하지 않는다.

## 모찌리포트 카테고리 규칙
- 리포트 생성 시 `/Users/smith/projects/mozzi-reports/REPORT-CATEGORIES.md` 읽고 카테고리 판단
- 파일명: `{YYYY-MM-DD}-{영문-케밥-케이스}.html`
- 디렉토리: `public/reports/{카테고리}/` (plan, architecture, mockup, research, marketing, review, release, task, qa, security, ops, analysis)
- 커밋 메시지: `리포트: {카테고리} - {제목}`
