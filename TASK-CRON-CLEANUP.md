# TASK: 크론 중복 정리 + 사용성 테스트 + API 엔드포인트 전체 체크

## 배경
GCP Cloud Scheduler 24개 중 중복 의심 쌍이 있고, 전체 크론 사용성 검증이 안 됐음. API 엔드포인트도 전수 체크 필요.

## 1. 크론 중복 정리

### 중복 의심 쌍 — 확인 후 기존 거 삭제
1. `collect-daily-morning` (기존) vs `bscamp-collect-daily` (신규) — 둘 다 광고 수집. 신규로 통합, 기존 삭제.
2. `collect-benchmark-weekly` (기존) vs `bscamp-collect-benchmarks` (신규) — 둘 다 벤치마크 수집. 신규로 통합, 기존 삭제.
3. `collect-sales-summary-daily` (기존) — 이것도 신규 크론에 통합됐는지 확인. 안 됐으면 유지.

### 정리 방법
- 기존 크론이 호출하는 Cloud Run 서비스(collect-daily, collect-benchmarks)가 신규 bscamp-cron 서비스에 통합됐는지 코드 확인
- 통합 확인되면 기존 Scheduler job 삭제 + 기존 Cloud Run 서비스도 필요 없으면 삭제
- `gcloud scheduler jobs delete JOB_NAME --location=asia-northeast3 --project=modified-shape-477110-h8`

## 2. 타임존 수정
- 현재 UTC로 설정된 크론 전부 Asia/Seoul로 변경
- `gcloud scheduler jobs update http JOB_NAME --time-zone=Asia/Seoul --location=asia-northeast3 --project=modified-shape-477110-h8`
- 기존 3개(collect-daily-morning, collect-sales-summary-daily, collect-benchmark-weekly)는 이미 Asia/Seoul

## 3. API 엔드포인트 전수 체크
- bscamp-cron Cloud Run 서비스의 모든 라우트 확인 (src/app/api/cron/ 아래)
- 각 엔드포인트에 curl로 health check (GET, Authorization: Bearer ${CRON_SECRET})
- 응답 200이 아니면 원인 파악 + 수정

### 체크할 엔드포인트 목록 (전부):
```
/api/cron/collect-daily
/api/cron/collect-content
/api/cron/collect-youtube
/api/cron/collect-clicks
/api/cron/collect-mixpanel
/api/cron/collect-benchmarks
/api/cron/crawl-lps
/api/cron/analyze-competitors
/api/cron/analyze-lp-saliency
/api/cron/embed-creatives
/api/cron/sync-notion
/api/cron/precompute
/api/cron/cleanup-deleted
/api/cron/track-performance
/api/cron/organic-benchmark
/api/cron/health
```

### Cloud Run Jobs도 체크:
```
bscamp-analyze-five-axis
bscamp-analyze-lps
bscamp-andromeda-similarity
bscamp-fatigue-risk
bscamp-lp-alignment
bscamp-score-percentiles
```
- 각 Job 수동 실행: `gcloud run jobs execute JOB_NAME --region=asia-northeast3 --project=modified-shape-477110-h8`
- 실행 후 로그 확인: `gcloud run jobs executions list --job=JOB_NAME ...`
- 실패하면 원인 파악 + 수정

## 4. 프론트 수동 수집 버튼
- /api/protractor/collect-daily, /api/protractor/collect-mixpanel → GCP Cloud Run 호출로 변경
- Vercel에서 직접 처리하지 않고 Cloud Run에 프록시

## 순서
1. 중복 크론 파악 → 기존 거 삭제
2. 타임존 전부 Asia/Seoul로 수정
3. API 엔드포인트 전수 curl 체크
4. Cloud Run Jobs 전수 수동 실행 체크
5. 실패하는 것 수정
6. 프론트 수동 버튼 GCP 변경
7. 결과 보고 (전체 목록 + 상태)

## 인증 정보
- CRON_SECRET: 7567d3c429b15a93f6d7ccda17377e25
- Cloud Run 서비스 URL: https://bscamp-cron-a4vkex7yiq-du.a.run.app
- GCP 프로젝트: modified-shape-477110-h8
- 리전: asia-northeast3
