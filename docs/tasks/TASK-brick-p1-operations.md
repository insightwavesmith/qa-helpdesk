# TASK: 브릭 P1 — 운영 품질 (7단계 구조 사고)

> 2026-04-04 모찌(COO) 작성. P0(E2E 기본) 완료 후 실행.

---

## Step 1: 재해석

P0이 끝나면: TASK 넣으면 문서 나오고, 역할 알고, 실패 보이고, 직원이 로그인해서 참여할 수 있다.

그 다음 뭐가 필요한가? **"돌아가긴 하는데 잘 돌아가게."**

구체적으로:
- 반려했는데 "왜 반려했는지" 안 전달됨 → CTO가 뭘 고쳐야 하는지 모름
- Slack 알림이 너무 많거나 정보가 부족
- 프로젝트마다 다른 에이전트 구성이 필요 (bscamp CTO ≠ brick-engine CTO)
- 에이전트에 도구 제한/스킬/MCP가 없음 → 위험한 명령 실행 가능

---

## Step 2: 기존 탐색

| 필요한 것 | 이미 있는 것 | 빠진 것 |
|-----------|-------------|---------|
| 반려 사유 전달 | approval Gate에 reject_reason 필드 ✅ | 다음 블록 프롬프트에 주입 ❌ |
| Slack 알림 정리 | SlackSubscriber 7개 이벤트 ✅, Link notify ✅ | verbose/기본 분리 ❌, 테스트 mock ❌ |
| 프로젝트별 에이전트 | brick-project-layer.design.md (34건 TDD) ✅ | 구현 ❌ |
| 에이전트 스킬 세팅 | .claude/agents/ 네이티브 지원 ✅, bkit 프롬프트 31개 ✅ | tools 제한 ❌, MCP 연결 ❌ |

외부 레퍼런스:
- alirezarezvani/claude-skills (248개, ⭐5,200+) — 역할별 스킬 패턴
- phuryn/pm-skills (PM 65개) — discovery→strategy→execution 체인
- Mission Control — skill-registry.ts, Skills Hub 패턴
- bkit agents/ — model, tools, disallowedTools, skills, permissionMode 구조

---

## Step 3: 축 분해

P1의 축은 3개:

### 축 A: 피드백 루프 (Feedback)
- 담당: 반려/실패 시 "왜"를 전달해서 재작업 품질 올리기
- 없으면: 반려 후 같은 실수 반복. "뭐가 틀렸는지 모르니까 또 같이 써"
- 구성: reject_reason 주입 + Slack 알림에 사유 포함

### 축 B: 프로젝트 컨텍스트 (Project Context)  
- 담당: 프로젝트마다 다른 규칙/제약/인프라를 자동 주입
- 없으면: bscamp TASK에서 "PostgreSQL로 하세요" 실수 (SQLite인데)
- 구성: 프로젝트 레이어 + 프로젝트별 에이전트 구성

### 축 C: 에이전트 무장 (Agent Arsenal)
- 담당: 각 역할에 맞는 도구/스킬/제한 세팅
- 없으면: CTO가 rm -rf 실행 가능. PM이 코드 수정 가능. QA가 파일 삭제 가능
- 구성: tools 제한 + disallowedTools + 외부 스킬 + MCP

---

## Step 4: Understanding Lock 🔒

| 항목 | 내용 |
|------|------|
| **뭘 만드는가** | 피드백 루프 + 프로젝트 컨텍스트 + 에이전트 무장 |
| **왜 필요한가** | P0으로 돌아가긴 하는데, 반려 사유 모름 + 프로젝트 규칙 누락 + 도구 제한 없음 |
| **핵심 축** | 피드백(A), 프로젝트(B), 무장(C) |
| **기존 자산** | reject_reason 필드, project-layer Design 34건, bkit agents 31개, 외부 스킬 248+ |
| **안 하는 것** | 오픈소스 패키징, SkyOffice UI, 새 Gate/Link 타입 |
| **가정** | P0 4축(산출물/컨텍스트/가시성/사람) 완료 전제 |

---

## Step 5: 레이어 설계

### 축 A: 피드백 루프

```
TASK-6: 반려 사유 전달

A-1. Gate reject 시 reject_reason을 context에 주입
     approval Gate → reject → context.reject_reason = "TDD 3건 누락"
     loop Link로 돌아갈 때 → 블록 프롬프트에 자동 포함:
     "이전 산출물이 반려됨. 사유: {reject_reason}. 이 부분을 수정해라."

A-2. Slack 알림에 반려 사유 포함
     ❌ 반려: *design-review*
     사유: TDD 3건 누락
     재시도: 2/3

참고 코드: concrete.py line 377~ (_run_approval)
참고 Design: brick-ceo-approval-gate.design.md

TASK-7: Slack 알림 정리

A-3. verbose/기본 분리
     기본: 워크플로우 시작/완료 + 실패 + 승인대기
     verbose: 블록 단위 시작/완료 + 링크 이동
     설정: 프리셋 YAML에 notifications.level: basic|verbose

A-4. 테스트 Slack 격리
     BRICK_ENV=test → Slack 미발송 (mock)
     BRICK_ENV=production → 실제 전송

A-5. 알림에 작업 정보 표기
     현재: ":arrow_forward: 블록 시작: *do*"
     변경: ":arrow_forward: [bscamp] 블록 시작: *do* — TASK-brick-p0"
```

### 축 B: 프로젝트 컨텍스트

```
TASK-8: 프로젝트별 에이전트 구성

B-1. 프로젝트 설정 파일
     brick/projects/bscamp/project.yaml:
       name: bscamp
       tech_stack: [Next.js, Cloud SQL, GCS, Firebase Auth]
       constraints:
         - "DB는 Cloud SQL (PostgreSQL이 아님 주의)"
         - "포트 3202는 브릭 전용"
       agents:
         cto: cto-lead-bscamp    # 프로젝트별 CTO 프롬프트
         pm: pm-lead-bscamp

B-2. 블록 실행 시 프로젝트 컨텍스트 자동 주입
     executor가 start_block 시 project.yaml 읽어서 context에 주입
     → CTO가 "이 프로젝트는 Cloud SQL이다" 자동으로 앎

B-3. 프로젝트별 에이전트 프롬프트 오버라이드
     brick/agents/cto-lead.md (기본)
     brick/projects/bscamp/agents/cto-lead-bscamp.md (오버라이드)

참고 Design: brick-project-layer.design.md (34건 TDD)
```

### 축 C: 에이전트 무장

```
TASK-9: 에이전트 스킬 세팅

C-1. .claude/agents/ 프롬프트에 tools/disallowedTools 추가
     cto-lead.md:
       model: opus
       tools: [Read, Write, Edit, Bash, Grep, Glob, Task]
       disallowedTools:
         - "Bash(rm -rf*)"
         - "Bash(git push*)"
         - "Bash(git reset --hard*)"

     pm-lead.md:
       model: opus
       permissionMode: plan    # 읽기 위주, 수정 제한
       tools: [Read, Write, Grep, Glob, Task]

     qa-monitor.md:
       model: sonnet           # QA는 Sonnet으로 충분
       tools: [Read, Grep, Glob, Bash]
       disallowedTools:
         - Write
         - Edit

C-2. 외부 스킬 추가 (선별)
     PM: Product Discovery 체인 (phuryn/pm-skills)
     CTO: Security Auditor (alirezarezvani)
     CTO: Playwright Pro — E2E 테스트 55 templates

C-3. MCP 연결 (최소한)
     CTO: GitHub MCP — 커밋→PR 자동화
     나머지 MCP 불필요 (우리는 .md 파일 기반)

참고: bkit agents/ 구조 (model, tools, disallowedTools, skills, permissionMode)
참고: brick/docs/agent-skills-research.md
```

---

## Step 6: 옵션 + 결정 (ADR)

### 결정 1: 프로젝트 컨텍스트 주입 방식

| 옵션 | 장점 | 단점 |
|------|------|------|
| A. project.yaml → executor 주입 | 간단, YAML 하나 | 런타임에만 적용 |
| **B. project.yaml + CLAUDE.md 포인터** | 네이티브 + 런타임 둘 다 | 2곳 관리 |
| C. DB 테이블 (brick-project-layer Design) | 완전한 구조 | 구현 무거움 |

→ **A안.** P1에선 YAML만으로 충분. DB는 P2 오픈소스 때.

### 결정 2: 외부 스킬 도입 범위

| 옵션 | 장점 | 단점 |
|------|------|------|
| A. 없음 (우리 것만) | 단순 | PM Discovery 체인 없음 |
| **B. 3개만 (Discovery + Security + Playwright)** | 핵심만 | 설치/관리 필요 |
| C. 전부 (alirezarezvani 248개) | 풍부 | 노이즈, 충돌 위험 |

→ **B안.** 3개만 선별. 나머지는 필요할 때.

### 결정 3: MCP 도입 범위

| 옵션 | 장점 | 단점 |
|------|------|------|
| **A. GitHub MCP만** | 가장 유용한 것 하나 | 나머지 수동 |
| B. GitHub + PostgreSQL + Sentry | 개발 편의 | 설정 복잡 |
| C. 없음 | 단순 | PR 수동 생성 |

→ **A안.** GitHub MCP가 CTO한테 가장 impact 큼.

---

## Step 7: 핸드오프

### 실행 순서

```
TASK-6 (피드백: 반려 사유) ──┐
TASK-7 (피드백: 알림 정리) ──┤  축A 순차
                            ↓
TASK-8 (프로젝트 컨텍스트)   ←  축B 독립
                            ↓
TASK-9 (에이전트 무장)       ←  축C 독립 (B 참고)
```

### PM 산출물 요청

1. **Plan 문서** — 위 요구사항 기반 구현 계획
2. **Design 문서 (통합 1개)** — 3축 전부 포함. TDD + 불변식 + 인터페이스

### Decision Log

| # | 결정 | 대안 | 이유 |
|---|------|------|------|
| 1 | 프로젝트 컨텍스트 = project.yaml | DB 테이블 | P1에선 YAML 충분. DB는 P2 |
| 2 | 외부 스킬 3개만 | 전부/없음 | 핵심만 선별 |
| 3 | MCP = GitHub만 | 전부/없음 | CTO impact 최대 |

COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.
