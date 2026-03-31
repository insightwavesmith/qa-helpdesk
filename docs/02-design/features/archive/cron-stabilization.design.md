# 크론 수집 안정화 설계서

> 작성: 2026-03-01

## 1. 데이터 모델

### cron_runs 테이블
```sql
CREATE TABLE cron_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cron_name TEXT NOT NULL,           -- 'collect-daily' | 'collect-mixpanel' | 'collect-benchmarks' | 'sync-notion'
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- 'running' | 'success' | 'error' | 'partial'
  records_count INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스: health 체크 쿼리 최적화
CREATE INDEX idx_cron_runs_name_started ON cron_runs(cron_name, started_at DESC);

-- RLS: service role만 접근
ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;
```

## 2. API 설계

### 크론 이력 기록 유틸리티
- **파일**: `src/lib/cron-logger.ts` (신규)
- **함수**:
  - `startCronRun(cronName: string): Promise<string>` — INSERT 후 id 반환
  - `completeCronRun(id: string, status: 'success'|'error'|'partial', recordsCount: number, errorMessage?: string): Promise<void>` — UPDATE

### GET /api/cron/health
- **파일**: `src/app/api/cron/health/route.ts` (신규)
- **인증**: CRON_SECRET Bearer 토큰 (기존 verifyCron과 동일)
- **응답**:
  ```json
  {
    "healthy": true|false,
    "checks": {
      "collect-daily": { "lastRun": "ISO", "status": "success", "ok": true },
      "collect-mixpanel": { "lastRun": "ISO", "status": "success", "ok": true },
      "collect-benchmarks": { "lastRun": "ISO", "status": "success", "ok": true }
    },
    "missing": ["collect-daily"]  // 24시간 내 실행 없는 크론 목록
  }
  ```
- collect-benchmarks는 주 1회이므로 7일 기준으로 체크

### collect-daily 재시도
- **위치**: `src/app/api/cron/collect-daily/route.ts` 기존 Meta API 호출부
- **로직**: `fetchWithRetry(url, options, maxRetries=2)`
  - 실패 시 3초 대기 → 재시도 → 6초 대기 → 재시도
  - 429 응답: Retry-After 헤더 값 사용 (없으면 기본 대기)
  - 재시도 후에도 실패 → 해당 계정 skip, 전체 status='partial'

## 3. 컴포넌트 구조
- 프론트엔드 변경 없음 (백엔드 전용)

## 4. 에러 처리
| 상황 | 처리 |
|------|------|
| cron_runs INSERT 실패 | console.error 후 크론 계속 실행 (이력 기록 실패가 크론을 막으면 안 됨) |
| cron_runs UPDATE 실패 | console.error만 |
| Meta API 429 | Retry-After 존중, 없으면 3초/6초 |
| Meta API 그 외 에러 | 3초/6초 대기 후 재시도 |
| health 엔드포인트 DB 에러 | 500 반환 |

## 5. 구현 순서
1. [x] cron_runs SQL 마이그레이션 작성
2. [x] src/lib/cron-logger.ts 작성
3. [x] collect-daily에 cron-logger 연동 + 재시도 로직 추가
4. [x] collect-mixpanel에 cron-logger 연동
5. [x] collect-benchmarks에 cron-logger 연동 + 주석 수정
6. [x] sync-notion에 cron-logger 연동
7. [x] /api/cron/health 엔드포인트 구현
8. [x] database.ts 타입 업데이트
