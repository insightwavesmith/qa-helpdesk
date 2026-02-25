-- T4: benchmarks 테이블 컬럼 추가
ALTER TABLE benchmarks ADD COLUMN IF NOT EXISTS creative_type text;
ALTER TABLE benchmarks ADD COLUMN IF NOT EXISTS source text DEFAULT 'all_accounts';
CREATE UNIQUE INDEX IF NOT EXISTS idx_benchmarks_metric_type_date
  ON benchmarks (metric_name, creative_type, date);
