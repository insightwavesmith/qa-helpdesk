# 경쟁사v2 핫픽스 Gap 분석

## Match Rate: 100% (6/6 일치)

---

## 일치 항목

### F1. 브랜드 검색 안됨 (CRITICAL) — MATCH

| 항목 | 내용 |
|------|------|
| **기대 동작** | `searchBrandPages()`에서 `json.page_results`로 파싱하여 한글/영어/인스타 쿼리 모두 결과 반환 |
| **실제 구현** | `meta-ad-library.ts:259-260` — `json.page_results ?? json.data ?? []`로 파싱. `page_results` 키를 최우선 참조 |
| **searchMetaAds 보존** | `searchMetaAds()`는 기존 `json.ads ?? json.data ?? []` 유지 (미변경) |

### F2. 더보기 안됨 (페이지네이션) — MATCH

| 항목 | 내용 |
|------|------|
| **기대 동작** | 더보기 클릭 시 `next_page_token`으로 다음 30건 로드, 기존 결과에 append, 로딩 스피너 표시 |
| **실제 구현 — 프론트** | `competitor-dashboard.tsx:99-135` — `handleLoadMore()`가 `page_token` 파라미터와 함께 API 호출, 응답을 중복 제거 후 기존 ads에 누적 (`setAds(prev => [...prev, ...deduped])`) |
| **실제 구현 — API** | `route.ts:21` — `page_token` 쿼리 파라미터 수신, `searchMetaAds({ pageToken })`에 전달 |
| **실제 구현 — SDK** | `meta-ad-library.ts:176-179` — `page_token`을 SearchAPI.io URL에 설정, 응답의 `pagination.next_page_token` 파싱 |
| **로딩 스피너** | `ad-card-list.tsx:257-260` — `loadingMore` 상태 시 `Loader2` 스피너 + "불러오는 중..." 텍스트 표시 |

### F3. 정렬 안됨 — MATCH

| 항목 | 내용 |
|------|------|
| **기대 동작** | 최신순: `start_date` 내림차순 (기본), 운영기간순: `durationDays` 내림차순, 토글 즉시 반영 |
| **실제 구현 — 정렬 로직** | `competitor-dashboard.tsx:146-166` — `useMemo`로 `filteredAds` 산출. `sortBy === "duration"` 이면 `b.durationDays - a.durationDays`, 기본은 `new Date(b.startDate) - new Date(a.startDate)` |
| **실제 구현 — 토글 UI** | `filter-chips.tsx:60-71` — `최신순`/`운영기간순` 칩이 `sortBy` 상태를 즉시 변경, `useMemo` 의존성으로 즉시 재렌더 |

### F4. 불필요한 필터 제거 — MATCH

| 항목 | 내용 |
|------|------|
| **기대 동작** | 게재중 필터 삭제, Facebook/Instagram 필터 삭제, 소재 유형(이미지/슬라이드/영상)만 남김 |
| **실제 구현** | `filter-chips.tsx:23-71` — CHIPS 배열에 `30일+`, `이미지`, `슬라이드`, `영상`, `최신순`, `운영기간순`만 정의. 게재중(`activeOnly`) 칩 없음, Facebook/Instagram(`platform`) 칩 없음 |
| **FilterState 잔여 필드** | `activeOnly`, `platform` 필드가 `FilterState` 인터페이스에 남아 있으나 이를 토글하는 UI 칩이 없으므로 항상 기본값(`false`, `""`)으로 동작 — 기능상 문제 없음 |

### F5. 카드 버튼 정리 — MATCH

| 항목 | 내용 |
|------|------|
| **기대 동작** | 소재보기 + 다운로드 + 브랜드 등록 3개만. 랜딩페이지/Facebook/Ad Library 버튼 삭제. 이미 등록된 브랜드는 비활성화/"등록됨" 표시 |
| **실제 구현** | `ad-card.tsx:220-271` — CTA 버튼 3개만 렌더링: (1) 소재 보기, (2) 다운로드, (3) 브랜드 등록 |
| **브랜드 등록 비활성화** | `ad-card.tsx:247` — `disabled={isPinned}`, 텍스트는 `isPinned ? "등록됨" : "브랜드 등록"` (line 268) |
| **isPinned 판정** | `ad-card-list.tsx:240-242` — `monitors.some(m => m.pageId === ad.pageId \|\| m.brandName === ad.pageName)` |

### F6. 검색 기본값 = 게재중만 — MATCH

| 항목 | 내용 |
|------|------|
| **기대 동작** | SearchAPI.io 호출 시 `ad_active_status=active` 기본 설정 |
| **실제 구현** | `meta-ad-library.ts:165` — `url.searchParams.set("ad_active_status", "active")` 하드코딩. 파라미터로 override 불가하므로 항상 게재중만 검색 |

---

## 불일치 항목

없음.

---

## 수정 필요

| 항목 | 심각도 | 내용 |
|------|--------|------|
| FilterState 잔여 필드 | LOW (Optional cleanup) | `activeOnly`, `platform` 필드가 `FilterState`에 남아 있으나 UI에서 사용하지 않음. dead code 정리 차원에서 제거 가능하나 기능 영향 없음 |

---

## 검증 기준 대조

| # | 검증 기준 | 충족 |
|---|-----------|------|
| 1 | 브랜드 검색 "올리브영" -> 드롭다운에 결과 표시 (page_results 파싱) | O |
| 2 | 더보기 -> 다음 30건 로드 | O |
| 3 | 최신순/운영기간순 -> 실제 순서 변경 | O |
| 4 | 게재중/Facebook/Instagram 필터 칩 사라짐 | O |
| 5 | 카드에 소재보기 + 다운로드 + 브랜드등록 3개 버튼만 | O |
| 6 | 검색 결과 = 게재중 광고만 | O |

---

*분석 일시: 2026-03-08*
*분석 대상 파일: meta-ad-library.ts, competitor-dashboard.tsx, filter-chips.tsx, ad-card.tsx, ad-card-list.tsx, route.ts*
