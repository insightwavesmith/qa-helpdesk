-- T6: 소재 유사도 검색 RPC
-- 쿼리 임베딩과 가장 유사한 소재를 반환
-- SECURITY DEFINER + SET search_path = public

CREATE OR REPLACE FUNCTION search_similar_creatives(
  query_embedding vector(3072),
  match_count int DEFAULT 10,
  filter_source text DEFAULT NULL,
  filter_category text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  ad_id text,
  brand_name text,
  source text,
  media_url text,
  ad_copy text,
  lp_url text,
  creative_type text,
  roas float,
  ctr float,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ace.id,
    ace.ad_id,
    ace.brand_name,
    ace.source,
    ace.media_url,
    ace.ad_copy,
    ace.lp_url,
    ace.creative_type,
    ace.roas,
    ace.ctr,
    1 - (ace.embedding <=> query_embedding) AS similarity
  FROM ad_creative_embeddings ace
  WHERE ace.embedding IS NOT NULL
    AND ace.is_active = true
    AND (filter_source IS NULL OR ace.source = filter_source)
    AND (filter_category IS NULL OR ace.category = filter_category)
  ORDER BY ace.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
