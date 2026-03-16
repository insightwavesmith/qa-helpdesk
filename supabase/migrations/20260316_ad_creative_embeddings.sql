-- Phase 2 준비: ad_creative_embeddings 테이블
-- 소재·LP 임베딩 저장용

CREATE TABLE IF NOT EXISTS ad_creative_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  brand_id UUID,
  brand_name TEXT,
  account_id TEXT,
  category TEXT,
  cohort TEXT,
  ad_id TEXT UNIQUE,
  media_url TEXT,
  media_type TEXT,
  ad_copy TEXT,
  creative_type TEXT,
  embedding VECTOR(3072),
  text_embedding VECTOR(3072),
  lp_url TEXT,
  lp_screenshot_url TEXT,
  lp_cta_screenshot_url TEXT,
  lp_headline TEXT,
  lp_price TEXT,
  lp_embedding VECTOR(3072),
  lp_text_embedding VECTOR(3072),
  lp_cta_embedding VECTOR(3072),
  roas FLOAT,
  ctr FLOAT,
  click_to_purchase_rate FLOAT,
  roas_percentile FLOAT,
  quality_ranking TEXT,
  is_active BOOLEAN DEFAULT true,
  duration_days INT,
  lp_hash TEXT,
  media_hash TEXT,
  embedding_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  lp_crawled_at TIMESTAMPTZ
);

-- RLS 활성화
ALTER TABLE ad_creative_embeddings ENABLE ROW LEVEL SECURITY;

-- service_role만 접근 가능
CREATE POLICY "service_role_all" ON ad_creative_embeddings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 인증 사용자 읽기 전용
CREATE POLICY "authenticated_read" ON ad_creative_embeddings
  FOR SELECT TO authenticated USING (true);

-- B-tree 인덱스
CREATE INDEX IF NOT EXISTS idx_ace_source ON ad_creative_embeddings(source);
CREATE INDEX IF NOT EXISTS idx_ace_brand ON ad_creative_embeddings(brand_id);
CREATE INDEX IF NOT EXISTS idx_ace_category ON ad_creative_embeddings(category);
CREATE INDEX IF NOT EXISTS idx_ace_ad_id ON ad_creative_embeddings(ad_id);

-- HNSW는 핵심 2개만 (메모리 제한)
CREATE INDEX IF NOT EXISTS idx_ace_embedding_hnsw ON ad_creative_embeddings
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_ace_lp_embedding_hnsw ON ad_creative_embeddings
  USING hnsw (lp_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
