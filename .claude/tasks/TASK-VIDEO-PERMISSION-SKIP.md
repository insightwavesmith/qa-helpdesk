---
team: CTO
created: 2026-03-28
status: completed
owner: leader
---
# TASK: process-media 계정별 권한 체크 → 권한 없는 계정 스킵

## 이게 뭔지
process-media에서 비디오 다운로드 시 계정별로 advideos API 권한이 없으면 (#10 에러) 반복 실패함. 권한 없는 계정은 조기 스킵하는 로직 추가.

## 왜 필요한지
현재 3개 계정(1112351559994391, 1466150721479287, 868483745454045)에서 매번 (#10) permission 에러 반복. API 호출 낭비 + 크론 실행 시간 증가. 권한 있는 계정만 처리하면 효율적.

## 구현 내용

### 1. fetchVideoSourceUrls 에서 early-exit
`src/lib/protractor/creative-image-fetcher.ts`의 `fetchVideoSourceUrls()`:
- advideos 첫 페이지 호출 시 `(#10)` 또는 `(#283)` 에러 → 빈 Map 반환 + 경고 로그
- 현재: 에러 나면 break하고 빈 결과 반환 (이미 비슷하지만 로그가 불명확)
- 변경: 권한 에러 명시 로그 `[creative-fetcher] 계정 {accountId} 비디오 접근 권한 없음 — 스킵`

### 2. processVideoRows에서 계정별 그룹핑
`src/app/api/cron/process-media/route.ts`의 `processVideoRows()`:
- 현재: 전체 videoIds를 한 번에 fetchVideoSourceUrls 호출
- 변경: account_id별로 이미 그룹되어 있으므로 fetchVideoSourceUrls 결과가 빈 Map이면 해당 계정 비디오 전부 스킵
- 스킵된 건수 result에 기록

### 3. fetchVideoThumbnails도 동일 처리
- 개별 video ID 호출에서 (#10) 에러 시 continue (이미 되어있음)
- 로그만 정리: 같은 에러 반복 시 첫 1건만 상세 로그, 나머지는 카운트만

## 파일
- `src/lib/protractor/creative-image-fetcher.ts` — fetchVideoSourceUrls 에러 처리 개선
- `src/app/api/cron/process-media/route.ts` — 스킵 로그 + 결과 기록

## 프로세스 레벨
L1 (fix: 수준, 기존 로직 개선. Design 불필요)

## 검증
- 권한 없는 계정에서 (#10) 에러 1회만 발생 (반복 아님)
- 권한 있는 계정은 정상 다운로드
- tsc + build 통과
