# TASK: 브랜드 클릭 시 광고 로드 — API 파라미터 수정

## 목표
브랜드 드롭다운에서 프로필을 클릭하면 해당 브랜드의 광고 목록이 표시되어야 한다.

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin)

## T1. 브랜드 클릭 → "q or page_id must be present" 에러

수강생이 올리브영을 검색해서 드롭다운에서 공식 프로필을 클릭하면 광고가 나와야 한다.
지금은 클릭하면 "검색 API 호출 실패: Either q or page_id or location_id must be present" 에러가 뜬다.

### 파일
- `src/lib/competitor/meta-ad-library.ts`
- `src/app/api/competitor/search/route.ts`

### 현재 동작
- 브랜드 클릭 → API에 `q=""` (빈 문자열) + `search_page_ids` 전송
- SearchAPI.io가 `q` 빈 문자열을 유효하지 않다고 거부

### 기대 동작
- `search_page_ids`가 있으면 `q` 파라미터를 아예 빼거나, `q`에 `*` 와일드카드를 넣어서 해당 page_id의 모든 광고 반환
- 브랜드 클릭 → 해당 브랜드의 광고 카드 목록 정상 표시

### 하지 말 것
- 검색 드롭다운 UI 건드리지 마라
- 키워드 검색 모드 동작 변경하지 마라
- 모니터링 패널 건드리지 마라

## 검증 기준
- "올리브영" 검색 → 프로필 클릭 → 광고 카드 목록 표시
- 키워드 검색도 기존처럼 정상 동작
- npm run build 성공
- 커밋+푸시까지

## 리뷰 결과
(에이전트팀 리뷰 후 기록)
