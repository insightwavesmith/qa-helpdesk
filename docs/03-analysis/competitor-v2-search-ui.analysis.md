# 경쟁사 분석기 v2 — T2 검색 UI Gap 분석

## Match Rate: 95%

## 일치 항목

| # | 설계 항목 | 구현 상태 | 일치 |
|---|-----------|-----------|------|
| T2.1 | 검색 모드 토글 (브랜드/키워드) | ✅ `searchMode` state + 토글 버튼 UI | ✅ |
| T2.1 | 브랜드 모드 기본값 | ✅ `useState<SearchMode>("brand")` | ✅ |
| T2.1 | 브랜드 모드 → BrandSearchBar 렌더 | ✅ 조건부 렌더링 | ✅ |
| T2.1 | 키워드 모드 → 기존 SearchBar 렌더 | ✅ 기존 SearchBar 그대로 사용 | ✅ |
| T2.2 | debounce 300ms | ✅ `setTimeout 300` + `clearTimeout` | ✅ |
| T2.2 | `/api/competitor/brands?q=` 호출 | ✅ `fetch` with `encodeURIComponent` | ✅ |
| T2.2 | 프로필 사진 32px 원형 | ✅ `h-8 w-8 rounded-full` | ✅ |
| T2.2 | 브랜드명 표시 | ✅ `page_name` | ✅ |
| T2.2 | @인스타계정 · 좋아요수 · 카테고리 | ✅ 조건부 구분자 포함 | ✅ |
| T2.2 | 📌 핀 등록 버튼 | ✅ `Pin` 아이콘 + `onPinBrand` 콜백 | ✅ |
| T2.2 | 브랜드 클릭 → page_id로 광고 검색 | ✅ `handleBrandSelect` → `page_id` 파라미터 | ✅ |
| T2.2 | URL 입력 감지 | ✅ API 라우트에서 처리 (변경 없음) | ✅ |
| T2.2 | 빈 결과 시 "검색 결과 없음" | ✅ 빈 상태 UI | ✅ |
| T2.2 | ESC 드롭다운 닫힘 | ✅ `onKeyDown` ESC 핸들러 | ✅ |
| T2.2 | 외부 클릭 드롭다운 닫힘 | ✅ `mousedown` 이벤트 리스너 | ✅ |
| T2.3 | 기존 search-bar.tsx 변경 없음 | ✅ 변경 없음 | ✅ |
| - | 디자인 시스템 (Primary, Radius, lucide) | ✅ #F75D5D, rounded-xl, lucide-react | ✅ |
| - | 필터/다운로드 UI 미변경 | ✅ 미변경 | ✅ |
| - | API 라우트 미변경 | ✅ 미변경 | ✅ |

## 불일치 항목

| # | 설계 항목 | 차이점 | 심각도 |
|---|-----------|--------|--------|
| T2.2 | 이모지 토글 (🏢/🔑) | lucide 아이콘 (Building2/KeyRound) 사용 — 디자인 시스템 일관성 우선 | Low |

## 수정 필요

없음. 이모지 대신 lucide 아이콘 사용은 디자인 시스템 일관성 관점에서 더 적절한 판단.

## 빌드 검증

- [x] `npx tsc --noEmit` — 타입 에러 0개
- [x] `npx eslint` — lint 에러 0개
- [x] `npm run build` — 빌드 성공

## 변경 파일

| 파일 | 변경 유형 |
|------|-----------|
| `src/app/(main)/protractor/competitor/components/brand-search-bar.tsx` | 신규 생성 |
| `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` | 수정 (모드 토글 + BrandSearchBar 통합) |
