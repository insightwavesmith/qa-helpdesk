-- ============================================================
-- 사전계산 Phase 1: 3개 캐시 테이블 신설
-- ============================================================

-- 1. T3 점수 사전계산
CREATE TABLE IF NOT EXISTS t3_scores_precomputed (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL,
  period INTEGER NOT NULL,
  creative_type TEXT NOT NULL DEFAULT 'ALL',
  score FLOAT8,
  grade TEXT,
  grade_label TEXT,
  metrics_json JSONB,
  diagnostics_json JSONB,
  summary_json JSONB,
  data_available_days INTEGER,
  has_benchmark_data BOOLEAN DEFAULT true,
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (account_id, period, creative_type)
);

ALTER TABLE t3_scores_precomputed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on t3_scores_precomputed"
  ON t3_scores_precomputed FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read t3_scores_precomputed"
  ON t3_scores_precomputed FOR SELECT TO authenticated USING (true);

-- 2. 수강생 성과 사전계산
CREATE TABLE IF NOT EXISTS student_performance_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  period INTEGER NOT NULL DEFAULT 30,
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

ALTER TABLE student_performance_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on student_performance_daily"
  ON student_performance_daily FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read student_performance_daily"
  ON student_performance_daily FOR SELECT TO authenticated USING (true);

-- 3. 광고 진단 캐시
CREATE TABLE IF NOT EXISTS ad_diagnosis_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  ad_name TEXT,
  creative_type TEXT,
  overall_verdict TEXT,
  one_liner TEXT,
  parts_json JSONB,
  spend FLOAT8 DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (account_id, ad_id)
);

ALTER TABLE ad_diagnosis_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on ad_diagnosis_cache"
  ON ad_diagnosis_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read ad_diagnosis_cache"
  ON ad_diagnosis_cache FOR SELECT TO authenticated USING (true);
