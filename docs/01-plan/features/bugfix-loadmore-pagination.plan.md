# 더보기 페이지네이션 1건 로드 버그 수정 — Plan

## 날짜
2026-03-09

## 문제 정의
경쟁사 광고 검색(올리브영 등) → 첫 검색 30건 정상 표시 → '더보기' 클릭 → **1건만 추가**됨. SearchAPI.io 기준 55건 중 나머지 24건이 로드되지 않음.

## 범위
- 백엔드: `src/lib/competitor/meta-ad-library.ts`, `src/app/api/competitor/search/route.ts`
- 프론트엔드: `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`

## 근본 원인 (코드리뷰 결과)

### 핵심 원인: `page_token` + `q`/`page_id` 동시 전송
`meta-ad-library.ts` 162~171행에서 pagination 시 `page_token`과 함께 `q` 또는 `page_id`를 전송.
SearchAPI.io가 이를 새 쿼리로 해석하여, page 1과 거의 동일한 결과를 반환.
이후 `route.ts`의 `seen_ids` 필터링에서 기존 30건과 겹치는 29건이 제거되어 1건만 남음.

### 증폭 요인
1. `seen_ids` URL query string에 수십~수백 ID → URL 길이 제한 위험
2. `handleLoadMore`에서 `serverTotalCount` 미갱신 → UI에 "55건" 표시 유지

### 증거
- 코드 주석에서 이미 동일 유형 문제 인지: "필터까지 보내면 SearchAPI.io가 새 쿼리로 해석하여 중복 반환"
- `country`, `ad_active_status`, `media_type`은 이전에 제거했으나, `q`/`page_id`는 미제거

## 수정 전략

### 전략 A: `page_token`만 전송 (권장)
- `page_token`이 있을 때 `q`/`page_id` 제거
- SearchAPI.io `page_token`이 쿼리 컨텍스트를 인코딩한다는 가정
- **선행 조건**: SearchAPI.io 공식 문서에서 `page_token` 단독 사용 가능 여부 확인

### 전략 B: `seen_ids` 제거 + 클라이언트 dedup
- 서버 `seen_ids` 필터 제거 (정상 pagination이면 불필요)
- 프론트에서 `setAds` 시 ID 기준 중복 제거
- URL 길이 제한 위험 제거

### 전략 C: A + B 병행 (가장 안전)
- `page_token`만 전송
- 서버 `seen_ids` 제거
- 프론트에서 방어적 dedup 유지
- `serverTotalCount` 더보기 후에도 갱신

## 성공 기준
1. "올리브영" 검색 → 30건 → 더보기 → 25건 추가 → 총 55건 로드
2. 더보기 반복 시 모든 광고가 누락 없이 로드됨
3. URL 길이 제한에 걸리지 않음
4. `npm run build` 성공, lint 에러 0개

## 관련 파일
- `src/lib/competitor/meta-ad-library.ts` — searchMetaAds pagination 로직
- `src/app/api/competitor/search/route.ts` — seen_ids 필터 + 응답 구성
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` — handleLoadMore, state 관리
- `src/app/(main)/protractor/competitor/components/ad-card-list.tsx` — 더보기 UI
- `src/types/competitor.ts` — CompetitorSearchResponse

## 선행 작업
- [ ] SearchAPI.io meta_ad_library pagination 공식 문서 확인
- [ ] 실제 SearchAPI.io 응답 로깅으로 page 2 결과 확인 (page 1과 겹치는지)
