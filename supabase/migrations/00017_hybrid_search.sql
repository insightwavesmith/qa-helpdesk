-- T4: Hybrid Search — search_knowledge RPC 교체
-- vector_score + text_score + tier_boost (ADR-6: α=0.6)
-- query_text DEFAULT NULL → NULL이면 기존 vector-only (하위호환)
-- F-R1 반영: text_score를 0~1로 정규화 (least로 cap)

-- 기존 4-param 시그니처 삭제 (5-param으로 교체하므로 DROP 필수)
DROP FUNCTION IF EXISTS search_knowledge(vector(768), float, int, text[]);

CREATE OR REPLACE FUNCTION search_knowledge(
  query_embedding vector(768),
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
    -- vector_score: 0~1
    (1 - (kc.embedding <=> query_embedding))::float AS similarity,
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
        -- hybrid: α*vector + (1-α)*text + boost
        -- F-R1: text_score를 least()로 1.0 cap하여 범위 균형
        0.6 * (1 - (kc.embedding <=> query_embedding))
        + 0.4 * least(ts_rank_cd(kc.search_vector, plainto_tsquery('simple', query_text)), 1.0)
        + CASE kc.priority
            WHEN 1 THEN 0.15 WHEN 2 THEN 0.10 WHEN 3 THEN 0.05
            WHEN 4 THEN 0.03 WHEN 5 THEN 0.00 ELSE 0.00
          END
      ELSE
        -- vector-only (하위호환)
        (1 - (kc.embedding <=> query_embedding))
        + CASE kc.priority
            WHEN 1 THEN 0.15 WHEN 2 THEN 0.10 WHEN 3 THEN 0.05
            WHEN 4 THEN 0.03 WHEN 5 THEN 0.00 ELSE 0.00
          END
    END)::float AS final_score,
    -- text_score (NULL if vector-only)
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
  WHERE kc.embedding IS NOT NULL
    AND (1 - (kc.embedding <=> query_embedding)) > match_threshold
    AND (filter_source_types IS NULL OR kc.source_type = ANY(filter_source_types))
  ORDER BY final_score DESC
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION search_knowledge TO authenticated;
GRANT EXECUTE ON FUNCTION search_knowledge TO service_role;
