-- Phase 1: 임베딩 엔진 교체 — 이중 컬럼 전략
-- gemini-embedding-001 (768) → gemini-embedding-2-preview (3072)
-- 무중단 전환: 기존 embedding(768) 유지 + embedding_v2(3072) 병행

-- 1. 새 컬럼 추가
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding_v2 vector(3072);
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding_model_v2 text;

-- 2. 새 HNSW 인덱스 (v2 컬럼용)
CREATE INDEX IF NOT EXISTS idx_kc_embedding_v2_hnsw
  ON knowledge_chunks USING hnsw (embedding_v2 vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 3. search_knowledge RPC 교체 (이중 벡터 지원)
-- 기존 5-param 시그니처 삭제
DROP FUNCTION IF EXISTS search_knowledge(vector(768), float, int, text[], text);
-- 기존 4-param 시그니처도 삭제
DROP FUNCTION IF EXISTS search_knowledge(vector(768), float, int, text[]);

CREATE OR REPLACE FUNCTION search_knowledge(
  query_embedding_v2 vector(3072) DEFAULT NULL,
  query_embedding_v1 vector(768) DEFAULT NULL,
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  filter_source_types text[] DEFAULT NULL,
  query_text text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  lecture_name text,
  week text,
  chunk_index int,
  source_type text,
  priority int,
  similarity float,
  tier_boost float,
  final_score float,
  text_score float,
  topic_tags text[],
  source_ref text,
  image_url text,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.content,
    kc.lecture_name,
    kc.week,
    kc.chunk_index,
    kc.source_type,
    kc.priority,
    -- similarity: v2 우선, 없으면 v1 폴백
    (CASE
      WHEN kc.embedding_v2 IS NOT NULL AND query_embedding_v2 IS NOT NULL THEN
        (1 - (kc.embedding_v2 <=> query_embedding_v2))
      WHEN kc.embedding IS NOT NULL AND query_embedding_v1 IS NOT NULL THEN
        (1 - (kc.embedding <=> query_embedding_v1))
      ELSE 0
    END)::float AS similarity,
    -- tier_boost
    (CASE kc.priority
      WHEN 1 THEN 0.15
      WHEN 2 THEN 0.10
      WHEN 3 THEN 0.05
      WHEN 4 THEN 0.03
      WHEN 5 THEN 0.00
      ELSE 0.00
    END)::float AS tier_boost,
    -- final_score: hybrid or vector-only
    (CASE
      WHEN query_text IS NOT NULL AND kc.search_vector IS NOT NULL THEN
        0.6 * (CASE
          WHEN kc.embedding_v2 IS NOT NULL AND query_embedding_v2 IS NOT NULL THEN
            (1 - (kc.embedding_v2 <=> query_embedding_v2))
          WHEN kc.embedding IS NOT NULL AND query_embedding_v1 IS NOT NULL THEN
            (1 - (kc.embedding <=> query_embedding_v1))
          ELSE 0
        END)
        + 0.4 * least(ts_rank_cd(kc.search_vector, plainto_tsquery('simple', query_text)), 1.0)
        + CASE kc.priority
            WHEN 1 THEN 0.15 WHEN 2 THEN 0.10 WHEN 3 THEN 0.05
            WHEN 4 THEN 0.03 WHEN 5 THEN 0.00 ELSE 0.00
          END
      ELSE
        (CASE
          WHEN kc.embedding_v2 IS NOT NULL AND query_embedding_v2 IS NOT NULL THEN
            (1 - (kc.embedding_v2 <=> query_embedding_v2))
          WHEN kc.embedding IS NOT NULL AND query_embedding_v1 IS NOT NULL THEN
            (1 - (kc.embedding <=> query_embedding_v1))
          ELSE 0
        END)
        + CASE kc.priority
            WHEN 1 THEN 0.15 WHEN 2 THEN 0.10 WHEN 3 THEN 0.05
            WHEN 4 THEN 0.03 WHEN 5 THEN 0.00 ELSE 0.00
          END
    END)::float AS final_score,
    -- text_score
    (CASE
      WHEN query_text IS NOT NULL AND kc.search_vector IS NOT NULL THEN
        least(ts_rank_cd(kc.search_vector, plainto_tsquery('simple', query_text)), 1.0)
      ELSE 0.0
    END)::float AS text_score,
    kc.topic_tags,
    kc.source_ref,
    kc.image_url,
    kc.metadata
  FROM knowledge_chunks kc
  WHERE
    -- 최소한 하나의 임베딩이 있어야 함
    (
      (kc.embedding_v2 IS NOT NULL AND query_embedding_v2 IS NOT NULL)
      OR (kc.embedding IS NOT NULL AND query_embedding_v1 IS NOT NULL)
    )
    -- threshold 필터
    AND (CASE
      WHEN kc.embedding_v2 IS NOT NULL AND query_embedding_v2 IS NOT NULL THEN
        (1 - (kc.embedding_v2 <=> query_embedding_v2))
      WHEN kc.embedding IS NOT NULL AND query_embedding_v1 IS NOT NULL THEN
        (1 - (kc.embedding <=> query_embedding_v1))
      ELSE 0
    END) > match_threshold
    -- source_type 필터
    AND (filter_source_types IS NULL OR kc.source_type = ANY(filter_source_types))
  ORDER BY final_score DESC
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION search_knowledge TO authenticated;
GRANT EXECUTE ON FUNCTION search_knowledge TO service_role;

-- 4. match_lecture_chunks 래퍼 업데이트
DROP FUNCTION IF EXISTS match_lecture_chunks(vector(768), float, int);

CREATE OR REPLACE FUNCTION match_lecture_chunks(
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  lecture_name text,
  week text,
  chunk_index int,
  content text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sk.id,
    sk.lecture_name,
    sk.week,
    sk.chunk_index,
    sk.content,
    sk.similarity
  FROM search_knowledge(
    query_embedding_v2 := query_embedding,
    match_threshold := match_threshold,
    match_count := match_count
  ) sk;
END;
$$;

GRANT EXECUTE ON FUNCTION match_lecture_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION match_lecture_chunks TO service_role;
