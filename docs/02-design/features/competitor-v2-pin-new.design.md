# 경쟁사 분석기 v2 — T5 핀 리디자인 + NEW 알림 설계서

## 1. 데이터 모델
기존 competitor_monitors 테이블 — v2 컬럼 이미 존재:
- page_profile_url TEXT — 프로필 이미지 URL (SearchAPI image_uri)
- ig_username TEXT — 인스타그램 계정명
- category TEXT — 브랜드 카테고리
- new_ads_count INT DEFAULT 0 — 새 광고 수
- latest_ad_date TEXT — 최신 광고 시작일
- total_ads_count INT DEFAULT 0 — 전체 광고 수

CompetitorMonitor 인터페이스(types/competitor.ts) — 이미 v2 필드 포함.
CompetitorAd — pageId, pageName 필드로 링크 생성.

## 2. API 설계

### POST /api/competitor/monitors (수정)
**요청 body 확장:**
```json
{
  "brandName": "올리브영",
  "pageId": "12345",
  "pageProfileUrl": "https://...",
  "igUsername": "oliveyoung",
  "category": "Health/beauty",
  "totalAdsCount": 150
}
```
**변경:** insert 시 새 필드 포함하여 저장.

### PATCH /api/competitor/monitors/[id] (신규는 아님, 인라인 처리)
클릭 시 dashboard에서 직접 API 호출:
- `new_ads_count = 0`
- `last_checked_at = now()`

→ 기존 monitors/[id]/route.ts에 PATCH 추가 또는 별도 endpoint.
→ 설계: monitors/[id]/route.ts에 PATCH 메서드 추가.

### GET /api/cron/competitor-check (수정)
1. 모니터 목록 조회 (page_id, latest_ad_date 포함)
2. 중복 page_id 그룹핑 → 1회만 searchMetaAds 호출
3. searchMetaAds({ searchPageIds: page_id, limit: 1 }) → 최신 광고 확인
4. 새 광고 감지: result.ads[0].startDate > monitor.latest_ad_date
5. 감지 시: new_ads_count += (serverTotalCount - total_ads_count), latest_ad_date = 최신 startDate, total_ads_count = serverTotalCount

## 3. 컴포넌트 구조

### monitor-brand-card.tsx (리디자인)
```
┌──────────────────────────────────────┐
│ [프로필32px] 브랜드명      🔴NEW +3  │
│             @ig · 광고150건 · 2시간전 │
│                              [🗑]    │
└──────────────────────────────────────┘
```
- BrandLogo: page_profile_url 우선, fallback → graph.facebook.com, fallback → LetterAvatar
- NEW 배지: newAdsCount > 0 → 🔴 NEW +N
- 서브텍스트: @igUsername · 광고 totalAdsCount건 · timeAgo(lastCheckedAt)
- 클릭: onBrandClick + PATCH new_ads_count=0

### monitor-panel.tsx (수정)
- onBrandClick에서 PATCH API 호출 (new_ads_count 리셋)
- monitors 상태 로컬 업데이트

### brand-search-bar.tsx → competitor-dashboard.tsx
- onPinBrand 콜백 연결
- 핀 등록 시 BrandPage 정보 포함하여 POST /api/competitor/monitors 호출
- 등록 성공 → monitors 상태에 추가

### ad-card.tsx (링크 수정)
CTA 버튼 영역에 추가:
- 📷 Instagram: `instagram.com/{pageName의 ig_username 또는 검색결과}` — ad에 igUsername 없으므로 대안: 검색 컨텍스트에서 전달 또는 ad.pageName 기반
- 📘 Facebook: `facebook.com/{pageId}`
- 🔍 Ad Library: `facebook.com/ads/library/?active_status=all&ad_type=all&country=KR&view_all_page_id={pageId}`

### ad-media-modal.tsx (링크 수정)
- "Meta에서 보기" 제거
- 대신 3개 링크 (IG/FB/Ad Library) 아이콘 버튼으로 대체

## 4. 에러 처리
- PATCH monitors: 401 미인증, 404 모니터 없음, 500 DB 에러
- Cron: page_id null → searchTerms 폴백, RATE_LIMITED → break
- 링크: pageId null → 링크 미표시

## 5. 구현 순서
1. [BE] monitors/[id]/route.ts PATCH 메서드 추가
2. [BE] monitors/route.ts POST body에 v2 필드 저장
3. [FE] monitor-brand-card.tsx 리디자인
4. [FE] monitor-panel.tsx 클릭 시 PATCH 호출 + 상태 업데이트
5. [FE] competitor-dashboard.tsx onPinBrand 연결
6. [BE] cron/competitor-check/route.ts page_id 기반 + new_ads_count 로직
7. [FE] ad-card.tsx 링크 수정
8. [FE] ad-media-modal.tsx 링크 수정
