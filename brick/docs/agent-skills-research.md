# 에이전트별 스킬/MCP 서치 결과

> 2026-04-04 모찌 작성. 외부 레퍼런스 + bkit + 우리 기존 스킬 대조.

---

## 핵심 발견

### 1. 시장에서 가장 유명한 스킬 저장소들

| 저장소 | 규모 | 특징 |
|--------|------|------|
| **alirezarezvani/claude-skills** | 248개, ⭐5,200+ | 가장 큰 오픈소스. 엔지니어링 37 + PM 15 + 마케팅 45 + C-Level 34 |
| **phuryn/pm-skills (Product Compass)** | PM 65개 + 워크플로우 36 | PM 전용. discovery→strategy→execution 체인. Teresa Torres/Cagan 프레임워크 내장 |
| **daymade/claude-code-skills** | UX/API/아키텍처 감사 | 병렬 에이전트로 제품 감사 |
| **bkit (우리가 쓰던 것)** | 에이전트 31 + 스킬 36 | PDCA 특화. 한국어 지원 |

### 2. 외부 vs bkit vs 우리 기존 — 비교

---

## 기획(PM) 에이전트에 필요한 것

### 스킬 (외부에서 가져올 만한 것)

| 스킬 | 출처 | 왜 좋은가 | 우리한테 있나? |
|------|------|----------|--------------|
| **Product Discovery** | phuryn/pm-skills | brainstorm→assumption→prioritize→experiment 4단계 체인. Teresa Torres OST 내장 | ❌ 없음 |
| **Strategy (JTBD/Positioning)** | phuryn/pm-skills | JTBD 분석 + 포지셔닝 맵 + 경쟁 분석 | ❌ 없음 (cpo-advisor가 일부) |
| **UX Researcher** | alirezarezvani | 사용자 인터뷰 설계 + 분석 + 페르소나 | ❌ 없음 |
| **PRD Writer** | phuryn + bkit | 구조화된 PRD 작성 (bkit pm-prd가 제일 우리 맥락에 맞음) | ✅ bkit pm-prd |
| **Roadmap Communicator** | alirezarezvani | 로드맵을 이해관계자별로 다르게 전달 | △ product-roadmap (부분) |
| **chatprd (재해석)** | 우리 자체 | Smith님 한 마디 → 날카로운 재해석 | ✅ coo-chatprd |

### MCP

| MCP | 용도 | PM한테 필요한가? |
|-----|------|----------------|
| Figma MCP | 디자인 파일 직접 읽기 | ⭕ UI 기획 시 유용하지만 지금 불필요 |
| Notion MCP | 문서 관리 | ❌ 우리는 .md 파일 기반 |
| Linear/Jira MCP | 이슈 트래킹 | ❌ 브릭이 대체 |

*결론: PM은 MCP 불필요. 스킬만 필요.*

---

## 개발(CTO) 에이전트에 필요한 것

### 스킬 (외부에서 가져올 만한 것)

| 스킬 | 출처 | 왜 좋은가 | 우리한테 있나? |
|------|------|----------|--------------|
| **Senior Architect** | alirezarezvani | 아키텍처 결정 프레임워크 + ADR 자동 작성 | ✅ coo-architect (COO용) |
| **Self-Improving Agent** | alirezarezvani ⭐ | 자동 메모리 큐레이션 + 패턴 추출 + 스킬 자동 생성. 작업하면서 스스로 학습 | ✅ self-improving (우리 것) |
| **Code Review** | bkit + 우리 자체 | 코드 리뷰 체크리스트 + TASK 매칭률 | ✅ code-review |
| **Test Master** | 우리 자체 | 유닛/통합/E2E/성능/보안 테스트 전략 | ✅ test-master |
| **Security Auditor** | alirezarezvani | OWASP Top 10 + 종속성 취약점 스캔 | ❌ 없음 |
| **CI/CD Builder** | alirezarezvani | GitHub Actions/Cloud Build 파이프라인 자동 생성 | ❌ 없음 |
| **Database Designer** | alirezarezvani | 스키마 설계 + 마이그레이션 플래닝 | △ db-migration (부분) |
| **Playwright Pro** | alirezarezvani ⭐ | E2E 테스트 생성 + flaky fix + 55 templates | ❌ 없음 (qa-scenario와 다름) |

### MCP

| MCP | 용도 | CTO한테 필요한가? |
|-----|------|----------------|
| **GitHub MCP** | PR/이슈/CI 직접 조작 | ⭕ 유용. 커밋→PR 자동화 가능 |
| **PostgreSQL/SQLite MCP** | DB 직접 쿼리 | ⭕ 유용. 우리 Cloud SQL 연결 가능 |
| **Sentry MCP** | 에러 트래킹 직접 읽기 | ⭕ 프로덕션 에러 분석 시 |
| **Playwright MCP** | 브라우저 자동화 | △ Railway에 별도 서비스 있음 |

*결론: CTO는 GitHub MCP가 가장 유용. 나머지는 필요할 때.*

---

## 추천: 우리가 가져와야 할 것

### 즉시 (P0/P1에 포함)

| # | 가져올 것 | 출처 | 적용 대상 |
|---|----------|------|----------|
| 1 | **pm-prd** 프롬프트 | bkit | PM 에이전트 |
| 2 | **cto-lead** 프롬프트 | bkit | CTO 에이전트 |
| 3 | **qa-monitor** 프롬프트 | bkit | QA 에이전트 |
| 4 | **code-review** 스킬 | 우리 자체 | CTO 에이전트 |
| 5 | **test-master** 스킬 | 우리 자체 | CTO 에이전트 |

### P1 (운영 품질)

| # | 가져올 것 | 출처 | 이유 |
|---|----------|------|------|
| 6 | **Product Discovery** 체인 | phuryn/pm-skills | PM이 discovery→assumption→experiment 할 때 |
| 7 | **Self-Improving Agent** | alirezarezvani | 에이전트가 작업하면서 자동 학습 |
| 8 | **Security Auditor** | alirezarezvani | 보안 감사 자동화 |
| 9 | **GitHub MCP** | 공식 | 커밋→PR 자동화 |

### 안 가져올 것

| 이유 | 목록 |
|------|------|
| 우리 맥락에 안 맞음 | Figma MCP, Notion MCP, Linear MCP |
| 이미 있음 | code-review, test-master, self-improving, task-writer |
| bscamp 전용 아님 | 마케팅 45개, C-Level 34개, 금융 4개 |

---

## bkit vs 외부 — 뭐가 더 좋은가?

| 비교 항목 | bkit | 외부 (alirezarezvani/phuryn) |
|----------|------|---------------------------|
| *PM 프롬프트* | ✅ 우리 PDCA에 맞춤 | ⭕ 프레임워크 풍부 (Teresa Torres, Cagan) |
| *CTO 프롬프트* | ✅ Agent Teams 통합 | ⭕ 더 범용적 |
| *스킬 다양성* | 36개 (PDCA 특화) | 248개 (범용) |
| *한국어* | ✅ | ❌ |
| *우리 구조 이해* | ✅ | ❌ |

*결론: 기본 프롬프트는 bkit 기반 (우리 맥락에 맞으니까). 외부 스킬은 필요할 때 추가.*
