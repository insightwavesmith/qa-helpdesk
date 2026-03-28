# 사전계산 Phase 2 설계서

## 1. 데이터 모델

### 1.1 dashboard_stats_cache
```sql
CREATE TABLE dashboard_stats_cache (
  stat_key TEXT PRIMARY KEY,              -- 'counts', 'weekly_questions'
  stat_value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);
```
- `counts` 키: `{totalQuestions, weeklyQuestions, openQuestions, pendingAnswers, totalPosts, activeMembers}`
- `weekly_questions` 키: `[{date, label, 질문수}]` (28일치)

### 1.2 email_campaign_stats
```sql
CREATE TABLE email_campaign_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subject TEXT NOT NULL UNIQUE,
  content_id TEXT,
  sent_at TIMESTAMPTZ,
  recipients INT DEFAULT 0,
  opens INT DEFAULT 0,
  clicks INT DEFAULT 0,
  open_rate NUMERIC(5,1) DEFAULT 0,
  click_rate NUMERIC(5,1) DEFAULT 0,
  sends_json JSONB DEFAULT '[]',          -- 개별 발송 상세 [{id, email, type, openedAt, clickedAt}]
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 1.3 knowledge_daily_stats
```sql
CREATE TABLE knowledge_daily_stats (
  stat_date DATE PRIMARY KEY,
  total_cost NUMERIC(10,4) DEFAULT 0,
  avg_duration_ms INT DEFAULT 0,
  call_count INT DEFAULT 0,
  consumer_counts JSONB DEFAULT '{}',     -- {qa: 5, search: 3, ...}
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 1.4 account_sync_status
```sql
CREATE TABLE account_sync_status (
  account_id TEXT PRIMARY KEY,
  account_name TEXT,
  meta_ok BOOLEAN DEFAULT false,
  meta_last_date TEXT,
  meta_ad_count INT DEFAULT 0,
  mixpanel_ok BOOLEAN DEFAULT false,
  mixpanel_state TEXT DEFAULT 'not_configured',  -- ok, no_board, not_configured
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### RLS 정책 (4개 테이블 공통)
```sql
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON {table} FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read" ON {table} FOR SELECT TO authenticated USING (true);
```

## 2. API 설계

### 2.1 사전계산 실행 (크론 + 오케스트레이터)
`runPrecomputeAll()` 내에서 4개 모듈 순차 호출. 기존 Phase 1 패턴 동일.

### 2.2 기존 API 변경 (폴백 패턴)

#### getDashboardStats() — `src/actions/admin.ts`
```
1. dashboard_stats_cache에서 stat_key='counts' 조회
2. updated_at이 1시간 이내 → 캐시 반환
3. 없거나 오래됨 → 기존 COUNT 6개 실행 (현재 로직) + 캐시 갱신
```

#### getWeeklyQuestionStats() — `src/actions/admin.ts`
```
1. dashboard_stats_cache에서 stat_key='weekly_questions' 조회
2. updated_at이 1시간 이내 → 캐시 반환
3. 없거나 오래됨 → 기존 28일 조회 (현재 로직) + 캐시 갱신
```

#### GET /api/admin/email/analytics
```
1. email_campaign_stats 전체 조회 (order by sent_at desc)
2. 레코드 존재 + updated_at 24시간 이내 → 캐시 반환
3. 없으면 → 기존 email_sends 루프 (현재 로직)
```

#### GET /api/admin/knowledge/stats
```
1. knowledge_daily_stats에서 최근 14일 조회
2. usage 데이터는 기존과 동일 (클라이언트 차트용)
3. 일별 비용/consumer/duration 집계는 서버에서 사전계산
```

#### GET /api/admin/protractor/status
```
1. account_sync_status 전체 조회
2. 레코드 존재 + updated_at 1시간 이내 → 캐시 반환
3. 없으면 → 기존 daily_ad_insights 조회 (현재 로직)
```

## 3. 컴포넌트 구조

### 3.1 신규 모듈 (`src/lib/precompute/`)
```
src/lib/precompute/
├── index.ts                       — (기존) + 4개 모듈 호출 추가
├── dashboard-precompute.ts        — precomputeDashboardStats(supabase)
├── email-precompute.ts            — precomputeEmailCampaigns(supabase)
├── knowledge-precompute.ts        — precomputeKnowledgeStats(supabase)
└── sync-status-precompute.ts      — precomputeSyncStatus(supabase)
```

### 3.2 함수 시그니처

#### dashboard-precompute.ts
```typescript
export async function precomputeDashboardStats(supabase: SupabaseClient): Promise<{
  computed: number; errors: string[];
}>
```
- 로직: COUNT 6개 + 28일 질문 집계 → UPSERT dashboard_stats_cache

#### email-precompute.ts
```typescript
export async function precomputeEmailCampaigns(supabase: SupabaseClient): Promise<{
  computed: number; errors: string[];
}>
```
- 로직: email_sends 조회 → subject별 집계 → UPSERT email_campaign_stats

#### knowledge-precompute.ts
```typescript
export async function precomputeKnowledgeStats(supabase: SupabaseClient): Promise<{
  computed: number; errors: string[];
}>
```
- 로직: knowledge_usage 최근 30일 → 일별 비용/duration/consumer 집계 → UPSERT knowledge_daily_stats

#### sync-status-precompute.ts
```typescript
export async function precomputeSyncStatus(supabase: SupabaseClient): Promise<{
  computed: number; errors: string[];
}>
```
- 로직: ad_accounts + daily_ad_insights + mixpanel 상태 → UPSERT account_sync_status

## 4. 에러 처리
- Phase 1과 동일 패턴
- 개별 사전계산 실패 → console.error + 다음 모듈 계속
- API 폴백 시 캐시 조회 실패 → 기존 실시간 계산으로 자동 전환

## 5. 구현 순서
- [ ] 1. DB 마이그레이션 SQL 작성 (4개 테이블)
- [ ] 2. `dashboard-precompute.ts` 구현
- [ ] 3. `email-precompute.ts` 구현
- [ ] 4. `knowledge-precompute.ts` 구현
- [ ] 5. `sync-status-precompute.ts` 구현
- [ ] 6. `index.ts` 오케스트레이터에 4개 추가
- [ ] 7. `admin.ts` getDashboardStats/getWeeklyQuestionStats 폴백
- [ ] 8. `email/analytics/route.ts` 폴백
- [ ] 9. `knowledge/stats/route.ts` 폴백
- [ ] 10. `protractor/status/route.ts` 폴백
- [ ] 11. `database.ts` 타입 추가
- [ ] 12. tsc + lint + build 검증
