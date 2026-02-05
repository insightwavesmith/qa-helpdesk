-- 벡터 유사도 검색 함수 (RAG용)
-- Created: 2026-02-05

-- lecture_chunks에서 유사한 청크 검색
CREATE OR REPLACE FUNCTION match_lecture_chunks(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  lecture_name TEXT,
  week TEXT,
  chunk_index INT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lc.id,
    lc.lecture_name,
    lc.week,
    lc.chunk_index,
    lc.content,
    1 - (lc.embedding <=> query_embedding) AS similarity
  FROM lecture_chunks lc
  WHERE lc.embedding IS NOT NULL
    AND 1 - (lc.embedding <=> query_embedding) > match_threshold
  ORDER BY lc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 권한 설정
GRANT EXECUTE ON FUNCTION match_lecture_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION match_lecture_chunks TO service_role;
