-- LP 구조 분석 테이블
CREATE TABLE IF NOT EXISTS lp_structure_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_url TEXT NOT NULL,
  viewport TEXT DEFAULT 'mobile',
  hero_type TEXT,
  price_position TEXT,
  discount_highlight BOOLEAN,
  review_position_pct FLOAT,
  review_type TEXT,
  review_density TEXT,
  review_count INTEGER,
  cta_type TEXT,
  social_proof JSONB,
  page_length TEXT,
  trust_badges TEXT[],
  option_types TEXT[],
  cross_sell BOOLEAN,
  easy_pay TEXT[],
  urgency_stock BOOLEAN,
  urgency_timedeal BOOLEAN,
  touches_to_checkout INTEGER,
  raw_analysis JSONB,
  model_version TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE lp_structure_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON lp_structure_analysis
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read" ON lp_structure_analysis
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_lsa_lp_url ON lp_structure_analysis(lp_url);

-- 소재-LP 일관성 점수 테이블
CREATE TABLE IF NOT EXISTS creative_lp_consistency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id TEXT NOT NULL,
  lp_url TEXT,
  visual_score FLOAT,
  video_score FLOAT,
  semantic_score FLOAT,
  cross_vt_score FLOAT,
  cross_tv_score FLOAT,
  holistic_score FLOAT,
  total_score FLOAT,
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE creative_lp_consistency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON creative_lp_consistency
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read" ON creative_lp_consistency
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_clc_ad_id ON creative_lp_consistency(ad_id);
