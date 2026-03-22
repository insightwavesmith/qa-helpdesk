# TASK: 데일리 수집 범위 수정 — 등록된 수강생 계정만 수집

## 배경
현재 데일리 수집(`collect-daily/route.ts`)이 Meta API의 전체 활성 광고계정(136개)을 수집하고 있음.
bscamp에 등록된 수강생 광고계정(`ad_accounts` 테이블, active=true)만 수집해야 정상.
현재 등록 계정 29개.

## 요구사항

### 1. 데일리 수집 대상 변경
- 기존: `me/adaccounts` → Meta API의 전체 활성 광고계정
- 변경: Supabase `ad_accounts` 테이블에서 `active = true`인 계정의 `account_id` 목록을 가져와서 해당 계정만 수집
- Meta API에서 없는 계정(비활성/삭제)은 스킵

### 2. 기존 데이터 정리
- `daily_ad_insights` 테이블의 기존 데이터를 전부 삭제 (TRUNCATE 또는 DELETE)
- 이유: 등록되지 않은 계정 데이터 + 구분류(SHARE) 데이터 정리

### 3. 어제 하루치 재수집
- 코드 수정 + 빌드 완료 후 커밋/푸시
- 배포 확인 후 프로덕션에서 collect-daily 크론 호출하면 어제 데이터 수집됨

## 참조
- 데일리 수집: `src/app/api/cron/collect-daily/route.ts`
- 광고계정 테이블: `ad_accounts` (컬럼: account_id, active 등)
- Supabase 클라이언트: 기존 코드의 createClient 방식 참조

## 빌드 검증 + 커밋 + 푸시
- `npm run build` 통과
- 커밋 메시지: `fix: 데일리 수집 — 전체 계정 → ad_accounts 등록 계정만 수집 + 기존 데이터 정리`
- main 브랜치에 푸시
