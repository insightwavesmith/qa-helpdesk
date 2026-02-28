# BS CAMP 통합 데이터 아키텍처

> 이 문서는 BS CAMP 헬프데스크의 전체 데이터 흐름을 정의합니다.
> 모든 파이프라인은 이 문서의 레이어 구조를 따릅니다.
> 새 기능 추가 시 이 구조 안에서 연결점을 찾아야 합니다.

---

## 1. 설계 원칙

### 1-1. 레이어 분리 (Clean Architecture)

의존성은 안쪽으로만 흐른다. 바깥 레이어 변경이 안쪽에 영향을 주지 않는다.

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3: Distribution                                       │
│  웹 UI, 이메일 발송, 알림                                     │
│  → 변경 영향: 이 레이어만                                     │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2: Use Cases                                          │
│  QA 답변, 콘텐츠 생성, 성과 분석, 회원 관리                    │
│  → 변경 영향: Layer 3까지                                     │
├─────────────────────────────────────────────────────────────┤
│  LAYER 1: Services                                           │
│  KnowledgeService, PerformanceService, CustomerService       │
│  → 변경 영향: Layer 2, 3까지                                  │
├─────────────────────────────────────────────────────────────┤
│  LAYER 0: Data Store (Core)                                  │
│  Supabase 테이블, Vector Store, Storage                       │
│  → 변경 영향: 전체. 최대한 안정적으로 유지                      │
└─────────────────────────────────────────────────────────────┘
```

### 1-2. 확장 규칙

새 기능 추가 시:
1. 어떤 레이어에 속하는지 먼저 결정
2. 같은 레이어 또는 아래 레이어만 의존
3. 위 레이어를 import하면 설계 오류
4. 새 데이터 소스 → Layer 0에 테이블/스키마 추가 → Layer 1 서비스 확장 → Layer 2에서 사용

삭제 시:
1. Layer 3 (UI) 제거 → 서비스/데이터 영향 없음
2. Layer 2 (Use Case) 제거 → 다른 Use Case 영향 없음
3. Layer 1 (Service) 제거 → 해당 서비스 의존하는 모든 Use Case 확인
4. Layer 0 (Table) 제거 → 전체 영향 분석 필수

---

## 2. Layer 0: Data Store

### 2-1. 데이터 도메인 분류

```
Domain A: Customer (고객)
  profiles          — 회원 정보, 역할, 기수
  leads             — 리드 (가입 전 잠재고객)
  cohorts           — 기수 정보 (이름, 시작일, 활성여부)
  student_registry  — 수강 신청 원부 (매칭 전)
  invite_codes      — 초대 코드

Domain B: Performance (성과)
  ad_accounts       — 광고계정 연결 (profiles ↔ Meta/Mixpanel)
  daily_ad_insights — Meta 광고 일별 성과 (35 컬럼)
  daily_lp_metrics  — Mixpanel LP 일별 행동 (18 컬럼)
  benchmarks        — 벤치마크 기준값 (33 조합 + LP 6개)
  service_secrets   — 외부 서비스 인증 키

Domain C: Knowledge (지식)
  lecture_chunks    — 강의/자료 청크 + 벡터 임베딩
  knowledge_usage   — KS 사용 로그 (consumer, tokens, model)

Domain D: Content (콘텐츠)
  contents          — 정보공유/뉴스레터 본문
  content_sources   — 콘텐츠 소스 추적

Domain E: QA (질의응답)
  questions         — 수강생 질문
  answers           — 답변 (AI + 수동, 승인 플로우)
  qa_categories     — Q&A 카테고리

Domain F: Distribution (배포)
  email_logs        — 이메일 발송 로그 (배치)
  email_sends       — 개별 수신자별 발송/열람/클릭

Domain G: Curriculum (커리큘럼) — 별도 관리
  curriculum, blocks, schedules, assignments, progress, etc.
```

### 2-2. 도메인 간 연결 키

```
profiles.id (PK) ──────┬── ad_accounts.user_id
                        ├── leads.converted_user_id
                        ├── student_registry.matched_profile_id
                        ├── contents.author_id
                        ├── questions.author_id
                        ├── service_secrets.user_id
                        └── progress.user_id

ad_accounts.account_id ─┬── daily_ad_insights.account_id
                        └── daily_lp_metrics.account_id

contents.id ────────────┬── email_logs.content_id
                        └── content_sources.content_id (역추적)

cohorts.name ═══════════╤══ profiles.cohort (문자열 매칭, FK 없음)
                        └── student_registry.cohort
```

**점선 (═══)은 약한 연결**: FK 제약조건 없이 문자열 매칭. 향후 cohort_id FK로 강화 고려.

---

## 3. Layer 1: Services

### 3-1. KnowledgeService (knowledge.ts)

```
역할: RAG 검색 + LLM 생성
입력: query, consumerType, sourceTypes, 기타 파라미터
출력: { content, sourceRefs, tokensUsed, model }

의존: lecture_chunks (벡터 검색), Anthropic API (생성)
로깅: knowledge_usage (fire-and-forget)
```

**Consumer별 설정:**
| Consumer | 용도 | 소스 | 온도 |
|----------|------|------|------|
| qa | Q&A 답변 | lecture, qa_archive, manual | 0.3 |
| newsletter | 뉴스레터 초안 | lecture, crawl | 0.5 |
| education | 교육 콘텐츠 | lecture | 0.3 |
| chatbot | 실시간 챗봇 | 전체 | 0.4 |

**확장 포인트:**
- 새 consumer 추가: CONSUMER_CONFIGS에 항목 추가만으로 완료
- 새 소스 타입 추가: lecture_chunks.source_type에 값 추가, 검색 함수 변경 불필요
- 시스템 프롬프트 변경: 상수 수정 또는 request.systemPromptOverride

### 3-2. PerformanceService (★ 신규 — 현재 분산됨)

```
역할: 고객 성과 데이터 집계, 진단, 비교
현재 상태: aggregate.ts + API 라우트에 흩어져 있음
목표: 단일 서비스로 통합

핵심 함수:
  getAccountSummary(accountId, dateRange)     → 계정별 성과 요약
  getAccountDiagnosis(accountId, dateRange)   → 진단 등급 (A~F)
  getCohortStats(cohortName)                  → 기수별 통계
  getBeforeAfter(profileId)                   → 수강 전후 비교
  getPerformanceContext()                     → 콘텐츠용 성과 통계 텍스트

의존: profiles, ad_accounts, daily_ad_insights, daily_lp_metrics, benchmarks
```

**getPerformanceContext()** — 핵심 연결 함수:
- 전체 수강생 성과 통계를 텍스트로 반환
- KnowledgeService의 시스템 프롬프트에 주입 가능
- 콘텐츠 에디터에서 "성과 데이터 삽입" 시 호출
- 예: "현재 활성 수강생 23명, 평균 ROAS 3.2배, 상위 20% ROAS 5.1배"

### 3-3. CustomerService (★ 신규 — 현재 분산됨)

```
역할: 고객 여정 관리, 역할 전환, 리드 추적
현재 상태: admin actions + API 라우트에 흩어져 있음
목표: 단일 서비스로 통합

핵심 함수:
  getMemberWithPerformance(profileId)         → 회원 + 성과 통합 조회
  convertRole(profileId, newRole, metadata)   → 역할 전환 + 이력 기록
  getLeadFunnel(dateRange)                    → 리드 퍼널 통계
  getCohortMembers(cohortName)                → 기수별 회원 목록 + 성과

의존: profiles, leads, cohorts, student_registry, ad_accounts
```

---

## 4. Layer 2: Use Cases

### 4-1. QA 답변 생성

```
질문 등록
  → [after()] 백그라운드 실행
  → KnowledgeService.generate({ consumerType: "qa" })
  → answers 테이블에 저장 (is_ai=true, is_approved=false)
  → 관리자 검토 → 승인/수정/삭제

★ 확장: PerformanceService.getPerformanceContext()를
  시스템 프롬프트에 주입하면, AI 답변에 실적 근거 포함 가능
  예: "우리 수강생 데이터를 보면 CBO가 ABO보다 평균 32% 효율적입니다"
```

### 4-2. 콘텐츠 생산

```
소재 결정
  → KnowledgeService.generate({ consumerType: "newsletter" })
  → contents 테이블에 body_md 저장
  → AI 수정 요청 (reviseContentWithAI)
  → email_summary 생성
  → 게시/발송

★ 확장: 콘텐츠 소재로 성과 데이터 활용
  PerformanceService.getPerformanceContext() → 시스템 프롬프트 주입
  PerformanceService.getCohortStats() → 사례 기반 콘텐츠

콘텐츠 소재 파이프라인:
  ┌─ 지식 베이스 (강의 기반) ──────── 개념 설명, How-to
  ├─ ★ 성과 데이터 (실적 기반) ───── 사례, 벤치마크, Before/After
  ├─ 외부 트렌드 (메타 업데이트) ──── 최신 정보
  └─ Smith님 직접 ──────────────── 인사이트, 경험담
```

### 4-3. 성과 분석 (총가치각도기)

```
계정 선택 + 기간 설정
  → PerformanceService.getAccountSummary()
  → PerformanceService.getAccountDiagnosis()
  → 대시보드 렌더링

★ 확장: 관리자용 뷰
  → PerformanceService.getCohortStats()
  → 수강생 비교 테이블
  → 기수별 통계

★ 확장: 수강 전후 비교
  → PerformanceService.getBeforeAfter()
  → 역할 전환일 기준 성과 변화
```

### 4-4. 회원 관리

```
회원 목록/상세
  → CustomerService.getMemberWithPerformance()
  → 기본 정보 + 성과 카드 통합 표시

역할 전환
  → CustomerService.convertRole()
  → 전환 이력 기록 (Before/After 기준점)

리드 관리
  → CustomerService.getLeadFunnel()
  → UTM 기반 유입 경로 분석
```

---

## 5. Layer 3: Distribution

```
웹 UI
  ├── /dashboard         — 홈 대시보드
  ├── /questions         — Q&A 게시판 + 상세
  ├── /posts             — 정보공유 목록 + 상세
  ├── /protractor        — 총가치각도기 (수강생)
  ├── /admin/members     — 회원 관리
  ├── /admin/answers     — 답변 검토
  ├── /admin/content     — 콘텐츠 관리
  ├── /admin/protractor  — 각도기 관리 (관리자)
  └── /admin/accounts    — 광고계정 관리

이메일
  ├── 뉴스레터 발송 (contents → email_logs → email_sends)
  ├── 열람/클릭 추적 (email_sends.opened_at, clicked_at)
  └── 수신거부 (leads.email_opted_out, profiles)

API
  ├── /api/protractor/*  — 성과 데이터
  ├── /api/diagnose      — AI 진단
  ├── /api/email/*       — 이메일 발송
  └── /api/admin/*       — 관리자 기능
```

---

## 6. 데이터 순환 (Feedback Loops)

시스템이 스스로 개선되는 순환 구조:

```
Loop 1: QA 피드백
  질문 → AI 답변 → 관리자 승인 → qa_archive로 재임베딩
  → 다음 답변 품질 향상

Loop 2: 콘텐츠 성과
  콘텐츠 발행 → email_sends 열람/클릭 → 높은 반응 콘텐츠 분석
  → 다음 콘텐츠 주제/형식 개선

Loop 3: 수강생 성과 → 콘텐츠
  수강생 성과 축적 → 성과 통계 업데이트
  → 콘텐츠에 실적 인용 → 마케팅 효과 → 리드 유입

Loop 4: 리드 → 수강생 → 성과
  콘텐츠 → 리드 유입 (UTM 추적) → 가입 → 수강생 전환
  → 성과 축적 → 다시 콘텐츠 소재
```

```
        ┌──── 콘텐츠 ←── 성과 데이터
        │         │            ↑
        │         ▼            │
        │     리드 유입    수강생 성과
        │         │            ↑
        │         ▼            │
        └──→ 가입/전환 ──→ 계정 연결
```

---

## 7. ADR (Architecture Decision Records)

### ADR-1: 레이어 분리 원칙

**Status:** Accepted
**Decision:** Clean Architecture 4레이어 구조 채택
**Why:** 각 레이어 독립 변경 가능, 테스트 용이, 확장 시 영향 범위 명확
**Trade-off:** 초기 설계 비용 증가. 단순 기능에도 레이어 구분 필요.

### ADR-2: KnowledgeService Consumer 패턴

**Status:** Accepted (v3.1)
**Decision:** Consumer별 설정(limit, threshold, temperature, systemPrompt)으로 단일 generate 함수 분기
**Why:** 새 소비자 추가 = 설정 추가만으로 완료. 코어 로직 변경 불필요.
**확장:** 새 consumer 타입 추가 시 ConsumerType union에 값 추가 + CONSUMER_CONFIGS에 설정 추가

### ADR-3: PerformanceService 통합

**Status:** Proposed
**Decision:** 현재 aggregate.ts + API 라우트에 분산된 성과 로직을 PerformanceService로 통합
**Why:** 성과 데이터를 콘텐츠/회원관리에서 재사용하려면 단일 서비스 필요
**영향:** aggregate.ts → PerformanceService로 마이그레이션. API 라우트는 서비스 호출로 변경.

### ADR-4: 성과 → 콘텐츠 연결 방식

**Status:** Proposed
**Decision:** PerformanceService.getPerformanceContext()로 성과 통계를 텍스트화하여 KnowledgeService 시스템 프롬프트에 주입
**Why:** KnowledgeService 코어 로직 변경 없이 컨텍스트만 확장. Clean Architecture 원칙 유지.
**Alternative:** 성과 데이터를 lecture_chunks에 임베딩 → 검색 노이즈 증가 위험, 실시간 반영 어려움. 기각.

### ADR-5: cohort 연결 강화

**Status:** Proposed
**Decision:** profiles.cohort (문자열) → profiles.cohort_id (FK → cohorts.id) 마이그레이션
**Why:** 기수별 통계, 수강 전후 비교에 정확한 조인 필요. 현재 문자열 매칭은 오타 위험.
**영향:** profiles 스키마 변경, 기존 cohort 문자열 → cohort_id 마이그레이션 스크립트 필요.

### ADR-6: 역할 전환 이력 기록

**Status:** Proposed
**Decision:** profiles에 role_changed_at 컬럼 추가. 역할 변경 시 자동 갱신.
**Why:** 수강 전후 비교(Before/After)의 기준점. 없으면 "언제부터 수강생이었는지" 알 수 없음.
**Alternative:** 별도 role_history 테이블 → 복잡성 대비 가치 낮음. 단일 컬럼이면 충분.

---

## 8. 구현 로드맵

| Phase | 작업 | 레이어 | 의존 |
|-------|------|--------|------|
| 0 (완료) | QA 프롬프트 인간화 | L1 | — |
| **1** | PerformanceService 통합 | L1 | aggregate.ts 마이그레이션 |
| **2** | 회원 상세 + 성과 연동 | L2, L3 | Phase 1 |
| **3** | getPerformanceContext() | L1 | Phase 1 |
| **4** | QA/콘텐츠에 성과 컨텍스트 주입 | L2 | Phase 3 |
| **5** | 수강생 비교 테이블 (관리자) | L2, L3 | Phase 1 |
| **6** | cohort FK 마이그레이션 + role_changed_at | L0 | — |
| **7** | 수강 전후 비교 | L2, L3 | Phase 1, 6 |
| **8** | 콘텐츠 → 리드 UTM 추적 | L2, L3 | — |
| **9** | 이메일 열람/클릭 분석 | L2, L3 | — |

---

## 9. 레이어 검증 테스트

| 테스트 | 기대 결과 |
|--------|----------|
| Layer 0 (테이블) 변경 없이 UI 교체 가능? | ✅ Layer 3만 변경 |
| 이메일 발송 방식 변경 시 KS 영향? | ✅ 없음 (Layer 3 → Layer 1 의존 없음) |
| 새 consumer 추가 시 generate() 수정? | ✅ 불필요 (설정만 추가) |
| 임베딩 모델 교체 시 콘텐츠 UI 영향? | ✅ 없음 (Layer 0 → Layer 3 독립) |
| PerformanceService 없어도 QA 작동? | ✅ 기존대로 작동 (성과 컨텍스트만 빠짐) |
| 새 데이터 소스(예: GA4) 추가? | Layer 0에 테이블 + Layer 1에 서비스 확장 |
| 새 배포 채널(예: 카카오톡) 추가? | Layer 3만 추가 |
