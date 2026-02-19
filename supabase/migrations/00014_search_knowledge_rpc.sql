-- P0-2: search_knowledge RPC + match_lecture_chunks 래퍼
-- 5-Tier 가중 점수 검색 + SECURITY DEFINER + 하위호환

-- ============================================
-- search_knowledge: 5-Tier 가중 벡터 검색
-- ============================================
CREATE OR REPLACE FUNCTION search_knowledge(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  filter_source_types text[] DEFAULT NULL
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
    (1 - (kc.embedding <=> query_embedding))::float AS similarity,
    (CASE kc.priority
      WHEN 1 THEN 0.15
      WHEN 2 THEN 0.10
      WHEN 3 THEN 0.05
      WHEN 4 THEN 0.03
      WHEN 5 THEN 0.00
      ELSE 0.00
    END)::float AS tier_boost,
    ((1 - (kc.embedding <=> query_embedding)) +
      CASE kc.priority
        WHEN 1 THEN 0.15
        WHEN 2 THEN 0.10
        WHEN 3 THEN 0.05
        WHEN 4 THEN 0.03
        WHEN 5 THEN 0.00
        ELSE 0.00
      END)::float AS final_score,
    kc.topic_tags,
    kc.source_ref,
    kc.image_url,
    kc.metadata
  FROM knowledge_chunks kc
  WHERE kc.embedding IS NOT NULL
    AND (1 - (kc.embedding <=> query_embedding)) > match_threshold
    AND (filter_source_types IS NULL OR kc.source_type = ANY(filter_source_types))
  ORDER BY final_score DESC
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION search_knowledge TO authenticated;
GRANT EXECUTE ON FUNCTION search_knowledge TO service_role;

-- ============================================
-- match_lecture_chunks: 하위호환 래퍼
-- 기존 3-param 시그니처 유지, search_knowledge 내부 호출
-- ============================================
CREATE OR REPLACE FUNCTION match_lecture_chunks(
  query_embedding vector(768),
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
  FROM search_knowledge(query_embedding, match_threshold, match_count) sk;
END;
$$;
