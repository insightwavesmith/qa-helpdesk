-- P0-3: HNSW 인덱스 (knowledge_chunks 벡터 검색 최적화)
-- 996행 규모이므로 일반 CREATE INDEX 사용 (CONCURRENTLY 불필요)
-- 대규모(10K+) 전환 시 Supabase Dashboard에서 CONCURRENTLY로 재생성 권장

CREATE INDEX IF NOT EXISTS idx_kc_embedding_hnsw
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);
