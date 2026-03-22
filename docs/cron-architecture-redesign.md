# 크론 아키텍처 근본 재설계

> 문제: Vercel 5분 타임아웃으로 크론 전반 실패
> 작성: 2026-03-20

---

## 1. 현재 문제

### 증상
- collect-daily: 3일 연속 실패/멈춤 (3/18 partial, 3/19 running, 3/20 running)
- 40개 계정 중 4개만 처리되고 타임아웃
- 다른 크론도 대부분 partial

### 근본 원인
1. **Vercel 5분(300초) 하드 제한** — Pro 플랜 최대, 올릴 수 없음
2. **단일 함수에 모든 계정 순차 처리** — 40개 × Meta API = 5분 초과
3. **중복 API 호출** — collect-daily, embed-creatives 둘 다 같은 Meta API 호출
4. **동시 실행 경합** — 03:00에 collect-daily + crawl-lps + collect-mixpanel 동시

### 현재 크론 12개 정리

| 크론 | 스케줄 (KST) | 외부 API | 5분 내 가능? |
|------|-------------|----------|:----------:|
| collect-daily | 03:00 | Meta API × 40계정 | ❌ 초과 |
| embed-creatives | 07:00 | Meta API × 40계정 + Gemini Embedding | ❌ 초과 |
| collect-benchmarks | 월 02:00 | Meta API | ⚠️ 빡빡 |
| crawl-lps | 매시간 | Railway | ✅ (20건) |
| collect-content | 05:00 | RSS/HTTP | ✅ |
| collect-youtube | 06:00 | YouTube RSS | ✅ |
| collect-mixpanel | 03:30 | Mixpanel API | ⚠️ |
| sync-notion | 04:00 | Notion API | ✅ |
| precompute | 04:30 | 내부 DB | ✅ |
| analyze-competitors | 23:00 | Gemini + SearchAPI | ⚠️ |
| cleanup-deleted | 04:00 | 내부 DB | ✅ |
| organic-benchmark | 월 03:00 | 내부 DB | ✅ |

---

## 2. 해결 방안

### 방안 A: 계정 분할 크론 (가장 간단)

collect-daily를 4개 크론으로 분할:

```
collect-daily-batch1  → 계정 1~10  → 03:00
collect-daily-batch2  → 계정 11~20 → 03:05
collect-daily-batch3  → 계정 21~30 → 03:10
collect-daily-batch4  → 계정 31~40 → 03:15
```

**장점**: 코드 수정 최소 (쿼리에 offset/limit 추가)
**단점**: 계정 늘어나면 또 분할 필요, 크론 수 증가

### 방안 B: 큐 기반 아키텍처 (근본 해결)

```
[1단계: 디스패처] (5초)
collect-daily-dispatcher
  → ad_accounts에서 활성 계정 조회
  → cron_queue 테이블에 40건 INSERT
  → 즉시 완료

[2단계: 워커] (매분 실행, 5분 제한)
collect-daily-worker
  → cron_queue에서 status='pending' 5건 SELECT
  → 5건 처리 (Meta API 호출 + DB 저장)
  → status='completed' UPDATE
  → 5분 안에 충분

[자동 완료]
  → 매분 5건씩 → 8분이면 40건 전부 완료
  → 실패 시 자동 재시도 (status='failed' → pending 리셋)
```

**장점**: 
- 계정 100개 되어도 자동 확장
- 실패 건 자동 재시도
- 처리 상태 추적 가능 (cron_queue 테이블)
- 다른 크론에도 동일 패턴 적용 가능

**단점**: 
- 코드 수정 필요 (디스패처 + 워커 2개)
- cron_queue 테이블 신규
- vercel.json 크론 추가

### 방안 C: collect-daily + embed-creatives 통합 + 배치 분할

```
[통합 크론: collect-and-embed]
  → Meta API 1회 호출 (중복 제거)
  → insights 저장 + embeddings 저장 동시
  → 10개 계정 단위로 4회 분할
```

**장점**: Meta API 호출 절반으로 감소, rate limit 여유
**단점**: 함수가 복잡해짐

---

## 3. 추천: 방안 B (큐 기반) + 단기 방안 A 병행

### 즉시 (오늘): 방안 A
- collect-daily를 batch 4개로 분할
- embed-creatives 시간대 분리 (07:00 → 09:00)
- 3/19 데이터 수동 복구

### 이번 주: 방안 B
- cron_queue 테이블 생성
- dispatcher + worker 패턴 구현
- collect-daily를 큐 기반으로 전환
- embed-creatives도 동일 패턴 적용

### 다음 주: 전체 크론 큐 기반 전환
- analyze-competitors, collect-benchmarks 등도 큐 패턴
- 크론 모니터링 대시보드 (cron_queue 상태 조회 API)

---

## 4. cron_queue 테이블 설계

```sql
CREATE TABLE cron_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cron_name TEXT NOT NULL,        -- 'collect-daily', 'embed-creatives' 등
  batch_key TEXT NOT NULL,        -- 계정ID, 소재ID 등 처리 단위
  payload JSONB,                  -- 추가 파라미터
  status TEXT DEFAULT 'pending',  -- pending/processing/completed/failed
  priority INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  UNIQUE(cron_name, batch_key, DATE(created_at))  -- 하루 1번만
);

CREATE INDEX idx_cron_queue_pending ON cron_queue(cron_name, status) WHERE status = 'pending';
```

---

## 5. 비용 영향

- 크론 빈도 증가 (매분 워커) → Vercel Function 실행 횟수 증가
- Pro 플랜 포함량 1,000 GB-hours → 매분 워커도 여유 (월 ~30 GB-hours 추가)
- 추가 비용 0원 (Pro 포함량 내)
