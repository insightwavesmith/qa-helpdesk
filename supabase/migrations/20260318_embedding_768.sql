-- Meta 소재 임베딩 아키텍처 Phase 1: 768차원 임베딩 + 클러스터
-- 768차원 = pgvector HNSW 인덱스 가능 (2000차원 제한 내)

-- 1. ad_creative_embeddings 확장
ALTER TABLE ad_creative_embeddings
  ADD COLUMN IF NOT EXISTS embedding_768 vector(768),
  ADD COLUMN IF NOT EXISTS text_embedding_768 vector(768),
  ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;

-- 2. 768차원 HNSW 인덱스
CREATE INDEX IF NOT EXISTS idx_ace_embedding_768_hnsw
  ON ad_creative_embeddings USING hnsw (embedding_768 vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_ace_text_embedding_768_hnsw
  ON ad_creative_embeddings USING hnsw (text_embedding_768 vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- account_id 인덱스 (유사도 쿼리용)
CREATE INDEX IF NOT EXISTS idx_ace_account_id ON ad_creative_embeddings(account_id);

-- 3. creative_clusters 테이블
CREATE TABLE IF NOT EXISTS creative_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  cluster_label TEXT NOT NULL,
  centroid vector(768),
  member_count INTEGER DEFAULT 0,
  member_ad_ids TEXT[] DEFAULT '{}',
  avg_roas FLOAT,
  avg_ctr FLOAT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE creative_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON creative_clusters
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read" ON creative_clusters
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_cc_account_id ON creative_clusters(account_id);
