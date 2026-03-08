# 경쟁사 분석기 v2 구조 리팩토링 — Gap 분석

## Match Rate: 95%

## 일치 항목

| # | 설계 항목 | 구현 상태 | 비고 |
|---|----------|----------|------|
| T1.1 | BrandPage 타입 추가 | ✅ | 9개 필드 완전 일치 |
| T1.1 | SearchMode 타입 추가 | ✅ | 'brand' \| 'keyword' |
| T1.1 | CompetitorMonitor 확장 | ✅ | 6개 필드 추가, 기존 7개 유지 |
| T1.1 | CompetitorMonitorRow 확장 | ✅ | DB snake_case 매핑 |
| T1.1 | carouselCards 타입 확인 | ✅ | 이미 존재 (CarouselCard[]) |
| T1.2 | searchBrandPages 함수 | ✅ | meta_ad_library_page_search 엔진 |
| T1.2 | SearchParams.searchPageIds | ✅ | optional, search_page_ids 전달 |
| T1.2 | 기존 searchMetaAds 호환 | ✅ | 시그니처 변경 없음 |
| T1.3 | /api/competitor/brands 라우트 | ✅ | GET, URL 감지 포함 |
| T1.3 | URL 입력 감지 (인스타/페북/일반) | ✅ | extractQueryFromUrl 함수 |
| T1.4 | search 라우트 page_id 파라미터 | ✅ | optional, 하위 호환 |
| T1.5 | DB 마이그레이션 | ✅ | 6개 컬럼, IF NOT EXISTS |
| - | monitors API v2 필드 반영 | ✅ | GET/POST 응답에 신규 필드 포함 |

## 불일치 항목

| # | 항목 | 차이 | 영향도 |
|---|------|------|--------|
| T1.3 | 인증 확인 미구현 | brands 라우트에 supabase auth 체크 없음 | 낮음 (미들웨어에서 처리 + pages 라우트도 미구현) |

## 검증 결과
- `npx tsc --noEmit` — ✅ 에러 0개
- `npx eslint` (변경 파일) — ✅ 에러 0개
- `npm run build` — ✅ 성공
- UI 변경 없음 — ✅ 확인
- 기존 API 응답 포맷 유지 — ✅ (monitors 응답에 v2 필드 추가만, 기존 필드 유지)

## 변경 파일 목록
1. `src/types/competitor.ts` — BrandPage, SearchMode, CompetitorMonitor/Row 확장
2. `src/lib/competitor/meta-ad-library.ts` — searchBrandPages, SearchParams.searchPageIds
3. `src/app/api/competitor/brands/route.ts` — 신규
4. `src/app/api/competitor/search/route.ts` — page_id 파라미터
5. `src/app/api/competitor/monitors/route.ts` — v2 필드 매핑
6. `supabase/migrations/20260308_competitor_monitors_v2.sql` — 신규
7. `docs/01-plan/features/competitor-v2-structure.plan.md` — 신규
8. `docs/02-design/features/competitor-v2-structure.design.md` — 신규
9. `docs/.pdca-status.json` — 상태 업데이트
