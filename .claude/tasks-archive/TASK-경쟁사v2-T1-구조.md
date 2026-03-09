# TASK: 경쟁사 분석기 v2 — T1 구조 리팩토링

## 목표
v2 기능(브랜드 검색, 선택 다운로드, NEW 알림 등)을 수용할 수 있도록 데이터 구조와 API 레이어를 먼저 잡는다.
이 TASK에서는 **UI를 변경하지 않는다** — API, 타입, DB, 유틸만 정리.

## 빌드/테스트
- npm run build 성공 필수
- 기존 기능 깨지면 안 됨 (하위 호환)

## T1.1 타입 정의 확장
### 파일
- `src/types/competitor.ts`
### 할 것
- `BrandPage` 타입 추가: page_id, page_name, category, image_uri, likes, ig_username, ig_followers, ig_verification, page_alias
- `CompetitorMonitor`에 필드 추가: page_profile_url, ig_username, category, last_checked_at, new_ads_count, latest_ad_date, total_ads_count
- `CompetitorAd`에 `carouselCards` 타입이 이미 있는지 확인, 없으면 추가
- `SearchMode` 타입: `'brand' | 'keyword'`
- 기존 타입은 삭제하지 말 것 (하위 호환)

## T1.2 SearchAPI.io 클라이언트 확장
### 파일
- `src/lib/competitor/meta-ad-library.ts`
### 할 것
- `searchBrandPages(query: string)` 함수 추가
  - SearchAPI.io `engine=meta_ad_library_page_search` 호출
  - 응답을 `BrandPage[]`로 변환
  - 한글 검색 지원됨 (API 자체 지원, 별도 처리 불필요)
- 기존 `searchMetaAds()` 수정:
  - `search_page_ids` 파라미터 지원 추가 (SearchParams에 pageId 필드)
  - `next_page_token` 파라미터 지원 추가 (SearchParams에 pageToken 필드)
  - 응답에서 `pagination.next_page_token`, `search_information.total_results` 추출
  - `MetaApiResult`에 `nextPageToken: string | null`, `totalCount: number` 추가
- 기존 시그니처/동작 깨지지 않게 할 것 (pageId, pageToken은 optional)

## T1.3 브랜드 검색 API 라우트
### 파일
- `src/app/api/competitor/brands/route.ts` (신규)
### 할 것
- `GET /api/competitor/brands?q=올리브영`
- 인증 확인 (supabase auth)
- `searchBrandPages(q)` 호출
- 응답: `{ brands: BrandPage[] }`
- URL 입력 감지: 인스타 URL → username 추출 / 페이스북 URL → alias 추출 / 일반 URL → 도메인 키워드 추출
  - 예: `instagram.com/oliveyoung_official` → `q=oliveyoung_official`
  - 예: `facebook.com/OY.GLOBAL` → `q=OY.GLOBAL`
  - 예: `oliveyoung.co.kr` → `q=oliveyoung`

## T1.4 검색 API 라우트 수정
### 파일
- `src/app/api/competitor/search/route.ts`
### 할 것
- `page_id` 쿼리 파라미터 추가: `?q=...&page_id=215712131799664`
- `page_token` 쿼리 파라미터 추가: `?q=...&page_token=AQH...`
- page_id가 있으면 `searchMetaAds({ searchPageIds: page_id })` 호출
- 응답에 `nextPageToken`, `totalCount` 포함
- 기존 `?q=키워드` 동작 유지 (하위 호환)

## T1.5 DB 마이그레이션 (competitor_monitors)
### 파일
- `supabase/migrations/20260308_competitor_monitors_v2.sql` (신규)
### 할 것
- ALTER TABLE competitor_monitors ADD COLUMN:
  - `page_profile_url TEXT`
  - `ig_username TEXT`
  - `category TEXT`
  - `last_checked_at TIMESTAMPTZ DEFAULT NOW()`
  - `new_ads_count INTEGER DEFAULT 0`
  - `latest_ad_date TIMESTAMPTZ`
  - `total_ads_count INTEGER DEFAULT 0`
- 기존 데이터 깨지지 않게 DEFAULT 값 설정
- RLS 정책 확인 (기존 것 유지)

## 하지 말 것
- UI 컴포넌트 변경하지 마라 (이 TASK는 구조만)
- 기존 API 응답 포맷 깨지지 않게 할 것
- 새 환경변수 추가하지 마라

## 검증 기준
- npm run build 성공
- tsc --noEmit 통과
- 기존 경쟁사 분석기 기능 정상 동작 (검색, 필터, 다운로드)
- `/api/competitor/brands?q=올리브영` 호출 시 브랜드 목록 반환
- `/api/competitor/search?q=올리브영&page_id=xxx` 호출 시 해당 브랜드 광고만 반환
