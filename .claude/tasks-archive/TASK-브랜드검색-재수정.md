# TASK: 브랜드 클릭 시 광고 로드 — 재수정

## 목표
브랜드 드롭다운에서 프로필 클릭 시 광고가 표시되어야 한다. 이전 수정(ff9bfa4)이 동작하지 않는다.

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin)

## T1. 브랜드 클릭 → 여전히 API 에러

이전에 "search_page_ids 있으면 q 파라미터 제거"로 수정했는데 배포 후에도 동일 에러 발생.

### 파일
- `src/lib/competitor/meta-ad-library.ts`
- `src/app/api/competitor/search/route.ts`
- 브랜드 클릭 시 API를 호출하는 프론트엔드 코드

### 현재 동작
- 브랜드 클릭 → `GET /api/competitor/search?q=&page_id=215712131799664` 호출
- 여전히 `q=` (빈 문자열)이 URL에 포함됨
- API 응답: `{"error":"Either 'q' or 'page_id' or 'location_id' must be present"}` → 502

### 기대 동작
- 브랜드 클릭 → `q` 파라미터가 URL에 아예 없거나, `page_id`만으로 API 호출
- 광고 카드 목록 정상 표시

### 하지 말 것
- 검색 드롭다운 UI 건드리지 마라
- 키워드 검색 모드 변경하지 마라

## 검증 기준
- "올리브영" 검색 → 프로필 클릭 → 광고 카드 표시 (에러 없음)
- `q=` 빈 문자열이 API 요청에 포함되지 않아야 함
- npm run build 성공
- 커밋+푸시까지

## 리뷰 결과
(에이전트팀 리뷰 후 기록)
