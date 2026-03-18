-- Creative Intelligence: 5 Layer 소재+LP 통합 분석
-- Layer 1: creative_element_analysis
-- Layer 3: creative_element_performance
-- Layer 4: creative_intelligence_scores

-- 1. 소재 요소 태깅 결과
CREATE TABLE IF NOT EXISTS creative_element_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id TEXT NOT NULL UNIQUE,
  account_id TEXT,
  format TEXT,
  hook_type TEXT,
  hook_text TEXT,
  product_position TEXT,
  product_size_pct FLOAT,
  human_presence BOOLEAN,
  text_overlay_ratio FLOAT,
  dominant_color TEXT,
  color_tone TEXT,
  color_contrast TEXT,
  style TEXT,
  social_proof_types TEXT[],
  cta_type TEXT,
  cta_position TEXT,
  cta_color TEXT,
  video_scenes JSONB,
  video_pacing TEXT,
  has_bgm BOOLEAN,
  has_narration BOOLEAN,
  raw_analysis JSONB,
  model_version TEXT DEFAULT 'gemini-2.0-pro',
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE creative_element_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON creative_element_analysis
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read" ON creative_element_analysis
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_cea_ad_id ON creative_element_analysis(ad_id);
CREATE INDEX IF NOT EXISTS idx_cea_account_id ON creative_element_analysis(account_id);

-- 2. 요소별 성과 통계 (벤치마크)
CREATE TABLE IF NOT EXISTS creative_element_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  element_type TEXT NOT NULL,
  element_value TEXT NOT NULL,
  sample_count INTEGER,
  avg_roas FLOAT,
  avg_ctr FLOAT,
  avg_conversion_rate FLOAT,
  p75_roas FLOAT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(element_type, element_value)
);

ALTER TABLE creative_element_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON creative_element_performance
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read" ON creative_element_performance
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_cep_type ON creative_element_performance(element_type);

-- 3. 소재 종합 점수 + 제안
CREATE TABLE IF NOT EXISTS creative_intelligence_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id TEXT NOT NULL UNIQUE,
  account_id TEXT,
  overall_score FLOAT,
  visual_impact_score FLOAT,
  message_clarity_score FLOAT,
  cta_effectiveness_score FLOAT,
  social_proof_score FLOAT,
  lp_consistency_score FLOAT,
  suggestions JSONB,
  benchmark_comparison JSONB,
  model_version TEXT DEFAULT 'gemini-2.0-pro',
  scored_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE creative_intelligence_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON creative_intelligence_scores
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read" ON creative_intelligence_scores
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_cis_ad_id ON creative_intelligence_scores(ad_id);
CREATE INDEX IF NOT EXISTS idx_cis_account_id ON creative_intelligence_scores(account_id);

-- 4. lp_structure_analysis 확장
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS dominant_color TEXT;
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS color_palette TEXT[];
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS color_tone TEXT;
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS gif_count INTEGER DEFAULT 0;
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS gif_positions TEXT[];
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS video_count INTEGER DEFAULT 0;
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS video_autoplay BOOLEAN;
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS text_density_pct FLOAT;
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS photo_review_ratio FLOAT;
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS video_review_count INTEGER DEFAULT 0;

-- 5. ad_creative_embeddings에 video_analysis 컬럼 (Phase 2 전환에서 필요)
ALTER TABLE ad_creative_embeddings ADD COLUMN IF NOT EXISTS video_analysis JSONB;
