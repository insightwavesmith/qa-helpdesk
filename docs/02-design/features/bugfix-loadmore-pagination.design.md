# 더보기 페이지네이션 1건 로드 버그 수정 — Design

## 날짜
2026-03-09

## 1. 데이터 모델
변경 없음. 기존 `CompetitorAd`, `CompetitorSearchResponse` 타입 유지.

## 2. API 설계

### 변경: GET /api/competitor/search

#### 요청 파라미터 변경
| 파라미터 | 변경 전 | 변경 후 |
|----------|---------|---------|
| `seen_ids` | 콤마 구분 ID 목록 (서버 dedup) | **제거** — 서버 dedup 불필요 |
| `page_token` | `q`/`page_id`와 함께 전송 | **단독 전송** (+ `engine`, `api_key`만) |

#### 응답 변경
| 필드 | 변경 전 | 변경 후 |
|------|---------|---------|
| `totalCount` | `dedupedAds.length` | `ads.length` (dedup 없으므로 동일) |
| `serverTotalCount` | 유지 | 유지 |

### 변경: meta-ad-library.ts — searchMetaAds

```
// BEFORE (162~171행)
if (params.pageToken) {
    url.searchParams.set("page_token", params.pageToken);
    if (params.searchPageIds) {
      url.searchParams.set("page_id", params.searchPageIds);    // ← 제거
    } else if (params.searchTerms) {
      url.searchParams.set("q", params.searchTerms);            // ← 제거
    }
}

// AFTER
if (params.pageToken) {
    url.searchParams.set("page_token", params.pageToken);
    // page_token이 쿼리 컨텍스트를 인코딩하므로 q/page_id 추가 불필요
    // 추가 시 SearchAPI.io가 새 검색으로 해석하여 중복 반환
}
```

### 변경: route.ts — seen_ids 제거

```
// BEFORE (93~97행)
const dedupedAds = seenIds.size > 0
    ? finalResult.ads.filter((ad) => !seenIds.has(ad.id))
    : finalResult.ads;

// AFTER
// 서버 dedup 제거 — 정상 pagination에서는 불필요
// 프론트에서 방어적 dedup 처리
const dedupedAds = finalResult.ads;
```

## 3. 컴포넌트 구조

### 변경: competitor-dashboard.tsx — handleLoadMore

#### seen_ids 파라미터 제거
```
// BEFORE (117~119행)
if (ads.length > 0) {
    fetchParams.set("seen_ids", ads.map((a) => a.id).join(","));
}

// AFTER
// seen_ids 제거 — 서버에서 dedup 안 하므로 불필요
```

#### 프론트 방어적 dedup 추가
```
// BEFORE
setAds((prev) => [...prev, ...newAds]);

// AFTER
setAds((prev) => {
    const existingIds = new Set(prev.map(a => a.id));
    const uniqueNew = newAds.filter(a => !existingIds.has(a.id));
    return [...prev, ...uniqueNew];
});
```

#### serverTotalCount 갱신 (선택)
```
// handleLoadMore에서:
if (json.serverTotalCount) {
    setServerTotalCount(json.serverTotalCount);
}
```

## 4. 에러 처리
| 에러 상황 | 처리 |
|----------|------|
| SearchAPI.io `page_token`만 전송 시 에러 | page_token + q/page_id 폴백 (기존 로직) |
| 프론트 dedup 후 newAds 0건 | 기존 로직 유지 (toast.info) |
| 다음 페이지 없음 (nextPageToken null) | 기존 로직 유지 (더보기 버튼 숨김) |

## 5. 구현 순서

### Phase 1: SearchAPI.io 확인 (선행 필수)
- [ ] SearchAPI.io 공식 문서에서 `page_token` 단독 전송 가능 여부 확인
- [ ] 디버그 로깅으로 실제 응답 확인 (page 2 결과가 page 1과 겹치는지)

### Phase 2: 백엔드 수정
- [ ] `meta-ad-library.ts`: pagination 시 `q`/`page_id` 제거 (page_token만 전송)
- [ ] `route.ts`: `seen_ids` 파싱/필터링 로직 제거

### Phase 3: 프론트엔드 수정
- [ ] `competitor-dashboard.tsx`: `seen_ids` 파라미터 전송 제거
- [ ] `competitor-dashboard.tsx`: `setAds` 시 방어적 dedup 추가
- [ ] `competitor-dashboard.tsx`: `serverTotalCount` 갱신 (선택)

### Phase 4: 검증
- [ ] "올리브영" 검색 → 30건 → 더보기 → 25건 추가 → 총 55건
- [ ] 키워드 검색 (searchMode="keyword")에서도 동일 검증
- [ ] `npm run build` 성공
- [ ] lint 에러 0개

## 리스크
1. **SearchAPI.io `page_token` 단독 전송 미지원**: 만약 `page_token`만으로 동작하지 않으면, `q`/`page_id`를 보내되 서버 dedup을 유지해야 함. 이 경우 SearchAPI.io의 pagination 자체가 중복을 반환하는 것이므로, 클라이언트에서 offset 기반 직접 관리가 필요할 수 있음.
2. **URL 길이 문제**: seen_ids 제거하면 해결. 제거하지 않을 경우 POST로 전환 또는 해시 기반 dedup 필요.
