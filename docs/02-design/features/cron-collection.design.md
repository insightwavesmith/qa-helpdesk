# Cron 수집 파이프라인 설계서

> 최초 작성: 2026-02-28

---

## 1. 개요

Vercel Cron으로 스케줄된 3개 수집 API. Meta/Mixpanel 외부 데이터를 DB에 적재.

## 2. 수집 라우트

### GET /api/cron/collect-daily
- **스케줄**: 매일 03:00 UTC (KST 12:00)
- **소스**: Meta Graph API v21.0 `/act_{id}/ads`
- **인증**: CRON_SECRET Bearer 토큰
- **처리**:
  1. `/me/adaccounts` → 전체 광고계정 목록
  2. 계정별 active 광고의 어제(yesterday) 인사이트 수집
  3. 지표 계산 (13개 + spend/impressions/reach/clicks/purchases 등)
  4. `daily_ad_insights` INSERT
  5. overlap 수집: adset별 개별 reach + Meta combined reach → `daily_overlap_insights` UPSERT
- **파라미터**: `?date=YYYY-MM-DD` (기본: 어제)
- **타임아웃**: 300초 (Vercel Pro)

### GET /api/cron/collect-benchmarks
- **스케줄**: 매주 월요일 02:00 UTC (KST 11:00)
- **소스**: Meta Graph API v21.0 `/act_{id}/insights` (level=ad, last_7d)
- **인증**: CRON_SECRET Bearer 토큰
- **처리**:
  1. 전체 활성 계정 조회 (account_status=1)
  2. 계정별 상위 10개 광고 (spend 내림차순, impressions ≥ 3,500)
  3. creative_type 판별 (VIDEO/IMAGE)
  4. `ad_insights_classified` DELETE → INSERT (전체 교체)
  5. creative_type × ranking_type × ranking_group별 평균 → `benchmarks` DELETE → INSERT
  6. MEDIAN_ALL: creative_type별 전체 평균 추가
- **Rate limit**: 계정당 200ms 대기, 429 시 exponential backoff (최대 3회)
- **타임아웃**: 300초

### GET /api/cron/collect-mixpanel
- **스케줄**: 매일 03:30 UTC (KST 12:30) — collect-daily 30분 후
- **소스**: Mixpanel Segmentation API
- **인증**: CRON_SECRET + Mixpanel secret key (service_secrets 또는 profiles fallback)
- **처리**:
  1. `ad_accounts` 테이블에서 mixpanel_project_id 있는 활성 계정 조회
  2. 계정별 secret key 조회 (service_secrets 우선 → profiles fallback)
  3. Mixpanel event=purchase → total_revenue (value 합), purchase_count
  4. `daily_mixpanel_insights` UPSERT (date + account_id + project_id)
- **파라미터**: `?date=YYYY-MM-DD` (기본: 어제)
- **타임아웃**: 300초

## 3. Vercel Cron 스케줄 (vercel.json)

```json
{
  "crons": [
    { "path": "/api/cron/collect-daily", "schedule": "0 3 * * *" },
    { "path": "/api/cron/collect-benchmarks", "schedule": "0 2 * * 1" },
    { "path": "/api/cron/collect-mixpanel", "schedule": "30 3 * * *" }
  ]
}
```

## 4. 관리자 재수집 API

수동 재수집용 엔드포인트 (관리자 UI에서 호출):

| 엔드포인트 | 설명 |
|-----------|------|
| GET /api/protractor/collect-daily?date=YYYY-MM-DD | 특정 날짜 재수집 |
| GET /api/protractor/collect-mixpanel?date=YYYY-MM-DD | Mixpanel 재수집 |
| GET /api/protractor/benchmarks/collect | 벤치마크 재수집 |

## 5. DB 테이블

| 테이블 | PK/Unique | 수집 라우트 |
|--------|-----------|------------|
| daily_ad_insights | (date, account_id, ad_id) | collect-daily |
| daily_overlap_insights | (account_id, date) | collect-daily |
| ad_insights_classified | id (auto) | collect-benchmarks |
| benchmarks | id (auto) | collect-benchmarks |
| daily_mixpanel_insights | (date, account_id, project_id) | collect-mixpanel |

## 6. 환경 변수

| 변수 | 용도 |
|------|------|
| CRON_SECRET | Vercel Cron 인증 토큰 |
| META_ACCESS_TOKEN | Meta Graph API 접근 |
| (DB) service_secrets / profiles.mixpanel_secret_key | Mixpanel API 인증 |

## 7. 에러 처리

- Meta API 429: exponential backoff (collect-benchmarks)
- Mixpanel 401: "시크릿키 만료 또는 무효" 로그
- Mixpanel 타임아웃: 1회 재시도
- 계정별 격리: 한 계정 실패해도 다른 계정 계속 처리
- overlap 실패: 격리 (다른 수집에 영향 없음)
