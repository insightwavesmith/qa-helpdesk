# CLAUDE.md — 프로젝트 규칙 (에이전트팀 필수 읽기)
# V3 자동화 검증

> 상세 프로토콜/운영 가이드는 `CLAUDE-DETAIL.md` 참조. 이 파일은 핵심 규칙만 수록.

## 세션 시작 필수 읽기 + 액션 (예외 없음)
```
1. 이 파일 (CLAUDE.md) — 규칙
2. docs/adr/ADR-002-service-context.md — 서비스 이해 (우리가 뭘 만드는지)
3. docs/adr/ADR-001-account-ownership.md — 설계 원칙
4. docs/postmortem/index.json — 과거 사고 교훈 (같은 실수 반복 방지)
5. .claude/tasks/ 폴더 — 현재 TASK 확인
6. [V3] set_summary 호출 (권장, 미호출 시 hook이 자동 등록):
   CTO: "CTO_LEADER | bscamp | {TASK명}"
   PM:  "PM_LEADER | bscamp | {TASK명}"
   COO: "MOZZI | bscamp | reporting"
7. [V2] bash .bkit/hooks/session-resume-check.sh
```
> 위 5개를 읽지 않고 작업 시작하면 리젝. 서비스를 이해하지 못한 코드는 의미 없다.
> 특히 4번 회고는 **마이그레이션, 대규모 변경, SDK 교체** 작업 시 반드시 해당 PM 항목 정독.

## 절대 규칙
0. **세션 시작 즉시 delegate 모드 진입**: Shift+Tab → delegate 모드. 팀원(frontend-dev, backend-dev, qa-engineer) 생성 후 작업 배정. Leader가 직접 코드 쓰면 리젝. 팀 없이 단독 작업 금지.
1. **코드 품질**: lint 에러 0개 유지. `npm run build` 반드시 성공.
2. **한국어 UI**: 모든 사용자 노출 텍스트는 한국어. 영어 라벨 금지.
3. **기존 파일 최소 변경**: 신규 파일 추가 선호. 기존 파일 대폭 수정 지양.
4. **디자인 시스템**: Primary `#F75D5D`, hover `#E54949`, Pretendard 폰트, 라이트 모드만.
5. **DB 안전**: RLS 정책 필수. SECURITY DEFINER → SET search_path = public. 변수명 테이블/타입과 겹치지 않게.
6. **bkit PDCA 강제**: 설계 문서 없이 코딩 시작 절대 금지.
7. **ADR 필독**: TASK 시작 전 `docs/adr/` 폴더의 ADR 전부 읽어라. 설계 원칙 빠뜨리면 리젝.
8. **SERVICE-VISION.md 필독**: TASK 시작 전 `~/.openclaw/workspace/SERVICE-VISION.md` 읽어라. 서비스를 모르고 개발하면 리젝.
9. **Destructive Detector**: rm -rf, force push, 전체 DELETE 등 위험 작업은 hook이 자동 차단. 우회 불가.

## T-PDCA 프레임워크 (공통규칙, 예외 없음)

**모든 업무는 T-PDCA 사이클을 따른다. T 단계 없이 팀 전달 = 절대 금지.**

```
T  → Task 정의 + Smith님 승인 (모찌가 TASK 작성 → Smith님 확인 → coo_approved: true)
P  → Plan  (L2-기능, L3만)
D  → Design (L1, L2, L3 — L0만 스킵)
Do → 구현 (CTO 리더가 팀원에 위임. 리더 직접 코드 수정 금지)
C  → Check (Gap 분석 + Match Rate)
A  → Act (완료 보고 + DB 동기화)
```

### 레벨별 PDCA 분기
| 레벨 | 대상 | PDCA 단계 | 프로세스 |
|------|------|-----------|---------|
| **L0** | 프로덕션 장애 | **CA** | CTO 리더 조사(범위 정의) → **팀원 구현** → 리더 배포 |
| **L1** | 버그 원인 명확 | **DCA** | CTO 리더 조사 → **팀원 구현** → QA → 리더 배포 |
| **L2-버그** | 버그 원인 불명 | **DCA** | CTO 리더 조사 → 팀원 수정 → Gap → 보고 |
| **L2-기능** | 요구사항 명확 | **PDCA** | PM Design → CTO 팀원 구현 → Gap → 보고 |
| **L3** | 요구 불명확/구조 변경 | **PDCA** | PM Plan+Design → CTO 팀원 구현 → Gap → 보안 감사 → 보고 |

**L0/L1이라도 리더가 직접 src/ 수정 금지. 조사+범위정의만 하고 팀원에게 구현 위임.**

### 자동 진행 규칙
1. 각 단계를 자동으로 진행한다. **물어보지 마라.**
2. PM이 Do 지시하면 = **바로 구현 시작. COO 확인 불필요.**
3. Plan/Design 문서가 없으면 → 작성하고 다음 단계로 넘어간다.
4. 구현(Do) → 완료 후 자동으로 Check(Gap 분석) 실행.
5. **멈추는 유일한 조건**: Check에서 Match Rate < 90%. 이 경우 Act(수정) 후 재검증.
6. Match Rate ≥ 90% → 완료 보고서 생성 → 다음 기능으로 자동 이동.

## PDCA 체인 핸드오프 프로토콜 (V2 — 2026-03-30 Smith님 확정)

**CTO → COO → Smith님. PM 검수 없음.**
- 프로토콜: `bscamp-team/v1` (COMPLETION_REPORT / ANALYSIS_REPORT / ACK)
- chain_step: `cto_to_coo → coo_report → smith_ok`
- Match Rate < 95% → CTO 자체 수정 후 재시도
- Match Rate ≥ 95% → COO 직접 전달 (PM 우회)
- L0/L1 → Match Rate 스킵 → COO 직접
- broker 미기동 시 → peer-roles.json fallback → 수동 보고 (exit 0)

> 상세: `CLAUDE-DETAIL.md` → "PDCA 체인 핸드오프 상세 프로토콜"

## 런타임 경로 (V3)

V3부터 hook 런타임 파일은 `.bkit/runtime/`에 저장한다. `.claude/` 경로의 승인 프롬프트 문제 해결.
- `peer-map.json` — PID 역추적 자동 등록 결과 (peer 식별 핵심)
- `team-context-*.json` — 팀별 컨텍스트
- `state.json` — 대시보드 상태 (broker + peer-map 병합)
- `hook-logs/` — hook 실행 로그
- `.claude/hooks/` 원본 보존 (읽기 전용), 실행 경로는 `.bkit/hooks/`

## 세션 시작 복구 프로토콜
세션 시작 시 반드시 실행:
```bash
bash .bkit/hooks/session-resume-check.sh
```
미완료 TASK/좀비 팀원이 감지되면 해당 항목부터 이어서 진행.

## PDCA 프로세스 레벨 시스템

**모든 작업은 T-PDCA를 거치되, 산출물 깊이만 조절한다.** 레벨은 hook이 자동 판단 (`detect-process-level.sh`).

| 레벨 | 대상 | Plan | Design | Check | Match Rate | 구현 방식 |
|------|------|------|--------|-------|------------|----------|
| **L0 응급** | fix:/hotfix: 커밋, 프로덕션 장애 | 커밋 메시지 1줄 | 스킵 | tsc+build만 | - | 리더 조사 → **팀원 구현** → 배포 |
| **L1 경���** | 버그 원인 명확, src/ 미수정 | TASK 1~3줄 | 상황별 | 결과물 존재 확인 | - | 리더 조사 → **팀원 구현** → QA → 배포 |
| **L2 표준** | src/ 수정 일반 기능 개발 | plan.md 필수 | design.md 필수 | Gap 분석 + tsc + build | 90%+ | Design 기반 **팀원 구현** |
| **L3 풀** | DB/Auth/인프라/마이그레이션 | plan.md + ADR | design.md + 롤백 전략 | Gap + 보안 감사 | **95%+** | Plan+Design 기반 **팀원 구현** |

자동 판단: `fix:`/`hotfix:` → L0, src/ 미수정 → L1, src/ 수정 → L2, migration/auth/.env 등 → L3.
L3 추가: ADR 필수, 롤백 전략 명시, Smith님 최종 승인 필수.
**모든 레벨에서 리더 직접 코드 수정 금지** — validate-delegate.sh가 차단.

## 배포 규칙 (V2 — 2026-03-30 Smith님 확정)

**모든 배포는 CTO 리더가 실행한다.** 팀원 배포 금지 (validate-deploy-authority.sh).
PM 검수 단계 없음. Gap 통과하면 바로 배포.

| 레벨 | 배포 조건 | 배포 명령 | 배포 후 |
|------|----------|----------|--------|
| **L0** | fix/hotfix 커밋 | 리더 즉시 배포 | COO 보고 |
| **L1** | src/ 미수정 | 배포 없음 | COO 보고 |
| **L2** | Gap 95%+ | 리더 배포 | COO 보고 |
| **L3** | Gap 95%+ | 리더 배포 | COO 보고 → Smith님 확인 |

### 배포 후 런타임 검증 (RET-004)
배포 성공 ≠ 서비스 정상. 배포 후 반드시:
1. Cloud Run 로그 확인 (에러 0건)
2. 핵심 플로우 1회 실행 (health check)

## bkit PDCA 워크플로우 (필수)

**L2/L3: Plan → Design → Do → Check → Act. L0/L1은 Plan/Design 스킵 가능.**

### 핵심 규칙
1. **Plan 먼저**: `01-plan/features/`에 Plan 문서가 없으면 → 작성부터
2. **Design 필수**: Plan이 있어도 Design이 없으면 → Design 작성 후 코딩
3. **코딩 중 설계서 참조**: 설계에 없는 기능 임의 추가 금지
4. **Check 필수**: 구현 완료 → Gap 분석 (설계 vs 코드 비교)
5. **Match Rate**: 90% 이상이어야 완료. 미만이면 Act(수정) 후 재검증
6. **기존 문서 확인**: 같은 기능의 이전 plan/design/analysis가 있으면 반드시 읽고 시작
7. **TDD (L2/L3)**: 테스트 먼저 작성 → 코드 구현 → 리팩터 (vitest, `__tests__/{feature}/`)
8. **TDD = Gap 100% 기준**: Design 문서의 TDD 섹션은 Design의 모든 동작을 1:1로 커버하도록 작성. Gap 분석 시 "Design에 있는데 테스트에 없음" = 0건이어야 함. TDD 케이스가 곧 Gap 검증 체크리스트.

> 상세 (폴더 구조, 역할별 담당, Design 템플릿, TDD 절차, Gap 분석 템플릿, 상태 업데이트 규칙): `CLAUDE-DETAIL.md` → "bkit PDCA 워크플로우 상세"

## 역할 경계 (A0-3 — 절대 불침범)

| 역할 | 할 것 | 하지 말 것 |
|------|-------|-----------|
| **Smith님** | 방향/의도 정의, 레벨 확인/승인, 최종 판단 | 직접 코딩, TASK 직접 작성 |
| **모찌(COO)** | T 단계 실행, TASK 작성, 레벨 판단, 팀 배정, 완료 판단 | 직접 코딩, Smith님 확인 없이 팀 전달, Plan/Design 작성 |
| **PM** | Plan + Design + TDD 케이스 작성 | src/ 코드 작성, 배포 |
| **CTO** | 구현 + QA + 배포 (리더는 조율만) | Plan/Design 없이 구현 시작 (L0/L1 예외) |

**CTO는 Plan/Design 없이 구현 시작 금지.** L0/L1도 리더가 조사+범위정의만 하고 팀원이 구현.
**PM이 Do 지시하면 바로 구현 시작.** COO 확인 불필요.

## 에이전트팀 운영 (필수 — 예외 없음)

### 리더-팀원 역할 분리

**리더(Lead)**: 팀 생성, TASK 분해/배정, 팀원 조율, 결과물 검증, Plan/Design 작성, PDCA 기록, 배포.
**리더 금지**: src/ 코드 직접 수정 (validate-delegate.sh가 차단), 팀원 없이 혼자 작업, gcloud 등 인프라 CLI 직접 실행.
**팀원(Teammate)**: 리더 배정 TASK 실행, 코드 작성/수정, 테스트 실행, 커밋.

### 핵심 운영 규칙
- **팀원 종료**: 작업 완료 확인 즉시 TeamDelete 실행. idle 방치 = 토큰 낭비.
- **파일 경계**: 같은 파일 2명 이상 동시 수정 금지. Leader가 경계 명시.
- **Plan 승인**: 팀원은 구현 전 계획 세우고 승인 요청. 승인 없이 시작 = 무효.
- **팀원 spawn 금지**: `.claude/` 디렉토리 직접 수정 금지 — 리더에게 보고.
- display mode: tmux (split panes) — `agentTeamDisplay: "tmux"` 설정

> 상세 (팀 정의, 실행 환경, 세션 관리, 팀원 구성 패턴, 병렬 위임, 리더 메모리, 태스크 수행 순서): `CLAUDE-DETAIL.md` → "에이전트팀 운영 상세"

## Plan Mode
- settings.json에 `defaultMode: "plan"` 설정됨
- Leader는 TASK.md 받으면 **먼저 Plan Mode로 코드 탐색** → 계획 수립 → 승인 후 구현
- Shift+Tab으로 Normal/Plan/Delegate 전환

## 토큰 최적화: 서브에이전트 위임

**리더는 탐색/조사 작업을 서브에이전트에 위임한다. 리더 컨텍스트에는 결과 요약만 유입.**

| 작업 | 도구 | 모델 |
|------|------|------|
| 코드 탐색 (파일 찾기, 패턴 검색) | Agent(Explore, sonnet) | Sonnet |
| 기존 코드/테스트 패턴 조사 | Agent(Explore, sonnet) | Sonnet |
| 문서 검색 + 요약 | Agent(general, sonnet) | Sonnet |
| Gap 분석 | Agent(gap-detector, sonnet) | Sonnet |
| 코드 품질 검토 | Agent(code-analyzer, sonnet) | Sonnet |

### 리더가 직접 하는 것 (위임 금지)
- 아키텍처 판단/결정, PDCA 상태 파일 업데이트, 팀원 조율/메시지, 최종 품질 판단, 체인 메시지 전송

## 작업 완료 기준 (강제 — 스킵 불가)

- [ ] `npx tsc --noEmit --quiet` — 타입 에러 0개
- [ ] `npx next lint --quiet` — lint 에러 0개
- [ ] `npm run build` — 빌드 성공
- [ ] 기존 기능 깨지지 않음 확인

## 리더 필수 행동 (절대 스킵 금지)

**모든 TASK 완료 시 반드시 이 3단계를 실행해라:**
1. `git add . && git commit` — 산출물 커밋
2. `git push` — 원격 저장소 반영
3. task를 **completed** 상태로 변경 — 이게 있어야 COO한테 webhook 보고가 감

**완료 = 커밋 + TaskCompleted + 대시보드 DB 업데이트 + 슬랙 보고. 전부 없으면 미완료.**
문서만 작성하고 끝내는 건 "완료"가 아니다. 하나라도 빠지면 리젝.
- [ ] Gap 분석 문서 작성 (Match Rate 90%+)

**이 체크리스트를 실행하지 않고 "완료"라고 보고하면 리젝된다.**

## 작업 완료 보고 + 정리

**모든 TASK 완료 후 반드시 수행:**
1. **완료 보고서**: 완료 항목 + 커밋 해시, 미완료 + 사유, 다음 할 일, 교훈
2. **회고 기록** (사고 발생 시): `docs/retrospective/` 에 작성 + README.md 인덱스 추가
3. **팀 정리**: TeamDelete + 좀비 디렉토리 정리

## 총가치각도기 (Protractor) 지표 규칙
- **지표 정의 single source of truth**: `src/lib/protractor/metric-groups.ts`
- 지표 추가/수정/삭제 시 이 파일만 수정. 다른 곳에 하드코딩 금지.
- 설계서: `docs/02-design/features/protractor-refactoring.design.md`

## 기술 스택
- Next.js 15 (App Router), TypeScript, Tailwind CSS
- Cloud SQL (PostgreSQL), Firebase Auth, GCS, Cloud Run
- MDXEditor, Playwright

## 커밋 컨벤션
- 한글 작성. prefix: feat/fix/refactor/style/chore

## 개발 완료 상태 업데이트 (절대 규칙)
TASK 완료 후 반드시 `project-status.md`를 업데이트해라.
- 완료된 기능을 "완료" 섹션으로 이동 + 커밋 해시 기록
- 이 파일이 현재 프로젝트의 진행 상태 정본(source of truth)

## 에이전트팀 작업 완료 조건 (절대 규칙)
1. tsc + build 통과
2. feature 브랜치 push
3. **Cloud Run 배포 후 헬스체크 QA 필수**
4. QA 통과 → `/tmp/agent-qa-passed` 마커 생성
5. main merge 시 validate-qa.sh가 마커 확인 → 없으면 차단

> 상세 (SDK 필수 프로세스, QA 마커, TASK 작성 규칙, 배포 절차, 파일 구조): `CLAUDE-DETAIL.md`

## 모찌리포트 카테고리 규칙
- 리포트 생성 시 `/Users/smith/projects/mozzi-reports/REPORT-CATEGORIES.md` 읽고 카테고리 판단
- 파일명: `{YYYY-MM-DD}-{영문-케밥-케이스}.html`
- 디렉토리: `public/reports/{카테고리}/`
- 커밋 메시지: `리포트: {카테고리} - {제목}`

## 에러 분류 룰북
- 에러 분류 자동화: `.bkit/hooks/helpers/error-classifier.sh`
- 룰북: `docs/ops/error-rulebook.md`
- 분류만 자동, TASK 자동 생성 안 함.

## 운영 이슈 기재 (필수)
- **이슈 발견 시**: `docs/issues/operational-issues.md`에 즉시 기재. 미기재 시 완료 인정 안 함.
- **hook 차단 시**: block-logger.sh가 `.bkit/runtime/block-log.json`에 자동 기록. 세션 종료 시 operational-issues.md에 미반영 건 안내.
- **이슈 카테고리**: operational-issues(기술), agent-teams-bugs(팀 버그), infrastructure-issues(인프라), known-limitations(제약)

## 자기순환학습 (회고 + 자가발전)
- **postmortem**: `docs/postmortem/index.json` — 사고 후 회고. 세션 시작 시 postmortem-review-gate.sh가 관련 항목 안내.
- **prevention TDD**: postmortem마다 재발 방지 테스트 작성. prevention-tdd-tracker.sh가 누락 감지.
- **운영 이슈**: `docs/issues/operational-issues.md` — hook 차단/우회/데드락 등 운영 중 발견 이슈 축적.
- **순환 루프**: 이슈 축적 → 패턴 분석 → hook 개선 → 재발 감소. 크론이 block-log.json에서 반복 차단 패턴 감지 → 개선 TASK 자동 제안.
