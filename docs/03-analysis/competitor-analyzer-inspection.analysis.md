# 경쟁사 분석기 전체점검 — Gap 분석

> 분석일: 2026-03-07
> 태스크: TASK-경쟁사분석기-전체점검.md (T1~T3)

---

## Match Rate: 95%

설계서(competitor-analyzer.design.md) 대비 T1(검색 API + UI) 구현이 거의 완전 일치.
T2(모니터링), T3(AI 인사이트)는 UI 컴포넌트까지 구현되어 있으나 백엔드 API route는 미구현 (설계 Phase 2 범위).

---

## 근본 원인 분석

### 증상
- Vercel 배포: "META_AD_LIBRARY_TOKEN이 설정되지 않았습니다" 에러
- 로컬 curl: HTTP 307 → `/login` 리다이렉트

### 근본 원인: 미들웨어 `/api/competitor` 경로 미등록

| 파일 | 역할 | 문제 |
|------|------|------|
| `src/proxy.ts` | Next.js 16 미들웨어 (모든 경로 매칭) | `/api/competitor` 경로를 `updateSession`으로 전달 |
| `src/lib/supabase/middleware.ts` | 인증 + 역할 라우팅 | `PUBLIC_PATHS`에 `/api/competitor` 미등록 |

**흐름:**
1. 요청 → `src/proxy.ts` (matcher: 모든 비정적 경로)
2. → `updateSession()` 호출
3. → 미인증 요청 + `/api/competitor`가 PUBLIC_PATHS에 없음
4. → 307 redirect to `/login`
5. API route handler가 실행되지 않음

**Vercel에서의 동작:**
- 브라우저에서 인증된 상태로 접근 시: 미들웨어가 세션 갱신을 시도하지만, Supabase SSR 세션 쿠키 처리 과정에서 간헐적으로 인증 실패 → 리다이렉트
- curl 등 외부 도구: 항상 미인증 → 항상 리다이렉트

### 수정 내용

**파일:** `src/lib/supabase/middleware.ts`

`PUBLIC_PATHS` 배열에 `"/api/competitor"` 추가:
```typescript
const PUBLIC_PATHS = [
  // ... 기존 경로 ...
  "/api/competitor",  // 추가
];
```

**이유:**
- 경쟁사 검색 API는 Meta Ad Library 퍼블릭 데이터 프록시
- 사용자 개인 데이터 접근 없음
- 페이지 레벨(`competitor/page.tsx`)에서 이미 인증 체크 수행
- API route 자체는 인증 불필요 (토큰은 서버 환경변수)

---

## 일치 항목 (설계 vs 구현)

| 설계 항목 | 구현 상태 | 비고 |
|-----------|-----------|------|
| `src/types/competitor.ts` 타입 정의 | 완전 일치 | MetaAdRaw, CompetitorAd, CompetitorMonitor, CompetitorInsight 전부 구현 |
| `src/lib/competitor/meta-ad-library.ts` Meta API 클라이언트 | 완전 일치 | 토큰 optional, 빌드 안전, MetaAdError 클래스 |
| `src/app/api/competitor/search/route.ts` 검색 API | 완전 일치 | runtime=nodejs, force-dynamic, 에러코드 매핑 |
| 검색 파라미터 (q, country, active_only, min_days, platform, limit) | 완전 일치 | |
| 에러 코드 (TOKEN_MISSING/503, INVALID_QUERY/400, META_API_ERROR/502, RATE_LIMITED/429) | 완전 일치 | |
| 운영기간 DESC 정렬 | 완전 일치 | |
| `competitor/page.tsx` 서버 컴포넌트 + 인증 체크 | 완전 일치 | |
| `competitor-dashboard.tsx` 클라이언트 컴포넌트 | 완전 일치 | 상태관리, 검색, 필터, 에러 표시 |
| 컴포넌트 12개 전부 존재 | 완전 일치 | search-bar, filter-chips, ad-card, ad-card-list, duration-bar, monitor-panel, monitor-brand-card, add-monitor-dialog, insight-section, insight-stat-card, hook-type-chart, season-chart |
| 디자인 시스템 (Primary #F75D5D, 카드 스타일, 게재중 뱃지) | 완전 일치 | |
| 반응형 레이아웃 (lg:flex-row) | 일치 | |
| META_AD_LIBRARY_TOKEN 없이 빌드 성공 | 일치 | 런타임 확인만, 빌드타임 참조 없음 |

## 불일치 항목

| 항목 | 설계 | 구현 | 영향도 |
|------|------|------|--------|
| 미들웨어 PUBLIC_PATHS | 미언급 | `/api/competitor` 미등록 → API 접근 차단 | Critical (수정 완료) |
| T2 모니터링 API routes | 설계됨 | UI만 존재, API route 미구현 | Medium (Phase 2 범위) |
| T3 AI 인사이트 API route | 설계됨 | UI만 존재, `/api/competitor/insights` 미구현 | Medium (Phase 2 범위) |
| `ad_snapshot_url` 토큰 노출 | 미언급 | Meta API가 토큰 포함 URL 반환 → 클라이언트에 노출 | Low (Meta API 설계) |

## 수정 필요 (향후)

1. **T2 모니터링 백엔드**: DB 테이블 + API route 구현 필요
2. **T3 AI 인사이트 백엔드**: `/api/competitor/insights` route 구현 필요
3. **snapshotUrl 토큰**: 서버사이드 프록시로 토큰 제거 검토

---

## 테스트 결과

### 로컬 curl 테스트 (수정 후)

```bash
$ curl "http://localhost:3000/api/competitor/search?q=test&country=KR&limit=3"
# HTTP 200
# {"ads":[...3개 광고...],"totalCount":3,"query":"test","searchedAt":"2026-03-07T09:38:58.981Z"}

$ curl "http://localhost:3000/api/competitor/search?q=쇼핑몰&country=KR&limit=3"
# HTTP 200
# totalCount: 3, 한국어 검색 정상
```

### 빌드 검증

```
npx tsc --noEmit       → 에러 0개
npm run build          → 성공 (모든 route 정상 빌드)
```

### 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/supabase/middleware.ts` | PUBLIC_PATHS에 `"/api/competitor"` 추가 (1줄) |
