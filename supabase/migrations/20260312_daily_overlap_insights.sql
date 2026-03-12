-- ============================================================
-- T1: daily_overlap_insights 테이블 신설
-- overlap API가 이미 참조 중 (route.ts line 67)
-- cron 사전계산으로 사용자 요청 시 캐시 즉시 반환
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_overlap_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL,
  date DATE NOT NULL,
  overall_rate FLOAT8 DEFAULT 0,
  total_unique_reach BIGINT DEFAULT 0,
  individual_sum BIGINT DEFAULT 0,
  pairs JSONB DEFAULT '[]'::jsonb,
  collected_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (account_id, date)
);

ALTER TABLE daily_overlap_insights ENABLE ROW LEVEL SECURITY;

-- service_role: full access (cron 사전계산 + API 조회)
CREATE POLICY "Service role full access on daily_overlap_insights"
  ON daily_overlap_insights FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated: read only (API에서 createServiceClient 사용하지만 안전장치)
CREATE POLICY "Authenticated read daily_overlap_insights"
  ON daily_overlap_insights FOR SELECT TO authenticated USING (true);

-- 계정+날짜 조회 최적화 인덱스
CREATE INDEX idx_doi_account_date ON daily_overlap_insights(account_id, date DESC);
