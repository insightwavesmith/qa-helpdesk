# 경쟁사v2 검색 고도화 — Plan

## 1. 요구사항 요약
수강생이 브랜드명, 자사몰 URL, 인스타 계정 **뭘 치든** 해당 브랜드의 광고를 전부 찾아주는 검색 구조.
공식 계정뿐 아니라 비공식 페이지(숫자로만 된 페이지 등)까지 잡아야 한다.

## 2. 범위
### In-scope
- T1: 브랜드 검색 고도화 (page_search + ad_library 병렬 검색)
  - 서버: `/api/competitor/brands` 수정 — 2개 API 병렬 호출
  - 프론트: brand-search-bar.tsx 드롭다운 2섹션 (공식 브랜드 + URL 광고 페이지)
  - 입력 분류: URL 감지 → 도메인 추출 (이미 구현), 결과 합치기

### Out-of-scope
- T2~T5: 핫픽스(85e916d)에서 이미 처리됨 (더보기/정렬/필터/카드버튼)
- 모니터링 패널 UI
- 선택 다운로드(체크박스+ZIP)
- 검색 모드 토글(브랜드/키워드) 기본 구조

## 3. 성공 기준
- "올리브영" 검색 → 드롭다운에 📌 공식 브랜드 섹션 + 🔗 URL 광고 페이지 섹션
- "oliveyoung.co.kr" 검색 → URL 감지 → 도메인으로 ad_library 검색 → 비공식 페이지까지 표시
- 크레딧: 검색 1회당 2크레딧 (page_search 1 + ad_library 1)
- npm run build 성공
- 기존 기능(키워드 검색, 모니터링, 다운로드) 깨지지 않음

## 4. 기술적 접근
### 서버 (brands/route.ts)
1. 기존 `extractQueryFromUrl()` 활용하여 입력 분류
2. `Promise.allSettled([searchBrandPages(q), searchMetaAds({searchTerms: domain})])` 병렬 호출
3. ad_library 결과에서 page_id별 그룹핑 → "이 URL로 광고하는 페이지" 목록 생성
4. 두 결과를 `{ brands: BrandPage[], adPages: AdPage[] }` 형태로 반환

### 프론트 (brand-search-bar.tsx)
1. API 응답에서 brands + adPages 분리
2. 드롭다운 2섹션 렌더링:
   - 📌 공식 브랜드: 기존 BrandPage 렌더링 (프로필+인스타+좋아요)
   - 🔗 URL 광고 페이지: page_id + page_name + 광고 건수
3. adPage 클릭 → 해당 page_id로 광고 검색 (기존 handleBrandSelect 재활용)

### 타입 추가 (types/competitor.ts)
- `AdPage` 인터페이스: page_id, page_name, ad_count

## 5. 의존성 / 리스크
- SearchAPI.io 크레딧 소모 2배 (page_search + ad_library) — 이미 확인됨
- ad_library 키워드 검색은 URL contain 매칭이므로 결과가 많을 수 있음 → 상위 10개 페이지만 표시
- Promise.allSettled 사용으로 한쪽 실패해도 나머지 결과 표시

## 6. 파일 변경 계획
| 파일 | 변경 내용 |
|------|-----------|
| `src/app/api/competitor/brands/route.ts` | 병렬 검색 로직 추가 |
| `src/lib/competitor/meta-ad-library.ts` | 확인만 (변경 불필요) |
| `src/app/(main)/protractor/competitor/components/brand-search-bar.tsx` | 드롭다운 2섹션 |
| `src/types/competitor.ts` | AdPage 타입 추가 |
