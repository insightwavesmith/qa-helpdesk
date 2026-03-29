# BM Full Account Sync — Gap 분석

> 분석일: 2026-03-30
> 설계서: `docs/02-design/features/bm-full-account-sync.design.md`
> TASK: `.claude/tasks/TASK-BM-FULL-ACCOUNT-SYNC.md`

## Match Rate: 92%

## 일치 항목 (11/12)

### discover-accounts 진단 ✅
- [x] Cloud Scheduler 등록 여부 확인 → 미등록 확인
- [x] cron_runs 테이블 최근 실행 로그 확인 → 0건 (한 번도 실행 안 됨)
- [x] /me/adaccounts API 직접 호출 → 154개 계정 반환 확인
- [x] 코드 정상 확인 → 순수 함수 export 추가 (buildNewAccountRow, buildUpdateFields, findAccountsToDeactivate)

### collect-daily 배치 동적화 ✅
- [x] DYNAMIC_BATCH_SIZE=20 상수 분리
- [x] batch 파라미터 없이 호출 시 전체 active 계정 처리
- [x] batch 파라미터 있으면 하위 호환 유지 (동적 분할)

### creatives is_member 동적화 ✅
- [x] 수집 시작 시 ad_accounts.is_member 맵 조회 (isMemberMap)
- [x] creatives UPSERT에서 is_member 동적 설정
- [x] source: "member"/"discovered" 동적 설정

### TDD ✅
- [x] collect-daily-batch.test.ts — 6건 Green
- [x] is-member-dynamic.test.ts — 7건 Green
- [x] discover-accounts.test.ts — 5건 Green
- [x] 전체 18건 Green

## 불일치 항목 (1/12)

### Cloud Scheduler 등록 미실행
- 설계서 §4.1에 "Cloud Scheduler 등록"이 Wave 3 검증 항목으로 있으나, Cloud Scheduler 등록은 GCP 콘솔/gcloud CLI에서 수행하는 인프라 작업으로 코드 변경 범위 밖
- **영향**: discover-accounts를 주 1회 자동 실행하려면 Cloud Scheduler에 등록 필요 (수동 실행은 가능)
- **심각도**: Medium (기능은 준비됨, 인프라 설정만 남음)

## 수정 필요 없음
- Match Rate 92% (기준 90% 충족)
- 불일치 1건은 인프라 설정 작업으로 별도 진행

## 검증 결과

| 항목 | 결과 |
|------|------|
| `npx tsc --noEmit` | 수정 파일 에러 0 |
| `npm run build` | 성공 |
| TDD 18건 | 전부 Green |
| /me/adaccounts | 154개 계정 반환 확인 |
| discover-accounts 원인 | Cloud Scheduler 미등록 (코드 정상) |
