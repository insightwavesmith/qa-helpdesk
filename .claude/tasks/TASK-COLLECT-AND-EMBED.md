# TASK: LP 수집 + 광고 콘텐츠 수집 + 임베딩 — 실행 TASK

## CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라

## 우선순위 (Smith님 지시: 분석은 나중에. 수집+임베딩만 먼저)

### 1. LP 수집 완성 + 실행
- 미push 커밋 push 해라: `0ee8dbb` (LP 미디어 다운로드 +420줄) 외 미push분 전부
- DB migration 실행: `supabase/migrations/20260323_landing_pages_media_assets.sql`
- GCP Cloud Run 재빌드+배포: `gcloud builds submit` → `gcloud run deploy bscamp-cron`
- 배포 후 crawl-lps 수동 트리거해서 미디어 다운로드 동작 확인
- LP 스크린샷 없는 것 있으면 재크롤링

### 2. 광고 콘텐츠(소재) 수집
- 미수집 19개 계정 원인 파악:
  - `ad_accounts`에서 active=true인데 `daily_ad_insights`에 데이터 없는 계정 추출
  - Meta API로 접근 가능한지 확인 (토큰 권한)
  - 원인: (a) 권한 없음 → 목록 보고 (b) 광고 안 돌림 → 정상 (c) 코드 버그 → 수정
- storage 없는 소재 83건: `download-missing-media.mjs` 실행
- 글로우빈/프로이덴 3/19 이후 수집 멈춤 → 원인 확인

### 3. 임베딩
- 미임베딩 105건 → embed-creatives 배치 실행
- Cloud Run Job `bscamp-embed-creatives` 트리거 또는 로컬 실행
- 완료 확인 후 보고

### 4. 하지 말 것
- 5축 분석 (나중에)
- LP 분석 (나중에)
- 프론트엔드 수정 (나중에)

## 완료 기준
- LP: 미디어 다운로드 프로덕션 동작 확인
- 소재: storage 없는 것 0건
- 임베딩: 미임베딩 0건
- 미수집 계정: 원인 분류 완료
