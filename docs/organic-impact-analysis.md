# 오가닉 채널 영향 분석

> 분석일: 2026-03-13
> 기반 문서: `docs/content-hub-analysis.md`
> 목적: 오가닉 채널(외부 발행) 메뉴 추가 시 기존 코드베이스 재사용/분리/영향 범위 파악

---

## 1. 재사용 가능한 컴포넌트

### 1-1. UI 컴포넌트 (`src/components/curation/`)

| 컴포넌트 | 현재 용도 | 오가닉 재사용 | 수준 | 비고 |
|----------|-----------|-------------|------|------|
| `curation-card.tsx` | 큐레이션 인박스 카드 (AI요약, 중요도, 토픽) | 오가닉 콘텐츠 리스트 카드 | **높음** | props 기반 렌더링, 데이터 소스 무관 |
| `curation-tab.tsx` | 날짜별 그룹 리스트 (인박스 모드) | 오가닉 콘텐츠 날짜별 그룹 | **높음** | `CurationContentWithLinks[]` 받아서 렌더링만 |
| `info-share-tab.tsx` | 정보공유 게시 목록 테이블 | 오가닉 발행 완료 목록 | **높음** | 테이블 구조 그대로, 컬럼명만 조정 |
| `generate-preview-modal.tsx` | AI 정보공유 생성 프리뷰 | 오가닉 콘텐츠 AI 생성 프리뷰 | **중간** | 시스템 프롬프트 분기 필요 (내부용 vs 외부용 톤) |
| `pipeline-sidebar.tsx` | 소스별 학습 파이프라인 현황 | 오가닉 채널별 통계 사이드바 | **중간** | 통계 쿼리 교체 필요 (`getPipelineStats` → 오가닉 전용) |
| `topic-map-view.tsx` | 토픽별 그룹 뷰 | 오가닉 토픽/카테고리 뷰 | **높음** | props 전달 구조 |
| `curriculum-view.tsx` | blueprint/lecture 트리뷰 | 재사용 불가 | **없음** | 커리큘럼 전용 로직 (레벨별 정렬, 순차 발행 잠금) |
| `deleted-section.tsx` | 소프트 삭제 복원 UI | 오가닉 삭제/보관 복원 | **높음** | 범용 구조 |

### 1-2. Server Actions 재사용

| 함수 | 파일 | 재사용 | 방법 |
|------|------|--------|------|
| `getCurationContents()` | `curation.ts` | **가능** | `source_type` 필터에 오가닉 값 추가 |
| `getCurationStatusCounts()` | `curation.ts` | **가능** | 오가닉 소스 기준 카운트 분기 |
| `batchUpdateCurationStatus()` | `curation.ts` | **가능** | 상태 전환 로직 동일 |
| `createInfoShareDraft()` | `curation.ts` | **복제 후 수정** | `source_type='organic'` + 외부 발행 메타데이터 |
| `embedContentToChunks()` | `embed-pipeline.ts` | **그대로** | `source_type` 무관하게 동작 |
| `publishContent()` | `contents.ts` | **확장** | `distributions.channel`에 외부 플랫폼 추가 |
| `crawlUrl()` | `contents.ts` | **그대로** | 외부 URL 크롤링 → 오가닉 소재로 활용 |
| `generateContentWithAI()` | `contents.ts` | **가능** | KS(knowledge.ts) 호출 구조 동일 |

### 1-3. 타입/인터페이스 재사용

| 타입 | 파일 | 재사용 | 비고 |
|------|------|--------|------|
| `Content` | `types/content.ts` | **그대로** | `source_type: string`이라 enum 제약 없음 |
| `CurationContentWithLinks` | `types/content.ts` | **확장** | `linked_info_shares` → `linked_organic_posts` 추가 가능 |
| `Distribution` | `types/content.ts` | **그대로** | `channel: string`이라 외부 플랫폼 값 자유 |
| `ContentSource` | `types/content.ts` | **그대로** | RSS/API 피드 소스 관리에 적합 |

---

## 2. 분리 필요 항목: 정보공유(내부) vs 오가닉(외부)

### 2-1. 핵심 경계선

```
정보공유 (info_share)                    오가닉 (organic)
────────────────────────────────────────────────────────────────
대상: 내부 회원 (사관학교 수강생)        대상: 외부 팔로워 (SNS/블로그 구독자)
톤: 교육/코칭 (Smith 코치 말투)          톤: 마케팅/브랜딩 (전문가 퍼블릭 톤)
채널: 사이트 내 정보공유 게시판           채널: Meta/Instagram/블로그/뉴스레터
소스: 큐레이션 파이프라인 산출물          소스: 큐레이션 + 독립 기획 콘텐츠
승인: 즉시 발행 (admin 권한)             승인: 스케줄링 + 플랫폼별 포맷 검토
분석: 조회수                             분석: 도달/참여/전환 (플랫폼 네이티브)
RAG: 즉시 임베딩 (지식베이스 반영)        RAG: 선택적 임베딩 (외부 콘텐츠는 별도 판단)
```

### 2-2. 분리가 필요한 구체 항목

| 영역 | 분리 이유 | 구현 방향 |
|------|-----------|-----------|
| **시스템 프롬프트** | 정보공유는 "수강생 대상 교육 톤", 오가닉은 "외부 전문가 브랜딩 톤" | `generate` API에 `target: 'internal' \| 'external'` 파라미터 |
| **발행 워크플로** | 정보공유는 즉시 게시, 오가닉은 플랫폼별 예약/포맷 검증 필요 | 오가닉 전용 상태: `draft → scheduled → published → archived` |
| **콘텐츠 포맷** | 정보공유는 마크다운 원본, 오가닉은 플랫폼별 글자수/해시태그/썸네일 규격 | 포맷 변환 레이어 (SNS: 2200자+해시태그, 블로그: 풀 마크다운) |
| **분석 대시보드** | 정보공유는 내부 조회수, 오가닉은 외부 플랫폼 메트릭 | 별도 분석 뷰 (Meta Insights, 블로그 GA 연동) |
| **source_type 값** | `info_share`와 구분 필요 | `organic`, `organic_meta`, `organic_blog` 등 신규 enum |

### 2-3. 공유 가능한 항목 (분리 불필요)

- `contents` 테이블 스키마 — `source_type` 컬럼으로 자연 분리
- `content_relations` — 소스→생성물 관계 추적 구조 동일
- `knowledge_chunks` — 임베딩 파이프라인 공유 (오가닉도 RAG 지식 기여 가능)
- `curation_status` 상태 머신 — `new → selected → published` 흐름 동일

---

## 3. 공유 API vs 신규 필요 API

### 3-1. 공유 가능 API

| 기존 API | 경로 | 오가닉 활용 |
|----------|------|------------|
| AI 콘텐츠 생성 | `POST /api/admin/curation/generate` | 시스템 프롬프트만 분기하면 오가닉용 생성 가능 |
| AI 요약/중요도 배치 | `POST /api/admin/curation/backfill` | 오가닉 콘텐츠에도 AI 요약 적용 가능 |
| 임베딩 실행 | `POST /api/admin/embed` | `embedContentToChunks()` — source_type 무관 |
| 뉴스레터 요약 | `POST /api/admin/content/summarize` | 오가닉 → 뉴스레터 변환에 재사용 |
| 이메일 발송 | `POST /api/admin/email/send` | 오가닉 콘텐츠 이메일 배포 |

### 3-2. 신규 필요 API

| 신규 API | Method | 용도 | 복잡도 |
|----------|--------|------|--------|
| `/api/admin/organic/contents` | GET | 오가닉 콘텐츠 목록 (필터/정렬) | **낮음** — `getCurationContents()` 변형 |
| `/api/admin/organic/create` | POST | 오가닉 콘텐츠 초안 생성 | **낮음** — `createInfoShareDraft()` 변형 |
| `/api/admin/organic/publish` | POST | 외부 플랫폼 발행 | **높음** — Meta Graph API/블로그 API 연동 |
| `/api/admin/organic/schedule` | POST | 예약 발행 | **중간** — 스케줄 테이블 + 크론/큐 |
| `/api/admin/organic/analytics` | GET | 플랫폼별 성과 집계 | **높음** — Meta Insights API 등 외부 연동 |
| `/api/admin/organic/format` | POST | 플랫폼별 포맷 변환 (글자수, 해시태그) | **중간** — AI 기반 요약/변환 |

### 3-3. Server Actions 분류

```
공유 (기존 그대로)          확장 (파라미터 추가)           신규 (오가닉 전용)
─────────────────────────────────────────────────────────────────────
embedContentToChunks()     getCurationContents()         getOrganicContents()
crawlUrl()                 publishContent()              createOrganicDraft()
generateContentWithAI()    getCurationStatusCounts()     scheduleOrganicPost()
softDeleteContents()       createInfoShareDraft()        getOrganicAnalytics()
restoreContents()          getPipelineStats()            formatForPlatform()
```

---

## 4. 사이드바 수정사항

### 4-1. 현재 구조 (`src/components/layout/app-sidebar.tsx`)

```typescript
// 일반 메뉴 (55-62행)
const mainNavItems: NavItem[] = [
  { label: "대시보드",     href: "/dashboard",   icon: LayoutDashboard },
  { label: "Q&A",          href: "/questions",   icon: MessageCircleQuestion },
  { label: "정보 공유",    href: "/posts",       icon: FileText },
  { label: "공지사항",     href: "/notices",     icon: Megaphone },
  { label: "총가치각도기", href: "/protractor",  icon: Crosshair },
  { label: "설정",         href: "/settings",    icon: Settings },
];

// 관리자 메뉴 (64-76행)
const adminNavItems: NavItem[] = [
  { label: "회원 관리",         href: "/admin/members",                 icon: Users },
  { label: "수강생 성과",       href: "/admin/performance",             icon: TrendingUp },
  { label: "답변 검토",         href: "/admin/answers",                 icon: CheckCircle },
  { label: "콘텐츠 관리",       href: "/admin/content",                 icon: FileText },
  { label: "총가치각도기 관리", href: "/admin/protractor",              icon: Crosshair },
  { label: "벤치마크 관리",     href: "/admin/protractor/benchmarks",   icon: BarChart3 },
  { label: "광고계정 관리",     href: "/admin/accounts",                icon: Monitor },
  { label: "내 광고계정",       href: "/admin/owner-accounts",          icon: BarChart3 },
  { label: "수강후기 관리",     href: "/admin/reviews",                 icon: Star },
];
```

### 4-2. 추가 방법

**방법 A: 관리자 메뉴에 독립 항목 추가 (권장)**

```typescript
import { Share2 } from "lucide-react";  // 24행에 추가

const adminNavItems: NavItem[] = [
  // ... 기존 항목 유지
  { label: "콘텐츠 관리",   href: "/admin/content",   icon: FileText },
  { label: "오가닉 채널",   href: "/admin/organic",   icon: Share2 },    // ← 신규
  // ... 나머지
];
```

- 장점: 기존 콘텐츠 관리와 명확히 분리, 독립 페이지 라우팅
- 변경 범위: `app-sidebar.tsx` 1줄 추가 + `src/app/(main)/admin/organic/page.tsx` 신규

**방법 B: 콘텐츠 관리 탭 확장**

```
콘텐츠 관리 (/admin/content)
├── 큐레이션 탭 (tab=curation)      ← 기존
├── 콘텐츠 탭 (tab=contents)        ← 기존
├── 정보공유 탭 (tab=posts)         ← 기존
├── 오가닉 탭 (tab=organic)         ← 신규
└── 이메일 탭 (tab=email)           ← 기존
```

- 장점: 사이드바 변경 없음, 콘텐츠 허브 안에서 통합 관리
- 단점: 탭 5개 → UX 과밀, 오가닉 전용 기능(스케줄링/분석)이 탭 안에 갇힘

**권장: 방법 A** — 오가닉은 발행 채널·분석·스케줄링 등 독립 기능이 많아서 별도 메뉴가 적합.

### 4-3. 뱃지 기능

현재 `renderNavItem`(110-148행)에 뱃지 로직이 있음 (`/admin/answers`에 `pendingAnswersCount`).
오가닉 메뉴에도 동일 패턴 적용 가능:

```typescript
// AppSidebarProps에 추가
pendingOrganicCount?: number;

// renderNavItem 내부 showBadge 조건 확장
const showBadge =
  (item.href === "/admin/answers" && pendingAnswersCount > 0) ||
  (item.href === "/admin/organic" && pendingOrganicCount > 0);
```

---

## 5. 학습 파이프라인이 오가닉 채널에 미치는 영향

### 5-1. style-learner (말투 학습)

**현재 흐름** (`src/lib/style-learner.ts`):
```
답변 승인 10개마다 자동 트리거
  → analyzeApprovedAnswers(50): Q&A 승인 답변 수집 (가중치: admin 직접 3, admin+AI 2, 일반 1)
  → generateStyleProfile(): Claude Sonnet으로 어미/톤 분석 → JSON
  → buildStyleText(): [말투] 섹션 텍스트 생성
  → saveStyleProfile(): style_profiles 테이블 저장
  → QA 시스템 프롬프트에 주입 (knowledge.ts)
```

**오가닉 영향:**

| 항목 | 영향도 | 설명 |
|------|--------|------|
| 학습 소스 | **없음** | 오가닉 콘텐츠는 학습 대상이 아님 (Q&A 답변만 학습) |
| 톤 적용 | **분기 필요** | 현재 `buildStyleText()`는 "Smith 코치" 말투 → 내부 교육 톤. 오가닉은 "전문가 퍼블릭" 톤이 필요하므로, **오가닉 생성 시 style_text 주입을 스킵하거나 별도 프로필 사용** |
| 오가닉 전용 톤 학습 | **신규 기능** | 필요 시 `analyzeOrganicPosts()` → 외부 발행 톤 학습 파이프라인 추가. 단, 초기에는 수동 톤 가이드로 충분 |

**실행 판단:** style-learner의 `getLatestStyleText()`를 오가닉 AI 생성에 직접 쓰면 안 됨. 내부 교육 톤이 외부 브랜딩 톤과 충돌. 분기 로직 필수:

```
if (target === 'internal') → style_text 주입 (현재 그대로)
if (target === 'external') → 오가닉 톤 가이드 주입 (별도 관리)
```

### 5-2. domain-intelligence (도메인 인텔리전스)

**현재 흐름** (`src/lib/domain-intelligence.ts`):
```
사용자 질문 입력
  → analyzeDomain(): Claude Sonnet으로 질문 분석
    ├─ normalizedTerms: 줄임말/오타 정규화 (ASC→Advantage Shopping Campaign)
    ├─ intent: 실제 의도 파악
    ├─ questionType: lecture/platform/troubleshooting/non_technical
    ├─ complexity: simple/medium/complex
    ├─ suggestedSearchQueries: RAG 검색 최적화 쿼리
    └─ skipRAG 판정 → 필요시 Brave Search → glossary 자동 저장
```

**오가닉 영향:**

| 항목 | 영향도 | 설명 |
|------|--------|------|
| 용어 정규화 | **긍정적** | 오가닉 콘텐츠도 동일 도메인(메타 광고). 용어 정규화 사전이 풍부해지면 Q&A와 오가닉 모두 이득 |
| RAG 지식 증가 | **긍정적** | 오가닉 콘텐츠가 임베딩되면 `knowledge_chunks` 풍부해짐 → Q&A 답변 품질 향상 |
| glossary 캐시 | **주의** | 오가닉 콘텐츠 생성 과정에서 새 용어가 glossary에 추가될 수 있음. 외부용 설명이 내부 QA에 노출되면 톤 불일치 가능 → `source_type` 필터로 분리 |

### 5-3. curriculum-view (커리큘럼 뷰)

**현재 흐름** (`src/components/curation/curriculum-view.tsx`):
```
PipelineSidebar에서 소스 선택
  → getCurriculumContents(sourceType): blueprint 또는 lecture 콘텐츠 조회
  → 레벨별 그룹 정렬 (입문/실전/분석)
  → 순차 발행 잠금 (이전 항목 발행 완료 전까지 다음 잠금)
  → 발행 진행률 바
```

**오가닉 영향:**

| 항목 | 영향도 | 설명 |
|------|--------|------|
| 커리큘럼 → 오가닉 변환 | **신규 기회** | 커리큘럼 콘텐츠(blueprint/lecture)를 외부용으로 재가공하여 오가닉 발행 가능. 단 원본은 수정하지 않고 `content_relations`로 연결 |
| 발행 순서 로직 | **재사용 불가** | 커리큘럼의 순차 잠금은 교육 과정 특화. 오가닉은 자유 발행 |
| 파이프라인 통계 | **확장 가능** | `getPipelineStats()`에 오가닉 소스 카운트 추가 → 큐레이션 사이드바에서 오가닉 현황도 한눈에 |

### 5-4. 통합 영향 다이어그램

```
                    ┌─────────────────────────┐
                    │    knowledge_chunks      │
                    │    (RAG 벡터 스토어)      │
                    └────────┬────────────────┘
                             │ 공유
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   Q&A 답변 생성         정보공유 생성        오가닉 생성
   (knowledge.ts)        (curation/generate)   (organic/generate) ← 신규
          │                  │                  │
          ▼                  ▼                  ▼
   style-learner         style-learner        오가닉 톤 가이드 ← 분리
   [말투] 주입           [말투] 주입           [외부 톤] 주입
          │                  │                  │
          ▼                  ▼                  ▼
   domain-intelligence   즉시 게시            플랫폼별 포맷팅 ← 신규
   (질문 분석)           (내부 게시판)         (Meta/블로그)
          │                                     │
          ▼                                     ▼
   답변 승인 ──────────────────────────────→ 임베딩 (공유)
   (10개마다 style-learner 재학습)           (embedContentToChunks)
```

### 5-5. 주의사항 요약

| 파이프라인 | 오가닉 도입 시 필요 조치 | 우선순위 |
|-----------|------------------------|---------|
| style-learner | 오가닉 생성 시 내부 말투 주입 방지. `target` 파라미터로 분기 | **P0** — 이거 안 하면 외부 발행물에 교육 톤 혼입 |
| domain-intelligence | 변경 없음. 오가닉도 동일 도메인이라 자연스럽게 이득 | **P2** — 자동 혜택 |
| curriculum-view | 오가닉 변환 기능은 Phase 2에서. 초기에는 커리큘럼과 무관하게 운영 | **P3** — 후순위 |
| embed-pipeline | 오가닉 콘텐츠 임베딩 여부 정책 결정 필요. 외부 공개 콘텐츠가 RAG에 들어가면 Q&A 답변에 노출 가능 | **P1** — 정책 결정 |
| glossary 캐시 | `source_type` 필터 추가하여 오가닉 용어가 내부 QA glossary에 혼입되지 않도록 | **P2** — 중기 |

---

## 부록: 파일 변경 영향 범위 요약

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `src/components/layout/app-sidebar.tsx` | 1줄 추가 | adminNavItems에 오가닉 메뉴 항목 |
| `src/app/(main)/admin/organic/page.tsx` | **신규** | 오가닉 채널 관리 페이지 |
| `src/components/organic/` | **신규 디렉토리** | 오가닉 전용 컴포넌트 (재사용 컴포넌트는 import) |
| `src/actions/organic.ts` | **신규** | 오가닉 전용 Server Actions |
| `src/api/admin/organic/` | **신규** | 외부 플랫폼 연동 API |
| `src/types/content.ts` | 타입 추가 | `OrganicContentWithLinks`, 오가닉 관련 타입 |
| `src/actions/curation.ts` | 수정 없음 | 기존 정보공유 로직 유지 |
| `src/actions/contents.ts` | 수정 없음 | 기존 콘텐츠 CRUD 유지 |
| `src/lib/style-learner.ts` | 수정 없음 | 오가닉 쪽에서 호출 안 함 (분기는 호출부에서) |
| `src/lib/domain-intelligence.ts` | 수정 없음 | 자연 공유 |
| `src/lib/embed-pipeline.ts` | 수정 없음 | source_type 무관 동작 |
