# 사전계산 Phase 1 설계서

## 1. 데이터 모델

### 1.1 t3_scores_precomputed
```sql
CREATE TABLE t3_scores_precomputed (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL,
  period INTEGER NOT NULL,           -- 7, 30, 90
  creative_type TEXT NOT NULL,        -- ALL, VIDEO, IMAGE, CATALOG
  score FLOAT8,
  grade TEXT,                         -- A, B, C, D, F
  grade_label TEXT,                   -- 우수, 양호, 보통, 미흡, 부족
  metrics_json JSONB,                 -- MetricResult[] (pctOfBenchmark 포함)
  diagnostics_json JSONB,             -- T3PartResult (safeDiagnostics)
  summary_json JSONB,                 -- {spend, impressions, reach, clicks, purchases, purchaseValue, roas, adCount}
  data_available_days INTEGER,
  has_benchmark_data BOOLEAN DEFAULT true,
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (account_id, period, creative_type)
);
```

### 1.2 student_performance_daily
```sql
CREATE TABLE student_performance_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,           -- profiles.id
  period INTEGER NOT NULL,            -- 30 (기본)
  cohort TEXT,
  name TEXT,
  email TEXT,
  spend FLOAT8 DEFAULT 0,
  revenue FLOAT8 DEFAULT 0,
  roas FLOAT8 DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  t3_score FLOAT8,
  t3_grade TEXT,
  mixpanel_revenue FLOAT8 DEFAULT 0,
  mixpanel_purchases INTEGER DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, period)
);
```

### 1.3 ad_diagnosis_cache
```sql
CREATE TABLE ad_diagnosis_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  ad_name TEXT,
  creative_type TEXT,
  overall_verdict TEXT,               -- GOOD, NORMAL, POOR
  one_liner TEXT,
  parts_json JSONB,                   -- DiagnosisPart[]
  spend FLOAT8 DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (account_id, ad_id)
);
```

### RLS 정책 (3개 테이블 공통)
```sql
-- service_role: 읽기/쓰기
CREATE POLICY "Service role full access" ON {table} FOR ALL TO service_role USING (true) WITH CHECK (true);
-- authenticated: 읽기만
CREATE POLICY "Authenticated read" ON {table} FOR SELECT TO authenticated USING (true);
```

## 2. API 설계

### 2.1 사전계산 실행 (크론 내부)
collect-daily 크론 완료 후 `runPrecomputeAll()` 호출.
- 별도 API 엔드포인트 없음 (크론 파이프라인 내부 함수)
- 사전계산 실패해도 크론 결과에는 영향 없음 (try-catch)

### 2.2 기존 API 변경 (폴백 패턴)
```
GET /api/protractor/total-value?account_id=X&period=30
  → 1. t3_scores_precomputed에서 (account_id, period, creative_type=ALL) 조회
  → 2. 있고 computed_at이 24시간 이내면 → 캐시 반환
  → 3. 없으면 → 기존 실시간 계산 (현재 코드 그대로)

GET /api/diagnose?account_id=X
  → 1. ad_diagnosis_cache에서 account_id 조회 (spend DESC, limit 5)
  → 2. 있고 computed_at이 24시간 이내면 → 캐시 반환
  → 3. 없으면 → 기존 실시간 진단 (현재 코드 그대로)

getStudentPerformance(cohort, period)
  → 1. student_performance_daily에서 period 조회
  → 2. 있고 computed_at이 24시간 이내면 → 캐시 반환
  → 3. 없으면 → 기존 실시간 계산 (현재 코드 그대로)
```

## 3. 컴포넌트 구조

### 3.1 신규 모듈 (`src/lib/precompute/`)
```
src/lib/precompute/
├── index.ts                   — runPrecomputeAll(supabase) 오케스트레이터
├── t3-precompute.ts           — precomputeT3Scores(supabase)
├── performance-precompute.ts  — precomputeStudentPerformance(supabase)
└── diagnosis-precompute.ts    — precomputeDiagnosis(supabase)
```

### 3.2 함수 시그니처

#### t3-precompute.ts
```typescript
export async function precomputeT3Scores(supabase: SupabaseClient): Promise<{
  computed: number; errors: string[];
}>
```
- 로직: ad_accounts(active=true) 순회 → 기간별(7,30,90) → computeMetricValues + fetchBenchmarks + calculateT3Score → UPSERT

#### performance-precompute.ts
```typescript
export async function precomputeStudentPerformance(supabase: SupabaseClient): Promise<{
  computed: number; errors: string[];
}>
```
- 로직: 기존 getStudentPerformance()와 동일한 계산을 수행하되, 결과를 student_performance_daily에 UPSERT

#### diagnosis-precompute.ts
```typescript
export async function precomputeDiagnosis(supabase: SupabaseClient): Promise<{
  computed: number; errors: string[];
}>
```
- 로직: ad_accounts 순회 → 기존 diagnose route와 동일한 계산 → ad_diagnosis_cache에 UPSERT

#### index.ts
```typescript
export async function runPrecomputeAll(supabase: SupabaseClient): Promise<{
  t3: { computed: number; errors: string[] };
  performance: { computed: number; errors: string[] };
  diagnosis: { computed: number; errors: string[] };
}>
```

## 4. 에러 처리
- 사전계산 실패 → console.error 로깅, 크론 결과에 precompute_errors 필드 추가
- 개별 계정 실패 → 해당 계정 건너뛰고 다음 계정 계속
- API 폴백 시 캐시 조회 실패 → 기존 실시간 계산으로 자동 전환

## 5. 구현 순서
- [x] 1. DB 마이그레이션 SQL 작성
- [x] 2. `src/lib/precompute/t3-precompute.ts` 구현
- [x] 3. `src/lib/precompute/performance-precompute.ts` 구현
- [x] 4. `src/lib/precompute/diagnosis-precompute.ts` 구현
- [x] 5. `src/lib/precompute/index.ts` 오케스트레이터
- [x] 6. `collect-daily/route.ts`에 runPrecomputeAll 호출 추가
- [x] 7. `total-value/route.ts` 폴백 로직 추가
- [x] 8. `performance.ts` 폴백 로직 추가
- [x] 9. `diagnose/route.ts` 폴백 로직 추가
- [x] 10. `database.ts` 타입 추가
- [x] 11. tsc + lint + build 검증
