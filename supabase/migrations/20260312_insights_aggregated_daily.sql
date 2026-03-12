-- ============================================================
-- T2: insights_aggregated_daily 테이블 신설
-- daily_ad_insights를 계정+일자별로 사전집계
-- 5,000행 raw 쿼리 대신 30~90행 집계 데이터로 빠른 응답
-- ============================================================

CREATE TABLE IF NOT EXISTS insights_aggregated_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL,
  date DATE NOT NULL,
  -- 절대값 합산
  impressions BIGINT DEFAULT 0,
  reach BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  spend FLOAT8 DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  purchase_value FLOAT8 DEFAULT 0,
  -- 비율 지표 (해당 일자의 가중평균)
  ctr FLOAT8 DEFAULT 0,
  roas FLOAT8 DEFAULT 0,
  video_p3s_rate FLOAT8,
  thruplay_rate FLOAT8,
  retention_rate FLOAT8,
  reactions_per_10k FLOAT8,
  comments_per_10k FLOAT8,
  shares_per_10k FLOAT8,
  saves_per_10k FLOAT8,
  engagement_per_10k FLOAT8,
  click_to_purchase_rate FLOAT8,
  click_to_checkout_rate FLOAT8,
  checkout_to_purchase_rate FLOAT8,
  reach_to_purchase_rate FLOAT8,
  -- 메타데이터
  ad_count INTEGER DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (account_id, date)
);

ALTER TABLE insights_aggregated_daily ENABLE ROW LEVEL SECURITY;

-- service_role: full access (cron 사전계산 + API 조회)
CREATE POLICY "Service role full access on insights_aggregated_daily"
  ON insights_aggregated_daily FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated: read only
CREATE POLICY "Authenticated read insights_aggregated_daily"
  ON insights_aggregated_daily FOR SELECT TO authenticated USING (true);

-- 계정+날짜 범위 조회 최적화 인덱스
CREATE INDEX idx_iad_account_date ON insights_aggregated_daily(account_id, date);
