# T1: 브랜드 클릭 시 광고 로드 — 설계서

## 1. 데이터 모델

데이터 모델 변경 없음. 기존 SearchAPI.io 호출 파라미터 조정만.

## 2. API 설계

### 현재 문제 분석

```
프론트엔드 → /api/competitor/search?q=올리브영&page_id=12345
서버 → SearchAPI.io?q=올리브영&search_page_ids=12345
SearchAPI.io → q="올리브영"을 광고 텍스트 내 검색으로 해석 → 광고 본문에 "올리브영"이 없으면 0건
```

### 해결 방안

`search_page_ids`가 존재할 때는 `q` 파라미터에 빈 문자열(`""`)을 보내거나, 검색어를 생략하여 해당 페이지의 모든 광고를 반환받는다.

**방안 A (권장)**: `meta-ad-library.ts`에서 `searchPageIds`가 있으면 `q`를 빈 문자열로 설정

```typescript
// src/lib/competitor/meta-ad-library.ts — searchMetaAds() 내부
// 기존:
url.searchParams.set("q", params.searchTerms);

// 변경:
// search_page_ids가 있으면 q를 빈 문자열로 (해당 페이지 전체 광고 반환)
if (params.searchPageIds) {
  url.searchParams.set("q", "");
} else {
  url.searchParams.set("q", params.searchTerms);
}
```

**방안 B (대안)**: API route 레벨에서 `page_id` 존재 시 `q` 파라미터를 빈 문자열로 오버라이드

```typescript
// src/app/api/competitor/search/route.ts
const effectiveQuery = pageId ? "" : q;  // page_id 있으면 텍스트 검색 생략
```

**결정**: 방안 A 채택. `meta-ad-library.ts`가 SearchAPI.io와 직접 통신하는 계층이므로 이 레벨에서 파라미터 조정하는 것이 적절. API route의 `q` 필수 검증은 유지하되, `page_id`가 있으면 `q` 없이도 허용.

### API route 변경

```typescript
// src/app/api/competitor/search/route.ts
// 기존: q가 없으면 400 에러
// 변경: q가 없어도 page_id가 있으면 허용

if (!q && !pageId) {
  return NextResponse.json(
    { error: "검색어를 입력하세요", code: "INVALID_QUERY" },
    { status: 400 },
  );
}
```

### meta-ad-library 변경

```typescript
// src/lib/competitor/meta-ad-library.ts — searchMetaAds() 내부
// search_page_ids가 있으면 q를 빈 문자열로 설정하여 해당 페이지 전체 광고 반환
if (params.searchPageIds) {
  url.searchParams.set("q", "");
} else {
  url.searchParams.set("q", params.searchTerms);
}
```

## 3. 컴포넌트 구조

프론트엔드 변경 없음. `competitor-dashboard.tsx`의 `handleBrandSelect`는 이미 올바르게 `page_id`를 전달하고 있음.

### 현재 흐름 (유지)
```
BrandSearchBar → handleSelect(brand) → onBrandSelect(brand)
  → competitor-dashboard.handleBrandSelect(brand)
    → fetch(/api/competitor/search?q={name}&page_id={id})
    → setAds(json.ads)
```

### 변경 후 동작
```
프론트: fetch(/api/competitor/search?q=올리브영&page_id=12345)
API route: q="올리브영", pageId="12345" → searchMetaAds({ searchTerms: "올리브영", searchPageIds: "12345" })
meta-ad-library: searchPageIds 존재 → q="" + search_page_ids=12345 → SearchAPI.io
SearchAPI.io: 12345 페이지의 모든 활성 광고 반환
```

## 4. 에러 처리

| 시나리오 | 처리 |
|----------|------|
| page_id로 검색했지만 결과 0건 | 기존 "검색 결과가 없습니다" UI 표시 (정상) |
| SearchAPI.io API 에러 | 기존 MetaAdError 핸들링 그대로 (변경 없음) |
| page_id 형식 오류 | SearchAPI.io가 400 반환 → SEARCH_API_ERROR로 변환 (기존 로직) |

## 5. 구현 순서

- [ ] S1. `src/lib/competitor/meta-ad-library.ts` — `searchPageIds` 존재 시 `q`를 빈 문자열로 설정
- [ ] S2. `src/app/api/competitor/search/route.ts` — `q` 없이 `page_id`만으로 검색 허용 (validation 완화)
- [ ] S3. 수동 테스트: "올리브영" 검색 → 드롭다운 클릭 → 광고 목록 표시 확인
- [ ] S4. 수동 테스트: 키워드 검색 모드 정상 동작 확인
- [ ] S5. tsc --noEmit + next lint + npm run build
