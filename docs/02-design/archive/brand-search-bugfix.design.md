# 브랜드 검색 버그 수정 설계서

> 작성일: 2026-03-08
> Plan: `docs/01-plan/features/brand-search-bugfix.plan.md`

---

## 1. 데이터 모델

기존 데이터 모델 변경 없음. 파라미터 이름 수정만 필요.

### SearchAPI.io `meta_ad_library` 엔진 필수 파라미터

| 파라미터 | 용도 | 비고 |
|----------|------|------|
| `q` | 키워드 검색 | 3개 중 하나 필수 |
| `page_id` | 특정 페이지의 광고 조회 | 3개 중 하나 필수 |
| `location_id` | 특정 지역의 광고 조회 | 3개 중 하나 필수 |
| `search_page_ids` | ❌ 존재하지 않는 파라미터 | Meta Graph API 전용 |

**참고**: Meta Graph API (직접 호출)에서는 `search_page_ids`가 유효하지만, SearchAPI.io wrapper에서는 `page_id`로 매핑됨.

---

## 2. API 설계

### 2-1. SearchAPI.io 호출 파라미터 수정

**Before (현재 — 버그):**
```
GET https://www.searchapi.io/api/v1/search
  ?engine=meta_ad_library
  &search_page_ids=123456   ← ❌ 인식 안 됨
  &country=KR
  &ad_active_status=active
  &api_key=xxx
```

**After (수정 후):**
```
GET https://www.searchapi.io/api/v1/search
  ?engine=meta_ad_library
  &page_id=123456            ← ✅ 올바른 파라미터
  &country=KR
  &ad_active_status=active
  &api_key=xxx
```

### 2-2. 내부 API route 변경 없음

`/api/competitor/search` route는 변경 불필요:
- 프론트에서 `page_id` 파라미터 정상 수신
- `searchMetaAds()` 호출 시 `searchPageIds` 필드로 정상 전달
- 문제는 라이브러리 내부에서 SearchAPI.io로 보낼 때만 발생

---

## 3. 컴포넌트 구조

UI 변경 없음. 프론트엔드 코드는 이미 올바르게 동작.

### 현재 코드 상태 확인 (수정 불필요)

| 파일 | 상태 | 설명 |
|------|------|------|
| `competitor-dashboard.tsx` handleBrandSelect | ✅ 정상 | `page_id`만 전송 |
| `competitor-dashboard.tsx` handleLoadMore | ✅ 정상 | `searchPageId` 있으면 `page_id` 전송 |
| `brand-search-bar.tsx` | ✅ 정상 | `onBrandSelect(brand)` 콜백 |
| `/api/competitor/search/route.ts` | ✅ 정상 | `page_id` 수신 + validation |

---

## 4. 에러 처리

### 현재 에러 흐름

```
SearchAPI.io 400 응답
  → meta-ad-library.ts line 197: !res.ok
  → line 200: throw new MetaAdError(`검색 API 호출 실패: ${errBody}`, "SEARCH_API_ERROR")
  → route.ts line 63: catch (err)
  → line 71: { error: err.message, code: "SEARCH_API_ERROR" }, status: 502
  → 프론트엔드: setError(json.error)
```

수정 후 이 에러 경로는 동일하게 유지됨. `page_id` 파라미터가 올바르게 전달되면 SearchAPI.io가 정상 응답을 반환할 것.

### route.ts line 39 개선 권장 (선택)

```typescript
// Before (현재)
searchTerms: q || "",  // null → "" 변환 — 의미 불명확

// After (권장)
searchTerms: q ?? "",  // 동작은 동일하지만 의도가 명확
```

이 변경은 기능에 영향 없음 (`q`가 `undefined`일 때 동일 동작). 코드 가독성 개선 목적.

---

## 5. 구현 순서 (체크리스트)

### S1: 파라미터 이름 수정 (1줄)

- [ ] `src/lib/competitor/meta-ad-library.ts` line 178:
  ```diff
  - url.searchParams.set("search_page_ids", params.searchPageIds);
  + url.searchParams.set("page_id", params.searchPageIds);
  ```

### S2: 주석 정리

- [ ] `src/lib/competitor/meta-ad-library.ts` line 160-162 주석에서 `search_page_ids` → `page_id` 용어 통일

### S3: 검증

- [ ] 브랜드 검색: "올리브영" → 드롭다운 클릭 → 광고 목록 표시 확인
- [ ] 키워드 검색: "올리브영" → Enter → 광고 목록 표시 확인 (회귀 테스트)
- [ ] 더보기: 브랜드 검색 후 더보기 버튼 → 추가 광고 로드 확인
- [ ] 모니터링: 등록된 브랜드 카드 클릭 → 광고 목록 표시 확인
- [ ] Cron: `/api/cron/competitor-check` — `searchPageIds` 사용 시 정상 동작 확인
- [ ] `npx tsc --noEmit --quiet` — 타입 에러 0개
- [ ] `npx next lint --quiet` — lint 에러 0개
- [ ] `npm run build` — 빌드 성공

---

## 6. 파일 경계

| 파일 | 변경 유형 | 담당 |
|------|-----------|------|
| `src/lib/competitor/meta-ad-library.ts` | 파라미터명 1줄 수정 + 주석 정리 | backend-dev |

---

## 7. 부록: 전체 코드 경로 상세

### Layer 1 — 프론트엔드 (정상)

**파일**: `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`

```typescript
// handleBrandSelect (line 170-203)
const params = new URLSearchParams({
  page_id: brand.page_id,  // ✅ page_id만 전송
});
const res = await fetch(`/api/competitor/search?${params}`);
```

```typescript
// handleLoadMore (line 99-136)
if (searchPageId) {
  params.set("page_id", searchPageId);  // ✅ 브랜드 검색 pagination
} else if (searchQuery) {
  params.set("q", searchQuery);          // ✅ 키워드 검색 pagination
}
```

### Layer 2 — API Route (정상)

**파일**: `src/app/api/competitor/search/route.ts`

```typescript
// line 20-22
const q = searchParams.get("q")?.trim();        // null if not present
const pageId = searchParams.get("page_id") ?? undefined;

// line 30-35: validation — q 또는 pageId 둘 중 하나 필요
if (!q && !pageId) { return 400 error }

// line 38-45: 라이브러리 호출
const result = await searchMetaAds({
  searchTerms: q || "",
  searchPageIds: pageId,  // ✅ pageId 전달
});
```

### Layer 3 — 라이브러리 (❌ 버그 위치)

**파일**: `src/lib/competitor/meta-ad-library.ts`

```typescript
// line 163-165: q 조건부 설정 (ff9bfa4에서 수정됨 — 정상)
if (!params.searchPageIds) {
  url.searchParams.set("q", params.searchTerms);
}

// line 177-179: ❌ 잘못된 파라미터명
if (params.searchPageIds) {
  url.searchParams.set("search_page_ids", params.searchPageIds);  // ← 이게 문제
}
```

### Layer 4 — SearchAPI.io (외부)

```
Required: q OR page_id OR location_id
Received: search_page_ids (not recognized)
→ Error: "Either q or page_id or location_id must be present"
```
