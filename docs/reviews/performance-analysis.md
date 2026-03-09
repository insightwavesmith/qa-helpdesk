# 서비스 전반 성능 분석 보고서

**분석일**: 2026-03-09
**분석 대상**: QA Helpdesk (Next.js 15 App Router + Supabase)
**환경**: Vercel 배포 기준

---

## P0 — 즉시 해결 필요

### 1. overlap API 순차 Meta API 호출 (최대 55초 블로킹)

- **위치**: `src/app/api/protractor/overlap/route.ts:208~267`
- **문제**: 최대 8개 adset → 28쌍 순차 Meta API 호출 + 각 pair마다 DB upsert도 순차
- **영향**: 캐시 미스 시 첫 요청 최대 55초 블로킹. 사용자 체감 심각
- **개선 방향**: `Promise.allSettled`로 병렬화 (Meta API rate limit 고려하여 concurrency 3~5 제한)

### 2. daily_ad_insights limit 없는 전수 조회

- **위치**: `src/app/api/protractor/insights/route.ts:34~40`
- **문제**: `.select("*").eq("account_id").gte("date").lte("date")` — limit 없음. 대형 계정 + 긴 기간 시 수만 행 반환
- **영향**: OOM/타임아웃 위험
- **개선 방향**: `(account_id, date)` 복합 인덱스 생성 + limit 추가

### 3. pgvector 인덱스 미비 (search_knowledge RPC)

- **위치**: `src/lib/knowledge.ts:343` → `search_knowledge` RPC
- **문제**: 1,912행 × 768차원 코사인 유사도 계산. HNSW/IVFFlat 인덱스 없으면 매번 전수 스캔
- **영향**: QA 답변 생성마다 최대 3회 병렬 호출. 응답 지연의 핵심 원인
- **개선 방향**: Supabase에서 `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)` 확인/생성

---

## P1 — 1주 내 수정 권장

### 4. 경쟁사 한글 검색 3-hop 순차 (최대 7초)

- **위치**: `src/app/api/competitor/search/route.ts`
- **문제**: Google Suggest(3초 timeout) → SearchAPI(2초) → 폴백 재검색(2초) = 최대 7초 순차
- **개선 방향**: suggestEnglishName 결과를 메모리/DB 캐시로 TTL 저장

### 5. questions → answers count N+1 쿼리

- **위치**: `src/actions/questions.ts:65~71`
- **문제**: 질문 10개 로드 후 각 question_id마다 answers count 개별 쿼리 (10회)
- **개선 방향**: Supabase select에 answers count 포함하거나 `.in("question_id", ids)` 일괄 처리

### 6. 무거운 라이브러리 lazy loading 미적용

| 라이브러리 | import 위치 | 번들 크기 | lazy loading |
|-----------|------------|----------|-------------|
| recharts | `OverlapAnalysis.tsx`, `PerformanceTrendChart.tsx`, `PerformanceChart.tsx`, `WeeklyChart.tsx` | ~200KB | 없음 |
| MDXEditor | `mdx-editor-wrapper.tsx` | ~150KB+ | `next/dynamic` 적용됨 (정상) |

- **개선 방향**: recharts 사용 컴포넌트를 `next/dynamic({ ssr: false })`로 감싸기

### 7. 주요 테이블 인덱스 부족

| 테이블 | 필요 인덱스 | 사용처 |
|--------|------------|--------|
| `daily_ad_insights` | `(account_id, date)` 복합 | insights, total-value, performance |
| `answers` | `question_id` | getAnswersByQuestionId, count |
| `answers` | `is_approved` | getPendingAnswers, 대시보드 통계 |
| `contents` | `status`, `category` | getPosts, getContents, getNotices |
| `knowledge_chunks` | `content_id` | embed-pipeline DELETE/UPDATE |
| `knowledge_chunks` | `(source_type, lecture_name)` | linkBlueprintChunks |
| `profiles` | `role` | 대시보드 통계, 회원 관리 |
| `ad_accounts` | `user_id`, `account_id` | 수강생 성과, 계정 관리 |
| `questions` | `status`, `category_id` | 질문 목록 필터 |

### 8. total-value limit=1000 하드코딩

- **위치**: `src/app/api/protractor/total-value/route.ts:116~121`
- **문제**: `.select("*").limit(1000)` — 광고 수 x 기간 일수 > 1000 시 집계 누락
- **개선 방향**: limit 제거 + 필요 컬럼만 select, 또는 DB 집계 RPC 사용

### 9. SWR + external state 이중 관리

- **위치**: `src/app/(main)/protractor/competitor/monitor-panel.tsx`
- **문제**: `onSuccess` 콜백으로 부모 state에 주입하는 패턴. SWR 캐시와 React state 동기화 불일치 위험
- **개선 방향**: SWR `data`를 직접 사용하거나 상위에서 호출

### 10. proxy.ts 미들웨어 미동작 가능성

- **위치**: `src/proxy.ts` (파일명이 `middleware.ts`가 아님)
- **문제**: Next.js는 `src/middleware.ts` 또는 루트 `middleware.ts`만 인식. `proxy.ts`는 동작하지 않을 수 있음
- **영향**: 인증 미들웨어(역할 기반 라우팅, 세션 갱신)가 실행되지 않고, 각 페이지 Server Component의 개별 `redirect()`에만 의존
- **확인 필요**: 의도된 구조인지 팀 확인. 보호 누락 페이지 존재 가능

---

## P2 — 개선 권장 (기술 부채)

### 11. `<img>` 태그 직접 사용

- **위치**: `src/components/posts/post-body.tsx:46` 등
- **문제**: `next/image` 대신 `<img>` 사용 → 이미지 최적화(WebP 변환, lazy loading, size hint) 미적용
- **개선 방향**: 외부 이미지 도메인 설정 후 `next/image` 전환

### 12. Supabase getUser() 중복 호출

- **문제**: 미들웨어 → 페이지 Server Component에서 동일 요청 내 `supabase.auth.getUser()` 2회 호출
- **개선 방향**: `React.cache()`로 래핑하여 single request deduplication

### 13. Full scan 패턴들

| 위치 | 테이블 | 문제 |
|------|--------|------|
| `curation.ts:374~377` | `knowledge_chunks` | `.select("source_type")` 전수 조회 후 JS 집계 |
| `admin.ts:47~56` | `profiles` | `getDistinctCohorts` limit 없음 |
| `admin.ts:248~259` | `questions` | 28일 데이터 JS GROUP BY → DB 집계 RPC 권장 |
| `performance.ts:133~137` | `daily_ad_insights` | 수강생 × 계정 × 기간 전수 로드 |
| `contents.ts:412~416` | `contents` | `embedAllContents` limit 없이 전수 조회 |

### 14. static 전환 가능 페이지

- `/privacy` — 순수 정적 HTML. `export const dynamic = "force-static"` 선언으로 전환 가능
- `/notices` — `export const revalidate = 300` ISR 적용 가능 (공지사항 저빈도 변경)

### 15. API 라우트 Cache-Control 헤더 미설정

- **문제**: read-only API 라우트에 `Cache-Control` 헤더 없음. CDN 레벨 캐시 미활용
- **개선 방향**: 통계/벤치마크 등 변동 적은 API에 `s-maxage=60, stale-while-revalidate=300` 추가

---

## 종합 우선순위 매트릭스

| 순위 | 항목 | 예상 효과 | 작업량 |
|------|------|----------|--------|
| 1 | P0-1: overlap 병렬화 | 55초 → 5초 | 중 |
| 2 | P0-2: daily_ad_insights 인덱스+limit | OOM 방지 | 소 |
| 3 | P0-3: pgvector HNSW 인덱스 | QA 응답 속도 2~5배 향상 | 소 (SQL 1줄) |
| 4 | P1-4: 한글 검색 캐시 | 7초 → 2초 | 소 |
| 5 | P1-5: answers N+1 제거 | 페이지 로드 10쿼리 → 1쿼리 | 소 |
| 6 | P1-6: recharts lazy loading | 번들 ~200KB 절감 | 소 |
| 7 | P1-7: DB 인덱스 일괄 생성 | 전반적 쿼리 속도 향상 | 소 (SQL) |
| 8 | P1-10: proxy.ts 확인 | 보안 리스크 제거 | 소 |

---

## 반복 패턴 (프로젝트 레벨 이슈)

1. **`.select("*")` + limit 없음**: daily_ad_insights, knowledge_chunks, profiles 등 다수 테이블에서 반복
2. **DB 집계를 JS에서 수행**: GROUP BY, DISTINCT, COUNT를 DB가 아닌 클라이언트 JS에서 처리
3. **인덱스 설계 부재**: 주요 필터/정렬 컬럼에 인덱스 계획 없이 코드 우선 작성

---

*이 보고서는 코드 분석 기반이며, 실제 쿼리 실행 시간은 Supabase Dashboard > SQL Editor > EXPLAIN ANALYZE로 검증 필요*
