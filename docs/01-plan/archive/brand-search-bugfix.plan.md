# 브랜드 검색 버그 수정 Plan

> 작성일: 2026-03-08
> 타입: 분석 → 버그 수정 (Plan/Design만)

---

## 이게 뭔지

브랜드 검색(올리브영 등) 시 드롭다운에서 브랜드 클릭 → `'검색 API 호출 실패: Either q or page_id or location_id must be present'` 에러 발생하는 버그.

## 왜 필요한지

- 서비스 오픈 상태에서 핵심 기능(경쟁사 광고 검색)이 브랜드 검색 모드에서 완전히 불능
- 두 번 수정 시도(ff9bfa4, 0959d43) 했으나 동일 에러 지속
- 수정 방향이 근본 원인을 놓치고 있었음 → 정확한 원인 분석 필요

## 증상 재현 경로

1. 경쟁사 분석기 접속 (`/protractor/competitor`)
2. 브랜드 검색 모드에서 "올리브영" 입력
3. 드롭다운에 브랜드 목록 표시됨 (이 단계는 정상 — `searchBrandPages()` 사용)
4. 브랜드 클릭 → **에러 발생**

## 근본 원인 분석 결과

### 에러 메시지 분석
```
"Either q or page_id or location_id must be present"
```
SearchAPI.io `meta_ad_library` 엔진이 **필수 파라미터 3개 중 하나**를 요구:
- `q` — 키워드 검색
- `page_id` — 페이지 ID로 검색
- `location_id` — 위치로 검색

### 실제 코드가 보내는 파라미터
```
search_page_ids=123456  ← ❌ SearchAPI.io가 인식하지 않는 파라미터명
```

### 파라미터 이름 불일치 (ROOT CAUSE)

| 위치 | 코드 | 문제 |
|------|------|------|
| `meta-ad-library.ts:178` | `url.searchParams.set("search_page_ids", params.searchPageIds)` | `search_page_ids` ≠ `page_id` |
| SearchAPI.io 에러 | `"Either q or page_id or location_id must be present"` | `page_id`를 기대함 |

**`search_page_ids`는 Meta Graph API의 파라미터명**이고, **SearchAPI.io wrapper는 `page_id`를 사용**한다.

### 두 번의 수정이 실패한 이유

#### 1차 수정 (ff9bfa4) — 라이브러리 레이어
```diff
- if (params.searchPageIds) {
-   url.searchParams.set("q", "");
- } else {
+ if (!params.searchPageIds) {
    url.searchParams.set("q", params.searchTerms);
  }
```
- **효과**: `q=""` 빈 문자열 전송 방지 ✅
- **한계**: `search_page_ids` 파라미터명은 그대로 → SearchAPI.io가 `page_id`를 인식 못함 ❌

#### 2차 수정 (0959d43) — 프론트엔드 레이어
```diff
- const params = new URLSearchParams({ page_id: brand.page_id, q: brand.page_name });
+ const params = new URLSearchParams({ page_id: brand.page_id });
```
- **효과**: 프론트엔드에서 불필요한 `q` 제거 ✅
- **한계**: 프론트→API route 사이의 `page_id`는 정확히 전달되지만, API route→SearchAPI.io 호출 시 `search_page_ids`로 변환됨 ❌

**두 수정 모두 "빈 q를 안 보내면 된다"는 가설로 접근했지만, 실제 문제는 SearchAPI.io에 전달하는 파라미터 이름 자체가 틀렸음.**

## 전체 데이터 흐름 (현재 — 버그 상태)

```
[프론트엔드]
  handleBrandSelect(brand)
  → fetch(`/api/competitor/search?page_id=${brand.page_id}`)  ← ✅ 올바른 파라미터명

[API Route] /api/competitor/search/route.ts
  const pageId = searchParams.get("page_id")  ← ✅ 정상 수신
  → searchMetaAds({ searchPageIds: pageId })   ← ✅ 정상 전달

[라이브러리] meta-ad-library.ts
  url.searchParams.set("search_page_ids", params.searchPageIds)  ← ❌ 잘못된 파라미터명
  → SearchAPI.io에 search_page_ids=123456 전송

[SearchAPI.io]
  "q, page_id, location_id 중 하나도 없음" → 에러 반환
```

## 수정 범위 (예상)

| 파일 | 변경 | 설명 |
|------|------|------|
| `src/lib/competitor/meta-ad-library.ts` (line 178) | `search_page_ids` → `page_id` | SearchAPI.io 파라미터명 일치 |

**1줄 수정으로 해결 가능.**

## 성공 기준

1. 브랜드 드롭다운 클릭 → 해당 브랜드의 광고 목록 정상 표시
2. 더보기(pagination) → `page_id` + `page_token` 조합으로 정상 동작
3. 키워드 검색 → 기존대로 `q` 파라미터로 정상 동작 (회귀 없음)
4. 모니터링 카드 클릭 → `page_id` 기반 검색 정상

## 영향 범위

- `searchMetaAds()` 함수를 호출하는 곳: API route, Cron job
- Cron (`/api/cron/competitor-check`) — `page_id` 기반 검색 → 같은 버그 영향 가능
- 키워드 검색 (`q` 파라미터) — 영향 없음

## 관련 커밋

| 커밋 | 날짜 | 설명 | 효과 |
|------|------|------|------|
| ff9bfa4 | 2026-03-08 18:22 | search_page_ids 있으면 q 파라미터 제거 | 빈 q 전송 방지 (불충분) |
| 0959d43 | 2026-03-08 18:41 | 프론트엔드 q 빈 문자열 제거 재수정 | 프론트 정리 (불충분) |

## 관련 문서

- `docs/01-plan/features/competitor-v2-structure.plan.md`
- `docs/02-design/features/competitor-searchapi.design.md`
- `docs/01-plan/features/open-final-t1-brand-ad-load.plan.md`
