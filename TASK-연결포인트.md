# TASK-연결포인트: 회원→총가치각도기 자동연결 + 벤치마크 API 필드 수정

## 개요
수강생이 3개 키(광고계정ID, 믹스패널프로젝트ID, 믹스패널시크릿키)를 입력하면
ad_accounts + service_secrets에 자동 등록되어야 함.
현재는 profiles에만 저장되고 ad_accounts가 비어서 총가치각도기에서 "광고계정 연결" 배너가 뜸.

입력 경로 3곳 전부 ad_accounts 자동연결 필수:
1. 온보딩 (saveAdAccount)
2. 수강생 설정 (/settings)
3. 관리자 회원관리 (approveMember — 이미 구현됨)

## 필수 참고
- `src/actions/onboarding.ts` — saveAdAccount() 함수
- `src/actions/admin.ts` — approveMember() 함수 (이미 ad_accounts upsert 있음, 참고용)
- `src/app/(main)/settings/page.tsx` — 설정 페이지
- `src/app/api/protractor/accounts/route.ts` — 총가치각도기가 ad_accounts 조회하는 곳
- `src/app/(main)/protractor/real-dashboard.tsx` — accounts.length === 0이면 배너 표시

## T1. 온보딩 saveAdAccount에 ad_accounts upsert 추가

### 현재:
saveAdAccount()가 profiles 테이블만 업데이트하고 끝남.
ad_accounts INSERT 없음.

### 변경:
profiles 업데이트 후, meta_account_id가 있으면:
1. ad_accounts에 user_id로 조회 → 있으면 UPDATE, 없으면 INSERT
2. service_secrets에 mixpanel_secret_key upsert (approveMember와 동일 패턴)

### 주의:
- approveMember()의 ad_accounts upsert 로직을 그대로 참고
- account_name은 meta_account_id 값으로 기본 설정
- active: true로 설정
- mixpanel_board_id는 온보딩에서 입력 안 함 — null 허용

## T2. 설정 페이지(/settings)에서도 ad_accounts 동기화

### 현재:
수강생이 설정에서 광고계정ID/믹스패널ID/시크릿키를 수정하면 profiles만 업데이트.

### 변경:
설정 저장 시에도 T1과 동일하게 ad_accounts + service_secrets 동기화.

### 주의:
- 설정에서 광고계정ID를 변경하면 기존 ad_accounts 행을 UPDATE (user_id 기준)
- 광고계정ID를 삭제(빈값)하면 ad_accounts 행도 비활성화 (active: false)

## T3. 관리자 회원관리에서 확인

### 현재:
approveMember()에 이미 ad_accounts upsert 있음.

### 확인만:
- 관리자가 회원 상세 모달에서 3개 키를 편집+저장할 때도 ad_accounts가 동기화되는지 확인
- 안 되면 동일한 upsert 로직 추가

## T4. collect-benchmarks video_p3s_watched_actions 필드 수정

### 현재:
collect-daily에서 Meta API 호출 시 `video_p3s_watched_actions` 필드를 요청하는데,
Meta API v21.0에서 이 필드가 deprecated되어 에러 발생:
`(#100) video_p3s_watched_actions is not valid for fields param`

### 변경:
`src/app/api/cron/collect-daily/route.ts` 125행:
- `video_p3s_watched_actions` → `video_play_actions` 로 변경
  (또는 Meta API v21.0 docs에서 유효한 대체 필드 확인)
- 관련 파싱 로직(81행, 101행)도 같이 수정

### 확인:
- Meta Marketing API reference: https://developers.facebook.com/docs/marketing-api/reference/ads-insights/
- video_p3s_watched_actions 대체 필드: video_play_actions (3초 시청)
- video_thruplay_watched_actions는 그대로 유효한지도 확인

## T5. 벤치마크 수동 수집

### T4 수정 후:
1. npm run build 성공 확인
2. 로컬에서 next start -p 3099
3. curl로 collect-benchmarks 실행 (collect-daily는 회원 연결 수정 후 따로 테스트):
   ```
   curl -H "Authorization: Bearer local-dev-secret-2026" http://localhost:3099/api/cron/collect-benchmarks
   ```
4. 결과 확인 — benchmarks 테이블에 데이터 들어가는지 확인

### 주의:
- .env.local에 CRON_SECRET=local-dev-secret-2026, META_ACCESS_TOKEN 이미 설정됨
- collect-benchmarks는 daily_ad_insights에 데이터 필요 — 현재 데이터가 0이면 "No data" 응답 정상
- 벤치마크 자체가 daily_ad_insights 기반이므로, T4 수정 후 collect-daily도 한번 돌려서 데이터 확인

## 실행 순서
1. T1 (온보딩 연결) → T2 (설정 연결) → T3 (관리자 확인)
2. T4 (API 필드 수정) → T5 (벤치마크 수집 테스트)
3. 전체 빌드 확인

## 리뷰 결과
(에이전트팀 리뷰 후 기록)
