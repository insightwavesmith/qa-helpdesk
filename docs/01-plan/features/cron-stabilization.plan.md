# 크론 수집 안정화 Plan

> 작성: 2026-03-01

## 배경
- 크론(collect-daily, collect-mixpanel, collect-benchmarks)이 실패해도 console.error만 찍힘
- 실행 이력이 저장되지 않아 2/6~2/25 20일 공백 발생 시 아무도 몰랐음
- collect-daily에 재시도 로직 없음 (Meta API 실패 → 영구 누락)
- collect-benchmarks 스케줄 주석이 실제와 불일치

## 범위
- A1: cron_runs 테이블 + /api/cron/health 엔드포인트
- A2: collect-daily 재시도 로직 (최대 2회, 429 Retry-After 존중)
- A3: collect-benchmarks 스케줄 주석 수정

## 범위 외
- 외부 알림 서비스 연동 (슬랙 등)
- collect-mixpanel/collect-benchmarks 재시도 (이미 있음)
- 기존 크론 로직 변경

## 성공 기준
1. 크론 실행 시 cron_runs에 이력이 기록됨 (started_at, finished_at, status, records_count)
2. /api/cron/health 호출 시 최근 24시간 실행 여부 확인 가능
3. collect-daily Meta API 실패 시 최대 2회 재시도 후 partial 기록
4. collect-benchmarks 주석이 실제 스케줄과 일치
5. npm run build 성공

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 대상 함수/API | 입력 | 기대 출력 | 비고 |
|---------------|------|-----------|------|
| `GET /api/cron/health` | (인증된 호출) | `{ crons: [{ name, last_run, status, is_healthy }] }` | 최근 24시간 실행 여부 |
| `logCronRun(name, status, records)` | `("collect-daily", "success", 150)` | cron_runs에 행 삽입 | started_at, finished_at 자동 |
| `logCronRun(name, status, records)` | `("collect-daily", "partial", 80)` | `status: "partial"` + records_count=80 | 부분 성공 기록 |
| `retryCollectDaily(accountId)` | Meta API 실패 계정 | 최대 2회 재시도 → 성공/실패 | 429 Retry-After 존중 |
| `GET /api/cron/collect-daily` | Cron 자동 호출 | `{ total, success, failed, retried }` | 전체 수집 결과 |

### T2. 엣지 케이스 정의

| 시나리오 | 입력/상황 | 기대 동작 |
|----------|-----------|-----------|
| Meta API 429 Rate Limit | Retry-After: 60 | 60초 대기 후 재시도 (최대 2회) |
| Meta API 500 서버 에러 | 1차 실패 | 즉시 재시도 1회 → 실패 시 partial 기록 |
| 24시간 내 실행 0건 | health 체크 | `is_healthy: false` 반환 |
| cron_runs 테이블 비어있음 | 첫 실행 | 정상 삽입 + health에서 해당 크론 "미실행" 표시 |
| 동시 크론 실행 | 같은 크론 2개 동시 | 중복 방지 (락 또는 skip) |
| collect-daily 전체 실패 (0건) | 모든 계정 Meta API 장애 | `status: "failed"`, `records_count: 0` 기록 |
| Retry-After 헤더 없는 429 | Meta API | 기본 30초 대기 후 재시도 |

### T3. 모킹 데이터 (Fixture)

```json
// fixtures/cron-stabilization/cron-run-success.json
{
  "id": "cr_001",
  "cron_name": "collect-daily",
  "status": "success",
  "records_count": 150,
  "started_at": "2026-03-28T02:00:00Z",
  "finished_at": "2026-03-28T02:03:45Z",
  "error_message": null
}

// fixtures/cron-stabilization/cron-run-partial.json
{
  "id": "cr_002",
  "cron_name": "collect-daily",
  "status": "partial",
  "records_count": 80,
  "started_at": "2026-03-28T02:00:00Z",
  "finished_at": "2026-03-28T02:05:12Z",
  "error_message": "3 accounts failed: Meta API 429 rate limit"
}

// fixtures/cron-stabilization/health-response.json
{
  "crons": [
    { "name": "collect-daily", "last_run": "2026-03-28T02:00:00Z", "status": "success", "records_count": 150, "is_healthy": true },
    { "name": "collect-mixpanel", "last_run": "2026-03-28T03:00:00Z", "status": "success", "records_count": 45, "is_healthy": true },
    { "name": "collect-benchmarks", "last_run": "2026-03-27T06:00:00Z", "status": "success", "records_count": 12, "is_healthy": false }
  ],
  "overall_healthy": false,
  "checked_at": "2026-03-28T12:00:00Z"
}
```

### T4. 테스트 파일 경로 규약

| 테스트 파일 | 테스트 대상 | 프레임워크 |
|-------------|-------------|------------|
| `__tests__/cron-stabilization/health-api.test.ts` | /api/cron/health 엔드포인트 | vitest |
| `__tests__/cron-stabilization/cron-logging.test.ts` | cron_runs 테이블 기록 | vitest |
| `__tests__/cron-stabilization/retry-logic.test.ts` | collect-daily 재시도 (429 + 500) | vitest |
| `__tests__/cron-stabilization/fixtures/` | JSON fixture 파일 | - |
