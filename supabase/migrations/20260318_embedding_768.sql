-- Meta 소재 임베딩 아키텍처 Phase 1: 3072차원 유사도 전용 임베딩 + 클러스터
-- knowledge_chunks.embedding_v2와 동일한 3072차원으로 통일

-- 1. ad_creative_embeddings 확장 (유사도 분석 전용)
ALTER TABLE ad_creative_embeddings
  ADD COLUMN IF NOT EXISTS embedding_3072 vector(3072),
  ADD COLUMN IF NOT EXISTS text_embedding_3072 vector(3072),
  ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;

-- account_id 인덱스 (유사도 쿼리용)
CREATE INDEX IF NOT EXISTS idx_ace_account_id ON ad_creative_embeddings(account_id);

-- 참고: vector(3072)는 pgvector HNSW 인덱스 불가 (2000차원 제한)
-- 현재 352건 규모에서는 순차 스캔으로 충분

-- 2. creative_clusters 테이블
CREATE TABLE IF NOT EXISTS creative_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  cluster_label TEXT NOT NULL,
  centroid vector(3072),
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
