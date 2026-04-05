# Design: 브릭 QA팀 — Competitive Hypothesis 전략

> 작성일: 2026-04-05
> 작성자: PM
> 레벨: L2-기능
> TASK: TASK 2 (QA팀 구조)

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| 기능 | 3 에이전트 경쟁 가설 검증 기반 QA 시스템 |
| 핵심 | Claude(정적 분석) + Codex(크로스 모델 리뷰) + OpenChrome(브라우저 QA) → 합성 |
| 전략 | Competitive Hypothesis — 각 에이전트가 독립 가설 수립 → 교차 검증 → 합의 |
| 산출물 | qa-report.md (3 에이전트 결과 통합) |
| TDD | BQ-001 ~ BQ-042 (42건) |

---

## 기존 설계 참조

| 문서 | 관계 | 충돌 |
|------|------|------|
| brick-p0-agent-abstraction.design.md | 어댑터 시스템 — QA팀은 어댑터 위에 구축 | 없음 |
| brick-architecture.design.md | Gate 시스템 — QA 결과를 Gate 입력으로 | 없음 |
| brick-p1-operations.design.md | Slack 알림 — QA 결과 알림에 활용 | 없음 |
| security-qa.yaml | 기존 프리셋 — Claude+Codex+OpenChrome 구조의 원형 | 없음 (placeholder → 실구현) |

---

## 1. Competitive Hypothesis 전략

### 1.1 왜 경쟁 가설인가

단일 에이전트 QA의 한계:
- 같은 모델이 같은 코드를 보면 **같은 맹점**을 가짐
- 정적 분석만으로는 런타임 버그를 못 잡음
- 브라우저 QA만으로는 로직 버그를 못 잡음

**경쟁 가설**: 3개 에이전트가 독립적으로 "이 코드에 어떤 문제가 있는가?" 가설을 세우고 검증. 각자 다른 도구, 다른 관점, 다른 모델로 분석하므로 맹점이 줄어듦.

### 1.2 에이전트 역할 분리

```
┌──────────────────────────────────────────────────────────┐
│                    QA Leader (합성)                        │
│                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐ │
│  │ Claude       │  │ Codex        │  │ OpenChrome       │ │
│  │ 정적 분석    │  │ 크로스 모델  │  │ 브라우저 QA      │ │
│  │              │  │ 리뷰         │  │                  │ │
│  │ - 코드 품질  │  │ - 독립 리뷰  │  │ - UI 렌더링     │ │
│  │ - 타입 안전  │  │ - 다른 관점  │  │ - 사용자 플로우  │ │
│  │ - OWASP      │  │ - 패턴 검출  │  │ - 접근성        │ │
│  │ - Gap 분석   │  │ - 엣지케이스 │  │ - 실제 동작     │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘ │
│         │                  │                    │           │
│         └──────────────────┼────────────────────┘           │
│                            ▼                                │
│                   결과 합성 + 교차 검증                      │
│                            ▼                                │
│                    qa-report.md                              │
└──────────────────────────────────────────────────────────────┘
```

### 1.3 경쟁 가설 프로세스

```
Phase 1: 독립 분석 (병렬)
  Claude → 정적 분석 가설: "코드에 N가지 문제가 있다"
  Codex  → 크로스 리뷰 가설: "M가지 패턴 위반이 있다"
  OpenChrome → 브라우저 가설: "K가지 UI 문제가 있다"

Phase 2: 교차 검증 (Leader)
  Claude가 발견한 문제를 Codex가 확인 → 합의 또는 반박
  Codex가 발견한 패턴을 Claude가 코드에서 추적 → 확인
  OpenChrome 브라우저 이슈가 코드 문제와 매핑되는지 → 원인 연결

Phase 3: 합성 (Leader)
  공통 발견 (2+/3 합의) → Critical
  단독 발견 (1/3만) → Review Needed (인간 판단 필요)
  반박된 가설 → Dismissed (사유 기록)
```

---

## 2. 에이전트 상세 설계

### 2.1 Claude — 정적 분석 에이전트

```yaml
name: qa-claude
model: claude-opus-4-6
tools: [Read, Glob, Grep, Bash]
disallowedTools: [Write, Edit]
permissionMode: plan
```

**분석 항목**:

| 항목 | 방법 | 기준 |
|------|------|------|
| 타입 안전성 | `npx tsc --noEmit` 실행 | 에러 0개 |
| 코드 품질 | ESLint + 패턴 분석 | warning 0, error 0 |
| 보안 (OWASP Top 10) | 소스코드 패턴 검색 | XSS, SQLi, Path Traversal |
| Gap 분석 | Design 문서 vs 구현 비교 | Match Rate 산출 |
| 불변식 검증 | INV-* 목록 vs 코드 대조 | 위반 0건 |
| 테스트 커버리지 | pytest/vitest 결과 분석 | 실패 0건 |

**출력 형식**:
```markdown
## Claude 정적 분석 결과

### 가설
- H1: executor.py에 미처리 예외가 있다
- H2: GateConfig에 타입 불일치가 있다

### 검증 결과
| 가설 | 결과 | 근거 |
|------|------|------|
| H1 | 확인 | L421: asyncio.TimeoutError 미캐치 |
| H2 | 기각 | 타입 체크 통과 |

### 발견 사항
| 심각도 | 파일 | 라인 | 설명 | 신뢰도 |
|--------|------|------|------|--------|
| Critical | executor.py | 421 | TimeoutError 미캐치 | 95% |
| Warning | bridge.ts | 89 | 하드코딩된 timeout | 80% |
```

### 2.2 Codex — 크로스 모델 리뷰 에이전트

```yaml
name: qa-codex
adapter: claude_local  # Codex CLI는 command gate로 실행
config:
  command: "codex"
  extraArgs: ["review", "--uncommitted"]
  timeout: 300
```

**실행 방법**: 현재 CodexAdapter는 Phase 2 stub. 실제 실행은 **command gate** 방식:

```bash
codex review --uncommitted --format json
```

**분석 항목**:

| 항목 | 방법 | 차별점 |
|------|------|--------|
| 코드 리뷰 | Codex가 독립적으로 리뷰 | Claude와 다른 모델/관점 |
| 패턴 위반 | 프로젝트 컨벤션 대조 | CLAUDE.md 규칙 기반 |
| 엣지케이스 | 경계값/예외 시나리오 발견 | 모델 특성상 다른 관점 |
| 논리 오류 | 비즈니스 로직 검증 | 독립적 판단 |

**출력 형식**:
```markdown
## Codex 크로스 모델 리뷰 결과

### 가설
- H1: state_machine.py의 전이 로직에 누락 분기가 있다
- H2: checkpoint 동시성 처리에 race condition 가능성

### 검증 결과
| 가설 | 결과 | 근거 |
|------|------|------|
| H1 | 확인 | suspended→running 전이 미구현 |
| H2 | 기각 | asyncio.Lock 사용 확인 |

### 리뷰 이슈
| 심각도 | 파일 | 설명 | 제안 |
|--------|------|------|------|
| High | state_machine.py | suspended 상태 복귀 로직 없음 | resume 핸들러 추가 |
```

### 2.3 OpenChrome — 브라우저 QA 에이전트

```yaml
name: qa-openchrome
adapter: claude_local
config:
  role: qa-monitor
  model: claude-sonnet-4-6
  env:
    OPENCHROME_URL: "http://localhost:3201"
tools: [Read, Glob, Grep, Bash]
```

**실행 방법**: OpenChrome MCP를 통해 실제 Chrome 브라우저 제어.

```bash
# MCP 등록 (1회)
claude mcp add openchrome -- npx openchrome-mcp

# QA 실행
npx openchrome-mcp test \
  --url http://localhost:3201 \
  --check login,canvas,execution,approval
```

**분석 항목**:

| 항목 | 방법 | 기준 |
|------|------|------|
| 페이지 렌더링 | 주요 페이지 로드 | 5초 이내, 에러 0 |
| React Flow 캔버스 | 노드/엣지 렌더 확인 | 블록 수 일치 |
| 사용자 플로우 | 실행 → 상태 확인 → 승인 시나리오 | 전 단계 완료 |
| 접근성 | 키보드 탐색, 대비 | 기본 접근성 충족 |
| 에러 콘솔 | console.error 수집 | 에러 0건 |
| 반응성 | 클릭 → 상태 변경 | 1초 이내 반응 |

**QA 시나리오**:

| # | 시나리오 | 검증 |
|---|----------|------|
| OC-1 | 프리셋 목록 페이지 로드 | 프리셋 카드 렌더 |
| OC-2 | 캔버스 페이지 → 블록 드래그 | 블록 노드 생성 |
| OC-3 | 블록 연결 → 링크 생성 | 엣지 표시 |
| OC-4 | 실행 버튼 → 실행 상태 | 블록 색상 변경 |
| OC-5 | 승인 버튼 → 승인 처리 | 상태 completed |
| OC-6 | 에러 발생 시 표시 | stderr 표시 |

**출력 형식**:
```markdown
## OpenChrome 브라우저 QA 결과

### 페이지 검증
| 페이지 | URL | 로드(ms) | 에러 | 상태 |
|--------|-----|----------|------|------|
| 프리셋 목록 | /brick/presets | 450 | 0 | PASS |
| 캔버스 | /brick/canvas/default | 1200 | 0 | PASS |
| 실행 상세 | /brick/runs/1 | 380 | 0 | PASS |

### 시나리오 검증
| # | 시나리오 | 결과 | 스크린샷 |
|---|----------|------|----------|
| OC-1 | 프리셋 카드 렌더 | PASS | oc-1.png |
| OC-2 | 블록 드래그 | PASS | oc-2.png |
```

---

## 3. QA Leader — 결과 합성

### 3.1 에이전트 정의

```yaml
name: qa-leader
model: claude-opus-4-6
tools: [Read, Write, Edit, Glob, Grep]
disallowedTools: [Bash]
permissionMode: plan
```

### 3.2 합성 프로세스

```
1. 3개 에이전트 결과 수집
   ├── qa-claude-result.md (정적 분석)
   ├── qa-codex-result.md (크로스 리뷰)
   └── qa-openchrome-result.md (브라우저)

2. 교차 검증
   각 발견 사항에 대해:
   - 2+/3 에이전트가 동의 → Confirmed (확정)
   - 1/3만 발견 → Review Needed (인간 검토 필요)
   - 다른 에이전트가 반박 → Disputed (논쟁)
   - 0/3 발견 (인간만 알 수 있는) → 기록 안 함

3. 심각도 최종 판정
   Confirmed + Critical → 즉시 수정 필요
   Confirmed + Warning → 다음 스프린트
   Review Needed → 인간 판단 대기
   Disputed → 추가 조사 필요

4. qa-report.md 작성
```

### 3.3 합의 판정 매트릭스

| Claude | Codex | OpenChrome | 판정 | 조치 |
|--------|-------|------------|------|------|
| ✅ | ✅ | ✅ | Confirmed | 즉시 수정 |
| ✅ | ✅ | ❌ | Confirmed | 수정 (UI 무관) |
| ✅ | ❌ | ✅ | Confirmed | 수정 (코드+UI) |
| ❌ | ✅ | ✅ | Confirmed | 수정 |
| ✅ | ❌ | ❌ | Review | 인간 검토 |
| ❌ | ✅ | ❌ | Review | 인간 검토 |
| ❌ | ❌ | ✅ | Review | UI만 이슈 |

### 3.4 qa-report.md 형식

```markdown
# QA Report: {feature}

> 날짜: {date}
> 대상: {commit_hash}
> 전략: Competitive Hypothesis (Claude + Codex + OpenChrome)

## 요약

| 지표 | 값 |
|------|-----|
| 총 발견 | 12건 |
| Confirmed | 5건 (Critical 2, Warning 3) |
| Review Needed | 4건 |
| Disputed | 1건 |
| Dismissed | 2건 |

## Confirmed 이슈 (즉시 수정)

### 1. executor.py:421 — TimeoutError 미캐치
- **발견자**: Claude ✅, Codex ✅
- **심각도**: Critical
- **설명**: asyncio.TimeoutError가 try 블록 밖에서 발생 가능
- **수정 제안**: except 절 추가

### 2. BlockNode.tsx — 실패 상태 에러 미표시
- **발견자**: Claude ✅, OpenChrome ✅
- **심각도**: Warning
- **설명**: status='failed' 시 에러 텍스트 미표시
- **수정 제안**: 에러 div 추가

## Review Needed (인간 검토)

### 3. state_machine.py — suspended 복귀 로직
- **발견자**: Codex만
- **의견**: "suspended→running 전이 핸들러 없음"
- **반론**: Claude는 "현재 설계에서 suspended는 수동 resume만 지원"

## 교차 검증 상세
...

## 메트릭스
| 에이전트 | 가설 수 | 확인 | 기각 | 정확도 |
|---------|---------|------|------|--------|
| Claude | 8 | 6 | 2 | 75% |
| Codex | 5 | 4 | 1 | 80% |
| OpenChrome | 6 | 5 | 1 | 83% |
```

---

## 4. 브릭 엔진 통합

### 4.1 프리셋 구조

```yaml
$schema: brick/preset-v2
name: qa-competitive
description: "Competitive Hypothesis QA — 3 에이전트 경쟁 검증"
level: 2

blocks:
  - id: qa-claude
    type: QA
    what: "정적 분석: tsc, ESLint, OWASP, Gap 분석, 불변식 검증"
    done:
      artifacts: ["projects/{project}/qa/qa-claude-result.md"]

  - id: qa-codex
    type: QA
    what: "크로스 모델 리뷰: 독립 코드 리뷰, 패턴 위반, 엣지케이스"
    done:
      artifacts: ["projects/{project}/qa/qa-codex-result.md"]

  - id: qa-openchrome
    type: QA
    what: "브라우저 QA: 페이지 로드, 사용자 플로우, 접근성, 콘솔 에러"
    done:
      artifacts: ["projects/{project}/qa/qa-openchrome-result.md"]

  - id: qa-synthesis
    type: Review
    what: "3 에이전트 결과 합성: 교차 검증, 합의 판정, qa-report.md 작성"
    done:
      artifacts: ["projects/{project}/reports/{feature}-qa.report.md"]
    gate:
      handlers:
        - type: metric
          metric: confirmed_critical_count
          threshold: 0  # Critical 0건이어야 통과
      on_fail: retry
      max_retries: 3

links:
  - from: qa-claude
    to: qa-synthesis
    type: sequential

  - from: qa-codex
    to: qa-synthesis
    type: sequential

  - from: qa-openchrome
    to: qa-synthesis
    type: sequential

teams:
  qa-claude:
    adapter: claude_local
    config:
      role: qa-monitor
      model: claude-opus-4-6
      maxTurns: 30
      dangerouslySkipPermissions: false

  qa-codex:
    adapter: claude_local
    config:
      role: qa-monitor
      model: claude-opus-4-6
      maxTurns: 20
      env:
        CODEX_REVIEW: "true"
      extraArgs: []
    # gate로 codex review 실행:
    # command gate: "codex review --uncommitted --format json"

  qa-openchrome:
    adapter: claude_local
    config:
      role: qa-monitor
      model: claude-sonnet-4-6
      maxTurns: 15
      env:
        OPENCHROME_URL: "http://localhost:3201"

  qa-synthesis:
    adapter: claude_local
    config:
      role: qa-leader
      model: claude-opus-4-6
      maxTurns: 20
```

### 4.2 병렬 실행 구조

```
         ┌─── qa-claude ───┐
         │                  │
start ───┼─── qa-codex  ───┼──→ qa-synthesis ──→ end
         │                  │
         └─ qa-openchrome ─┘
              (parallel)         (sequential)
```

3개 QA 블록은 **parallel 링크**로 동시 실행. 전부 완료 후 synthesis 블록 시작.

실제 프리셋에서는 `compete` 링크가 아닌 `parallel` 사용:
- compete: 먼저 완료된 것만 채택 (부적합 — 모든 결과 필요)
- parallel: 전부 완료 후 다음 단계 (적합 — 합성에 3개 결과 모두 필요)

### 4.3 PDCA 워크플로우 내 위치

```
Plan → Design → Do → [QA팀 (parallel)] → Synthesis → Report
                 ↑                              │
                 └──── Loop (Critical > 0) ─────┘
```

QA팀은 PDCA의 **Check 단계**에 해당. qa-synthesis의 metric gate에서 `confirmed_critical_count >= 1`이면 Do 블록으로 loop back.

---

## 5. 에이전트 프롬프트

### 5.1 qa-claude (정적 분석)

```
파일: brick/.claude/agents/qa-claude.md (신규)
```

```markdown
---
name: qa-claude
model: opus
tools: [Read, Glob, Grep, Bash]
disallowedTools: [Write, Edit]
---

# QA Claude — 정적 분석 에이전트

## 역할
Competitive Hypothesis 전략의 정적 분석 담당.
독립적으로 코드 품질 가설을 세우고 검증한다.

## 분석 절차
1. Design 문서 읽기 → 기대 동작 파악
2. 구현 코드 읽기 → 가설 수립 ("이 코드에 X 문제가 있을 것이다")
3. 가설 검증: tsc, pytest, 패턴 검색
4. 결과를 가설별로 정리 (확인/기각)

## 분석 항목
- 타입 안전성 (tsc --noEmit)
- 코드 품질 (ESLint, 사용하지 않는 변수, 중복 코드)
- 보안 (OWASP Top 10: XSS, SQLi, Path Traversal, CSRF)
- Gap 분석 (Design TDD 케이스 vs 구현)
- 불변식 검증 (INV-* 목록 대조)
- 테스트 결과 (pytest/vitest)

## 출력
projects/{project}/qa/qa-claude-result.md 에 작성.
반드시 가설 → 검증 → 발견 사항 형식으로.

## 제약
- Write/Edit 금지 — 코드 수정 불가
- 발견만 보고, 수정은 CTO팀 담당
- 신뢰도 80% 미만 이슈는 보고하지 않음
```

### 5.2 qa-codex (크로스 모델)

```
파일: brick/.claude/agents/qa-codex.md (신규)
```

```markdown
---
name: qa-codex
model: opus
tools: [Read, Glob, Grep, Bash]
disallowedTools: [Write, Edit]
---

# QA Codex — 크로스 모델 리뷰 에이전트

## 역할
Competitive Hypothesis 전략의 크로스 모델 리뷰 담당.
Claude와 다른 관점으로 독립적 코드 리뷰를 수행한다.

## 분석 절차
1. `codex review --uncommitted --format json` 실행
2. Codex 리뷰 결과를 가설로 재구성
3. 각 가설을 코드에서 직접 검증 (Read/Grep)
4. 결과 정리

## 분석 항목
- 코드 리뷰 (Codex 독립 관점)
- 프로젝트 컨벤션 위반 (CLAUDE.md 규칙 대조)
- 엣지케이스 (경계값, null/undefined, 빈 배열)
- 논리 오류 (비즈니스 로직 정합성)
- 패턴 위반 (DRY, SRP, 일관성)

## 출력
projects/{project}/qa/qa-codex-result.md 에 작성.

## 제약
- codex CLI 없으면 자체 리뷰 모드로 전환
- Write/Edit 금지
- Claude 결과를 보지 않고 독립 분석 (순서 보장)
```

### 5.3 qa-openchrome (브라우저)

```
파일: brick/.claude/agents/qa-openchrome.md (신규)
```

```markdown
---
name: qa-openchrome
model: sonnet
tools: [Read, Glob, Grep, Bash]
disallowedTools: [Write, Edit]
---

# QA OpenChrome — 브라우저 QA 에이전트

## 역할
Competitive Hypothesis 전략의 브라우저 QA 담당.
실제 Chrome 브라우저에서 대시보드 UI를 검증한다.

## QA 절차
1. 대시보드 서버 상태 확인 (localhost:3201)
2. OpenChrome MCP로 브라우저 제어
3. 시나리오별 검증 실행
4. 스크린샷 + 콘솔 로그 수집
5. 결과 정리

## QA 시나리오
- 페이지 로드 (프리셋 목록, 캔버스, 실행 상세)
- 블록 드래그앤드롭
- 블록 연결 (Link 생성)
- 실행 버튼 → 상태 변경
- 승인/반려 버튼
- 에러 상태 표시
- 콘솔 에러 0건 확인

## 출력
projects/{project}/qa/qa-openchrome-result.md 에 작성.

## 제약
- 대시보드 서버가 실행 중이어야 함
- Write/Edit 금지
- 서버 미실행 시 → 시나리오 스킵 + 사유 기록
```

### 5.4 qa-leader (합성)

```
파일: brick/.claude/agents/qa-leader.md (신규)
```

```markdown
---
name: qa-leader
model: opus
tools: [Read, Write, Edit, Glob, Grep]
disallowedTools: [Bash]
---

# QA Leader — 결과 합성 에이전트

## 역할
3 에이전트 QA 결과를 합성하여 최종 qa-report.md를 작성한다.
교차 검증으로 가설의 신뢰도를 판정한다.

## 합성 절차
1. 3개 결과 파일 읽기
2. 모든 발견 사항을 하나의 목록으로 수집
3. 각 발견에 대해 교차 검증:
   - 2+/3 합의 → Confirmed
   - 1/3만 → Review Needed
   - 반박 존재 → Disputed
4. 심각도 최종 판정
5. 메트릭스 산출 (에이전트별 정확도)
6. qa-report.md 작성

## 판정 기준
- Confirmed + Critical → 즉시 수정 (Do 블록으로 루프)
- Confirmed + Warning → 다음 스프린트 권고
- Review Needed → Smith님/모찌 검토 필요 표시
- Disputed → 추가 조사 TASK 제안

## 출력
projects/{project}/reports/{feature}-qa.report.md

## Gate 입력
confirmed_critical_count를 context에 주입하여 metric gate 판정.
0이면 통과, 1 이상이면 Do 블록으로 루프백.

## 제약
- Bash 금지 (코드 실행 불가)
- 코드 수정 금지 (보고서만 작성)
- 3개 결과 파일이 모두 존재해야 합성 시작
```

---

## 6. Gate 통합

### 6.1 QA Synthesis Gate

```yaml
gate:
  handlers:
    - type: metric
      metric: confirmed_critical_count
      threshold: 0  # 0이어야 통과 (Critical 0건)
    - type: artifact
      # qa-report.md 존재 확인
  evaluation: sequential
  on_fail: retry
  max_retries: 3
```

### 6.2 Context 주입

qa-leader가 합성 완료 시:

```python
context["confirmed_critical_count"] = len(confirmed_criticals)
context["confirmed_warning_count"] = len(confirmed_warnings)
context["review_needed_count"] = len(review_needed)
context["qa_agent_accuracy"] = {
    "claude": accuracy_claude,
    "codex": accuracy_codex,
    "openchrome": accuracy_openchrome,
}
```

---

## 7. TDD 케이스

### QA 에이전트 (BQ-001~015)

| ID | 테스트 | 검증 |
|----|--------|------|
| BQ-001 | qa-claude 프롬프트 로드 | agents/qa-claude.md 파싱 |
| BQ-002 | qa-claude tsc 실행 | npx tsc --noEmit 호출 |
| BQ-003 | qa-claude Gap 분석 | Design vs 구현 비교 |
| BQ-004 | qa-claude 결과 형식 | 가설→검증→발견 구조 |
| BQ-005 | qa-claude 신뢰도 80% 필터 | 저신뢰 이슈 제외 |
| BQ-006 | qa-codex codex CLI 실행 | command gate 호출 |
| BQ-007 | qa-codex CLI 없을 때 자체 리뷰 | 폴백 동작 |
| BQ-008 | qa-codex 독립 분석 | Claude 결과 미참조 |
| BQ-009 | qa-codex 결과 형식 | 가설→검증 구조 |
| BQ-010 | qa-openchrome 서버 상태 확인 | localhost:3201 체크 |
| BQ-011 | qa-openchrome 페이지 로드 | 3개 페이지 검증 |
| BQ-012 | qa-openchrome 서버 미실행 시 | 스킵 + 사유 기록 |
| BQ-013 | qa-openchrome 콘솔 에러 수집 | console.error 감지 |
| BQ-014 | qa-openchrome 시나리오 6건 | OC-1~OC-6 실행 |
| BQ-015 | qa-openchrome 결과 형식 | 페이지+시나리오 테이블 |

### QA Leader 합성 (BQ-016~030)

| ID | 테스트 | 검증 |
|----|--------|------|
| BQ-016 | 3개 결과 파일 읽기 | 전부 존재 확인 |
| BQ-017 | 교차 검증: 3/3 합의 → Confirmed | 합의 판정 |
| BQ-018 | 교차 검증: 2/3 합의 → Confirmed | 다수결 |
| BQ-019 | 교차 검증: 1/3만 → Review Needed | 단독 발견 |
| BQ-020 | 교차 검증: 반박 → Disputed | 논쟁 기록 |
| BQ-021 | Critical 판정 → confirmed_critical_count | context 주입 |
| BQ-022 | Warning 판정 | 다음 스프린트 권고 |
| BQ-023 | 에이전트별 정확도 산출 | 확인/기각 비율 |
| BQ-024 | qa-report.md 형식 | 요약+Confirmed+Review+교차검증+메트릭스 |
| BQ-025 | 결과 파일 1개 누락 시 | 에러 보고 |
| BQ-026 | confirmed_critical_count = 0 → gate pass | metric gate 통과 |
| BQ-027 | confirmed_critical_count >= 1 → gate fail | metric gate 실패 → 루프 |
| BQ-028 | artifact gate: qa-report.md 존재 | 파일 존재 확인 |
| BQ-029 | 루프백 후 재QA | Do→QA→Synthesis 재실행 |
| BQ-030 | 3회 루프 후 실패 | max_retries 초과 → FAILED |

### 프리셋 통합 (BQ-031~042)

| ID | 테스트 | 검증 |
|----|--------|------|
| BQ-031 | qa-competitive.yaml 파싱 | PresetValidator 통과 |
| BQ-032 | 3 QA 블록 parallel 실행 | 동시 시작 |
| BQ-033 | parallel 완료 → synthesis 시작 | join 동작 |
| BQ-034 | synthesis Gate: metric + artifact | 순차 평가 |
| BQ-035 | Gate 실패 → Do 루프 | on_fail=retry |
| BQ-036 | TeamDefinition 4개 | qa-claude, qa-codex, qa-openchrome, qa-synthesis |
| BQ-037 | claude adapter: opus | 모델 설정 확인 |
| BQ-038 | codex adapter: command gate | codex review CLI |
| BQ-039 | openchrome adapter: sonnet | 모델 설정 확인 |
| BQ-040 | qa-leader adapter: opus | 합성 에이전트 |
| BQ-041 | PDCA Check 단계 매핑 | QA = Check phase |
| BQ-042 | 전체 E2E: Do → QA(3) → Synthesis → 루프 또는 Report | 전체 흐름 |

---

## 8. 불변식

| ID | 불변식 | 검증 |
|----|--------|------|
| INV-QA-1 | 3 에이전트 독립 분석 | 결과 파일 간 참조 없음 |
| INV-QA-2 | QA 에이전트 Write/Edit 금지 | 코드 수정 불가 |
| INV-QA-3 | Critical 0건이어야 Gate 통과 | metric gate 강제 |
| INV-QA-4 | 3개 결과 없으면 합성 불가 | 파일 존재 검증 |
| INV-QA-5 | 최대 3회 루프 | max_retries=3 |
| INV-QA-6 | 신뢰도 80% 미만 이슈 제외 | 노이즈 필터링 |

---

## 9. 구현 시 주의사항

1. **Codex CLI 의존성**: `codex review` CLI가 설치 안 되어 있을 수 있음. qa-codex는 CLI 없을 때 자체 리뷰 모드로 폴백해야 함.
2. **OpenChrome 서버 의존**: 대시보드 서버(localhost:3201)가 실행 중이어야 함. 미실행 시 시나리오 스킵 + 사유 기록.
3. **parallel 링크 구현**: 현재 브릭 엔진의 parallel 링크가 "전부 완료 후 다음" join을 지원하는지 확인 필요.
4. **결과 파일 경로**: `projects/{project}/qa/` 디렉토리가 없으면 생성해야 함.
5. **토큰 비용**: 3 에이전트 병렬 = 토큰 3배. L2에서만 사용, L0/L1은 단일 에이전트 QA.
