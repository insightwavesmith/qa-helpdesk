# bscamp 성능 분석 보고서

**작성일**: 2026-03-12
**분석 대상**: bscamp 전체 사이트 (Next.js 16 + Supabase + Meta API)
**실측 기준**: 2026-03-12 08:08 KST

---

## 1. 현재 상태

### 1.1 실측 데이터

| 페이지/API | 응답 시간 | 상태 |
|-----------|----------|------|
| 대시보드 → Q&A (/questions) | 1,070ms | 🔴 느림 |
| 대시보드 → 정보공유 (/posts) | 1,063ms | 🔴 느림 |
| /api/protractor/accounts | 1,217ms | 🔴 느림 |
| /api/sales-summary | 475ms | 🟡 보통 |
| /api/protractor/insights | 1,273ms | 🔴 느림 |
| /api/protractor/total-value | 2,126ms | 🔴 매우 느림 |
| /api/protractor/overlap | 4,471ms | 🚨 심각 |
| /api/protractor/accounts (중복) | 1,274ms | 🔴 중복 호출 |

### 1.2 사용자 체감

- **총가치각도기 페이지**: accounts 로드(1.2초) + 병렬 API 최대(overlap 4.5초) = **약 5.7초**
- **Q&A/정보공유**: Server Action 완료 후 렌더링 = **약 1초**
- **30명 수강생이 매일 사용** — 탭 전환마다 1~5초 대기는 심각한 UX 문제

---

## 2. 아키텍처 분석

### 2.1 렌더링 방식

| 페이지 | 렌더링 | 데이터 페칭 | loading.tsx | Suspense |
|--------|--------|-----------|------------|---------|
| /dashboard | RSC → Client | Server Action (Promise.all) | ❌ | 개별 처리 |
| /questions | RSC + Suspense | Server Action | ✅ (인라인) | ✅ |
| /posts | RSC + Suspense | Server Action | ✅ (인라인) | ✅ |
| /reviews | RSC → Client | Server Action (Promise.all) | ❌ | ❌ |
| /protractor | RSC → Client | SWR (Route Handler) | ❌ | ✅ |
| /protractor/competitor | RSC → Client | SWR | ❌ | ❌ |
| /admin/content | Client | SWR | ❌ | ❌ |
| /admin/knowledge | Client | SWR (Route Handler) | ❌ | ❌ |
| /admin/members | RSC → Client | Server Action (Promise.all) | ❌ | ❌ |
| /admin/stats | RSC | Direct Query (6개 병렬) | ❌ | ❌ |
| /admin/email | Client | SWR + fetch 혼합 | ❌ | ✅ |
| /admin/reviews | Client | SWR | ❌ | ❌ |

**패턴 분포**:
- Server Action 패턴: questions, posts, members, answers, reviews (RSC에서 호출 → props 전달)
- SWR 패턴: protractor, content, knowledge, admin/accounts (Client에서 호출)
- Direct Query: stats (서버에서 직접 Supabase 쿼리)

### 2.2 Layout 계층 구조

```
app/layout.tsx (Root)
├── NuqsAdapter, ThemeProvider, MixpanelProvider, ClientToaster
├── Pretendard 폰트 (CDN: jsdelivr)
│
└── (main)/layout.tsx ← 🔴 매 요청마다 실행
    ├── createClient() + supabase.auth.getUser()
    ├── createServiceClient() → profiles 조회 (role)
    ├── role별 분기:
    │   ├── admin/assistant → DashboardSidebar + DashboardHeader
    │   │   └── getPendingAnswersCount() ← 🔴 매번 DB 호출 (캐시 없음)
    │   └── student/member → StudentHeader만
    │
    └── (main)/protractor/layout.tsx
        ├── 접근 제어 (lead→/pending, member→/dashboard)
        └── ProtractorTabNav
```

**문제**: `(main)/layout.tsx`가 **모든 페이지 전환마다** `getUser()` + `profiles` + `getPendingAnswersCount()` 실행. 이것만으로 200~400ms 소비.

### 2.3 데이터 흐름 — 총가치각도기 (가장 느린 페이지)

```
페이지 마운트
│
├─ [Server] page.tsx
│  ├── getUser() + profiles (role 확인)
│  ├── ad_accounts 조회 (연결 여부)
│  └── → RealDashboard (Client) 렌더
│
└─ [Client] RealDashboard (SWR 호출)
   │
   ├─ [1] accounts (1,217ms)
   │  └── SELECT * FROM ad_accounts WHERE active=true
   │
   └─ (accounts 완료 후 병렬 호출)
      ├─ [2] insights (1,273ms) ─────┐
      │  └── SELECT 25컬럼 FROM       │
      │     daily_ad_insights         │  Max = 4,471ms
      │     LIMIT 10,000              │
      │                               │
      ├─ [3] total-value (2,126ms) ──┤
      │  ├── t3_scores_precomputed    │  (캐시 미스 시)
      │  ├── daily_ad_insights 집계   │
      │  └── benchmarks 조회          │
      │                               │
      └─ [4] overlap (4,471ms) ──────┘
         ├── daily_overlap_insights 캐시 체크
         ├── adset_overlap_cache 캐시 체크
         └── Meta API 21회 호출 (캐시 미스 시)
            ├── fetchActiveAdsets: 4회
            ├── fetchPerAdsetReach: 1회
            ├── fetchCombinedReach: 1회
            └── Pair-wise C(8,2)=28조합: 15회 (CONCURRENCY=5)

총 워터폴: 1,217ms + 4,471ms = 약 5,700ms
```

### 2.4 번들 구조

**주요 의존성 크기**:

| 라이브러리 | 추정 크기 (gzip) | 사용 빈도 | 비고 |
|-----------|---------------|----------|------|
| @mdxeditor/editor | ~800KB | 콘텐츠 에디터 | dynamic import 적용 ✅ |
| @tiptap/* (10개 확장) | ~600KB | 이메일/포스트 에디터 | 일부 페이지만 |
| recharts | ~600KB | admin/knowledge만 | 🔴 제거 후보 |
| react-email + react-email-editor | ~650KB | 이메일 관리 | 일부 페이지만 |
| @supabase/supabase-js | ~200KB | 전체 | 필수 |
| lucide-react | ~80KB | 전체 | 필수 |
| 총 예상 | ~3.5-4MB | | |

**Dynamic Import 현황**:
- ✅ 적용: PostEditPanel, DetailSidebar, NewsletterEditPanel, ContentSettingsPanel
- ❌ 미적용: Recharts (admin/knowledge에서 직접 import), TipTap 에디터

### 2.5 캐싱 전략 현황

| 데이터 | 캐시 방식 | TTL | 히트율 |
|--------|---------|-----|-------|
| t3_scores_precomputed | DB 사전계산 | 24시간 | period=7,30,90: 높음 / period=1: 낮음 |
| ad_diagnosis_cache | DB 사전계산 | 24시간 | 높음 |
| daily_overlap_insights | DB 캐시 | 24시간 | 같은 기간 재방문: 높음 |
| adset_overlap_cache | DB 캐시 (pair별) | 24시간 | 같은 기간: 높음 |
| student_performance_daily | DB 사전계산 | 24시간 | 높음 |
| sales-summary | Next.js ISR | 5분 | 높음 |
| SWR (전역) | 메모리 | dedupingInterval 60초 | 🔴 부족 |
| daily_ad_insights | ❌ 없음 | — | 0% |
| benchmarks | ❌ 없음 | — | 0% |
| profiles (middleware role) | Cookie 캐시 | 5분 | 높음 |

### 2.6 Middleware

`src/lib/supabase/middleware.ts` (239줄):
- 인증 확인 + 역할 기반 라우팅
- Cookie 기반 role 캐싱 (x-user-role, x-onboarding-status, TTL 5분)
- 모든 비공개 경로에서 실행 → Supabase auth 왕복 추가

### 2.7 Next.js 설정

```typescript
// next.config.ts — 매우 기본적인 설정
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ hostname: "symvlrsmkjlztoopbnht.supabase.co" }],
  },
};
```

- experimental 설정 없음 (PPR, optimizePackageImports 등 미사용)
- standalone output 미설정
- webpack 커스텀 없음

---

## 3. 원인 분석

### 3.1 원인별 기여도 (총가치각도기 기준)

| 원인 | 기여 시간 | 기여도 | 근거 |
|------|----------|--------|------|
| **Meta API 왕복** (overlap pair-wise) | 2,400ms | **34%** | 28조합 × CONCURRENCY=5 = 6배치 |
| **Meta API 왕복** (overlap 기타) | 1,400ms | **20%** | fetchActiveAdsets + reach 3회 |
| **Supabase 쿼리** (insights 10,000행) | 800ms | **11%** | daily_ad_insights LIMIT 10,000 |
| **Supabase 쿼리** (total-value 집계) | 700ms | **10%** | insights 재조회 + benchmarks |
| **네트워크 왕복** (한국 ↔ Vercel/Supabase) | 600ms | **8%** | 각 요청 RTT ~100-200ms |
| **Layout 인증 체크** (매 전환) | 300ms | **4%** | getUser() + profiles + pendingCount |
| **accounts 중복 호출** | 1,200ms | **17%** | ✅ 커밋 2690138에서 개선 |
| **서버 렌더링/하이드레이션** | 200ms | **3%** | RSC → Client 전환 |
| **JS 번들 파싱** | 100ms | **1%** | dynamic import로 분산됨 |

### 3.2 원인별 기여도 (Q&A/정보공유 기준)

| 원인 | 기여 시간 | 기여도 | 근거 |
|------|----------|--------|------|
| **Layout 인증 체크** | 300ms | **28%** | (main)/layout.tsx 매번 실행 |
| **Supabase 쿼리** | 400ms | **37%** | getQuestions/getPosts Server Action |
| **네트워크 왕복** (한국 ↔ Vercel) | 200ms | **19%** | 서버 → DB → 서버 → 클라이언트 |
| **서버 렌더링** | 100ms | **9%** | RSC + Suspense 처리 |
| **기타** (hydration, JS) | 70ms | **7%** | |

### 3.3 페이지별 지연 원인 요약

```
/questions (1,070ms)
├── Layout auth + profile: 300ms
├── getQuestions() Server Action: 400ms (DB 쿼리 + 필터)
├── getCategories() Server Action: 100ms
├── 네트워크 왕복: 200ms
└── SSR + hydration: 70ms

/posts (1,063ms)
├── Layout auth + profile: 300ms
├── getPosts() Server Action: 400ms (DB 쿼리 + is_pinned 분리)
├── 네트워크 왕복: 200ms
└── SSR + hydration: 163ms

/protractor (5,700ms)
├── Layout auth + profile: 300ms
├── Server page: ad_accounts 조회: 200ms
├── Client: accounts SWR: 1,200ms
├── Client: overlap SWR: 4,471ms (병렬 최대값)
│   ├── DB 캐시 체크: 100ms
│   ├── Meta API fetchActiveAdsets: 600ms
│   ├── Meta API reach: 800ms
│   └── Meta API pair-wise: 2,400ms
└── 네트워크 왕복: 200ms (overlap에 포함)
```

---

## 4. 개선 방안

### P0 — 즉시 적용 (구현 1일 이내)

#### 4.1 SWR dedupingInterval 증대
- **현재**: 60초 → **개선**: 300초 (5분)
- **파일**: `src/lib/swr/config.ts`
- **예상 효과**: 탭 재방문 시 캐시 히트율 대폭 상승 (60초→300초)
- **난이도**: ⭐ (설정값 변경 1줄)
- **리스크**: 최대 5분간 구 데이터 표시 (keepPreviousData와 결합하면 UX 괜찮음)

#### 4.2 HTTP Cache-Control 헤더 추가
- **현재**: 모든 API에 캐시 헤더 없음
- **개선**: Protractor API에 `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` 추가
- **파일**: `/api/protractor/accounts/route.ts`, `/api/protractor/insights/route.ts` 등
- **예상 효과**: Vercel CDN 캐시 활용 → 반복 요청 100ms 이내
- **난이도**: ⭐ (각 API에 헤더 1줄 추가)
- **리스크**: 낮음 (stale-while-revalidate로 신선도 유지)

#### 4.3 Layout getPendingAnswersCount() 캐시
- **현재**: `(main)/layout.tsx`에서 매 요청마다 DB 쿼리
- **개선**: `unstable_cache()` 또는 revalidateTag 사용 (60초 TTL)
- **파일**: `src/app/(main)/layout.tsx`
- **예상 효과**: -100~200ms (매 페이지 전환 시)
- **난이도**: ⭐⭐
- **리스크**: 낮음 (미답변 수가 분 단위로 바뀌지 않음)

#### 4.4 insights API 컬럼 최소화
- **현재**: 25개 컬럼 전부 SELECT, LIMIT 10,000
- **개선**: 실제 사용 컬럼만 SELECT (약 15개), 기본 LIMIT 2,000으로 축소
- **파일**: `/api/protractor/insights/route.ts`
- **예상 효과**: -200~400ms (데이터 전송량 40% 감소)
- **난이도**: ⭐⭐
- **리스크**: 낮음 (프론트에서 사용하지 않는 컬럼 제거)

### P1 — 단기 개선 (구현 3일 이내)

#### 4.5 Overlap API CONCURRENCY 증대 + 캐시 전략 강화
- **현재**: CONCURRENCY=5 → pair-wise 6배치 (2,400ms)
- **개선**: CONCURRENCY=10 → pair-wise 3배치 (1,200ms)
- **추가**: 상위 adset 8개 → 6개로 축소 (C(6,2)=15조합, 현재 28조합 대비 46% 감소)
- **파일**: `/api/protractor/overlap/route.ts`
- **예상 효과**: -1,200~2,000ms
- **난이도**: ⭐⭐
- **리스크**: Meta API rate limit 모니터링 필요 (100req/분 제한)

#### 4.6 insights 사전계산 캐시 추가
- **현재**: daily_ad_insights 매번 쿼리 + 클라이언트 집계
- **개선**: `insights_aggregated_daily` 테이블 추가 (기간별 사전집계)
- **구현**: cron/collect-daily 후 집계 데이터 저장 → API에서 캐시 우선 조회
- **예상 효과**: -600ms (insights API), -700ms (total-value API 부분)
- **난이도**: ⭐⭐⭐
- **리스크**: 중간 (DB 마이그레이션 + cron 수정 필요)

#### 4.7 loading.tsx 추가 (체감 속도 개선)
- **현재**: /protractor, /dashboard, /reviews에 loading.tsx 없음
- **개선**: Skeleton UI loading.tsx 추가 → 즉시 시각적 피드백
- **파일**: 각 라우트 디렉토리에 loading.tsx 생성
- **예상 효과**: 실제 로딩 시간 변화 없지만 **체감 속도 대폭 개선**
- **난이도**: ⭐⭐
- **리스크**: 없음

#### 4.8 Protractor accounts → page.tsx Server에서 props 전달
- **현재**: page.tsx(Server)에서 ad_accounts 조회 후 → RealDashboard(Client)에서 SWR로 **다시 조회**
- **개선**: Server에서 조회한 accounts를 props로 전달 → SWR fallbackData 사용
- **예상 효과**: -1,200ms (accounts API 호출 제거)
- **난이도**: ⭐⭐
- **리스크**: 낮음

### P2 — 중기 개선 (구현 1~2주)

#### 4.9 Next.js optimizePackageImports 설정
- **현재**: 미설정
- **개선**: next.config.ts에 `experimental.optimizePackageImports` 추가
  ```typescript
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', '@tiptap/react']
  }
  ```
- **예상 효과**: 번들 크기 10~20% 감소 → 초기 로딩 -100~200ms
- **난이도**: ⭐
- **리스크**: 낮음

#### 4.10 Recharts 제거 또는 경량 대체
- **현재**: ~600KB, admin/knowledge 1곳에서만 사용
- **개선**: lightweight-charts 또는 Chart.js로 대체, 또는 dynamic import
- **예상 효과**: 번들 -600KB
- **난이도**: ⭐⭐⭐
- **리스크**: 중간 (차트 UI 재구현)

#### 4.11 TipTap 확장 최소화
- **현재**: 10개 이상 확장 패키지 로드 (~600KB)
- **개선**: 사용하는 확장만 로드 + dynamic import 적용
- **예상 효과**: 번들 -200~300KB (이메일 관련 페이지만 로드)
- **난이도**: ⭐⭐
- **리스크**: 낮음

#### 4.12 Overlap 백그라운드 갱신 패턴
- **현재**: 사용자 요청 시 Meta API 동기 호출 → 4.5초 대기
- **개선**: cron에서 미리 계산 + 사용자 요청 시 캐시 데이터 즉시 반환
  - `/api/cron/compute-overlap` 추가 (매일 1회)
  - 사용자 요청: DB 캐시만 조회 → 100ms 이내
- **예상 효과**: overlap -4,000ms → 100ms (캐시 히트 시)
- **난이도**: ⭐⭐⭐
- **리스크**: 중간 (cron 추가 + 모든 계정 × 기간 조합 사전계산 필요)

### P3 — 장기 개선 (아키텍처 변경)

#### 4.13 권한 확인 JWT 클레임 활용
- **현재**: 매 요청마다 `profiles` 테이블 조회 (role 확인)
- **개선**: Supabase JWT custom claims에 role 포함 → DB 쿼리 제거
- **예상 효과**: 매 요청 -50~100ms (profiles 조회 제거)
- **난이도**: ⭐⭐⭐⭐
- **리스크**: 높음 (Supabase auth hook 변경, 기존 role 로직 전수 점검)

#### 4.14 Edge Runtime 활용
- **현재**: 모든 API가 Node.js Runtime (Serverless Function)
- **개선**: 단순 캐시 조회 API를 Edge Runtime으로 전환 (accounts, insights)
- **예상 효과**: 콜드스타트 -300~500ms
- **난이도**: ⭐⭐⭐⭐
- **리스크**: 높음 (Supabase SDK Edge 호환성 확인 필요)

---

## 5. 권장 실행 순서

### 즉시 (1일 이내, 코드 변경 최소)

| # | 개선 | 예상 효과 | 난이도 |
|---|------|----------|--------|
| 1 | SWR dedupingInterval 60초 → 300초 | 반복 방문 -3,000ms | ⭐ |
| 2 | HTTP Cache-Control 헤더 추가 | CDN 캐시 활용, 반복 요청 -1,000ms | ⭐ |
| 3 | Layout getPendingAnswersCount 캐시 | 매 전환 -100~200ms | ⭐⭐ |
| 4 | insights 컬럼 최소화 + LIMIT 축소 | -200~400ms | ⭐⭐ |

### 단기 (1주 이내)

| # | 개선 | 예상 효과 | 난이도 |
|---|------|----------|--------|
| 5 | Protractor accounts Server props 전달 | -1,200ms | ⭐⭐ |
| 6 | Overlap CONCURRENCY 10 + adset 6개 제한 | -1,200~2,000ms | ⭐⭐ |
| 7 | loading.tsx 추가 (체감 속도) | 체감 -50% | ⭐⭐ |
| 8 | optimizePackageImports 설정 | 번들 -10~20% | ⭐ |

### 중기 (2주 이내)

| # | 개선 | 예상 효과 | 난이도 |
|---|------|----------|--------|
| 9 | Overlap cron 백그라운드 갱신 | overlap -4,000ms | ⭐⭐⭐ |
| 10 | insights 사전계산 캐시 | -600ms | ⭐⭐⭐ |
| 11 | Recharts 제거/대체 | 번들 -600KB | ⭐⭐⭐ |
| 12 | TipTap dynamic import | 번들 -200~300KB | ⭐⭐ |

### 예상 개선 효과 종합

```
현재 총가치각도기: ~5,700ms
├── 즉시 적용 후:   ~4,000ms (-30%)
├── 단기 적용 후:   ~2,000ms (-65%)
└── 중기 적용 후:   ~500ms  (-91%, 캐시 히트 기준)

현재 Q&A/정보공유: ~1,070ms
├── 즉시 적용 후:   ~700ms (-35%)
└── 단기 적용 후:   ~400ms (-63%)
```

---

## 부록 A: API 엔드포인트 쿼리 맵

| 엔드포인트 | 쿼리 수 | 캐시 | 병렬화 | 실측 |
|-----------|---------|------|--------|------|
| GET /api/protractor/accounts | 1 | SWR 60초 | — | 1,217ms |
| GET /api/protractor/insights | 1 | SWR 60초 | — | 1,273ms |
| GET /api/protractor/total-value | 1~3 | DB 24시간 | 부분 | 2,126ms |
| GET /api/protractor/overlap | 5~30+ | DB 24시간 | CONCURRENCY=5 | 4,471ms |
| GET /api/protractor/benchmarks | 2 | — | 부분 | — |
| GET /api/sales-summary | 프록시 | ISR 5분 | — | 475ms |
| GET /api/diagnose | 1~3 | DB 24시간 | 부분 | — |
| GET /api/admin/protractor/status | 4 | — | 부분 | — |
| POST /api/admin/protractor/collect | 1+N | — | 부분 | — |

## 부록 B: Server Action 쿼리 맵

| Action | 함수 | 쿼리 수 | 패턴 |
|--------|------|---------|------|
| questions.ts | getQuestions | 1 | 필터 체이닝 |
| questions.ts | createQuestion | 2 | INSERT + AI 비동기 |
| posts.ts | getPosts | 1 | 필터 + 페이지네이션 |
| answers.ts | getPendingAnswers | 1 | JOIN author/question |
| answers.ts | approveAnswer | 2 | UPDATE + QA 임베딩 |
| contents.ts | getContents | 1 | 다중 필터 |
| contents.ts | deleteContent | 4 | 순차 DELETE (FK) |
| admin.ts | getMembers | 2 | profiles + ad_accounts |
| performance.ts | getStudentPerformance | 1~3 | 사전계산 캐시 |
| recipients.ts | getRecipientStats | 3 | Promise.all 병렬 |

## 부록 C: daily_ad_insights 중복 조회 현황

동일 테이블을 여러 엔드포인트에서 독립 조회:

| 엔드포인트 | 조회 조건 | 캐시 |
|-----------|----------|------|
| /api/protractor/total-value | account_id + date range | 사전계산 (t3_scores) |
| /api/protractor/insights | account_id + date range | ❌ 없음 |
| /api/diagnose | account_id + date range | 사전계산 (ad_diagnosis_cache) |
| /api/admin/protractor/status | 최근 3일, 카운트만 | ❌ 없음 |
| performance.ts | 학생별 계정 데이터 | 사전계산 |

**개선 방향**: insights API에도 사전계산 캐시 도입하면 중복 쿼리 대부분 해소.
