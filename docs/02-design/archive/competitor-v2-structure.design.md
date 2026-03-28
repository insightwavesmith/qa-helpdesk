# 경쟁사 분석기 v2 — T1 구조 리팩토링 설계서

## 1. 데이터 모델

### 신규 타입: BrandPage
```ts
export interface BrandPage {
  page_id: string;
  page_name: string;
  category: string | null;
  image_uri: string | null;
  likes: number | null;
  ig_username: string | null;
  ig_followers: number | null;
  ig_verification: boolean;
  page_alias: string | null;
}
```

### 신규 타입: SearchMode
```ts
export type SearchMode = 'brand' | 'keyword';
```

### CompetitorMonitor 확장 (기존 필드 유지)
```ts
export interface CompetitorMonitor {
  // 기존
  id: string;
  brandName: string;
  pageId: string | null;
  lastCheckedAt: string | null;
  lastAdCount: number;
  createdAt: string;
  unreadAlertCount?: number;
  // 신규
  pageProfileUrl: string | null;
  igUsername: string | null;
  category: string | null;
  newAdsCount: number;
  latestAdDate: string | null;
  totalAdsCount: number;
}
```

### CompetitorMonitorRow 확장
```ts
export interface CompetitorMonitorRow {
  // 기존 6개 필드 유지
  // 신규
  page_profile_url: string | null;
  ig_username: string | null;
  category: string | null;
  new_ads_count: number;
  latest_ad_date: string | null;
  total_ads_count: number;
}
```

### SearchParams 확장
```ts
export interface SearchParams {
  // 기존 필드 유지
  searchTerms: string;
  country?: string;
  limit?: number;
  mediaType?: string;
  pageToken?: string;
  // 신규
  searchPageIds?: string;  // page_id로 필터 검색
}
```

## 2. API 설계

### GET /api/competitor/brands
- Query: `q` (필수) — 브랜드 검색어 또는 URL
- URL 입력 감지:
  - `instagram.com/xxx` → username 추출
  - `facebook.com/xxx` → alias 추출
  - 일반 URL → 도메인 키워드 추출
- Response: `{ brands: BrandPage[] }`
- Error: 400 (빈 쿼리), 503 (API키 없음), 429 (Rate Limit), 502 (API 에러)

### GET /api/competitor/search (확장)
- 신규 Query params: `page_id` (optional)
- page_id 있으면 searchMetaAds에 searchPageIds 전달
- 응답 포맷 변경 없음 (하위 호환)

## 3. 컴포넌트 구조
- UI 변경 없음

## 4. 에러 처리
- 기존 MetaAdError 패턴 재사용
- CompetitorErrorCode에 추가 없음 (기존 코드로 충분)

## 5. 구현 순서
1. [x] src/types/competitor.ts — BrandPage, SearchMode, CompetitorMonitor 확장
2. [x] src/lib/competitor/meta-ad-library.ts — searchBrandPages, SearchParams.searchPageIds
3. [x] src/app/api/competitor/brands/route.ts — 신규 라우트
4. [x] src/app/api/competitor/search/route.ts — page_id 파라미터
5. [x] supabase/migrations/20260308_competitor_monitors_v2.sql — DB 컬럼 추가

## 6. DB 마이그레이션
```sql
ALTER TABLE competitor_monitors
  ADD COLUMN IF NOT EXISTS page_profile_url TEXT,
  ADD COLUMN IF NOT EXISTS ig_username TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS new_ads_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latest_ad_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_ads_count INTEGER DEFAULT 0;
```
주의: last_checked_at은 이미 존재 → IF NOT EXISTS로 안전 처리
