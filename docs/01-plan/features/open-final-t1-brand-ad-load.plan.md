# T1: 브랜드 클릭 시 광고 로드 — Plan

## 요구사항
브랜드 검색 드롭다운에서 브랜드를 클릭하면 해당 브랜드의 광고 목록이 표시되어야 한다.

## 배경/맥락
- 브랜드 검색 드롭다운까지는 정상 동작 (page_search + ad_library 병렬 검색)
- 브랜드 클릭 → `handleBrandSelect` → `/api/competitor/search?q={name}&page_id={id}` 호출
- API route → `searchMetaAds({ searchTerms, searchPageIds })` → SearchAPI.io 호출
- **문제**: SearchAPI.io에 `q`(검색어)와 `search_page_ids`(브랜드 ID)를 동시에 보내면, `q`가 추가 텍스트 필터로 작용하여 결과가 0건이 될 수 있음
- SearchAPI.io Meta Ad Library에서 `search_page_ids`를 사용할 때는 `q`가 해당 페이지 광고 내 텍스트 검색으로 동작 → 브랜드명이 광고 본문에 없으면 결과 없음

## 범위

### 수정 대상 파일
| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/app/api/competitor/search/route.ts` | `page_id` 존재 시 `q` 파라미터 처리 조정 |
| 2 | `src/lib/competitor/meta-ad-library.ts` | `searchPageIds` 존재 시 `q`를 빈 문자열 또는 와일드카드로 대체하는 로직 |

### 수정하지 않을 파일
- `brand-search-bar.tsx` — 검색 드롭다운 UI 건드리지 않음
- `competitor-dashboard.tsx` — `handleBrandSelect` 로직은 정상, API 응답만 수정
- 모니터링 패널 관련 코드

## 성공 기준
1. "올리브영" 검색 → 드롭다운에서 브랜드 클릭 → 해당 page_id 광고 카드 목록 표시
2. 로딩 스피너 → 결과 정상 표시
3. 더보기(pagination) 정상 동작
4. 키워드 검색 모드는 기존 동작 유지
5. tsc --noEmit + next lint + npm run build 통과

## 제약사항
- 검색 드롭다운 UI 수정 금지
- 모니터링 패널 수정 금지
- 기존 키워드 검색 동작 변경 금지

## 의존성
- SearchAPI.io Meta Ad Library API 동작 확인 필요
- 기존 competitor-v2-search-enhancement 설계 참조
