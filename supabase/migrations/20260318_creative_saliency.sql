-- Creative Saliency: Layer 2 시선 예측 결과 저장

CREATE TABLE IF NOT EXISTS creative_saliency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id TEXT NOT NULL UNIQUE,
  account_id TEXT,
  target_type TEXT DEFAULT 'creative',
  attention_map_url TEXT,
  top_fixations JSONB,
  cta_attention_score FLOAT,
  cognitive_load TEXT,
  model_version TEXT DEFAULT 'deepgaze-iie',
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE creative_saliency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON creative_saliency
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read" ON creative_saliency
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_cs_ad_id ON creative_saliency(ad_id);
CREATE INDEX IF NOT EXISTS idx_cs_account_id ON creative_saliency(account_id);
