-- T3: CRAG + Adaptive RAG — DB 변경

-- 1. knowledge_chunks에 full-text search 인덱스 추가 (BM25 용)
ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS content_tsv TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tsv
  ON public.knowledge_chunks USING GIN (content_tsv);

-- 2. BM25 검색용 RPC 함수
CREATE OR REPLACE FUNCTION search_knowledge_bm25(
  query_text TEXT,
  match_count INT DEFAULT 10,
  filter_source_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  lecture_name TEXT,
  week TEXT,
  chunk_index INT,
  content TEXT,
  source_type TEXT,
  priority INT,
  image_url TEXT,
  metadata JSONB,
  text_score FLOAT
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.lecture_name,
    kc.week,
    kc.chunk_index,
    kc.content,
    kc.source_type,
    kc.priority,
    kc.image_url,
    kc.metadata,
    ts_rank(kc.content_tsv, plainto_tsquery('simple', query_text))::FLOAT AS text_score
  FROM knowledge_chunks kc
  WHERE
    kc.content_tsv @@ plainto_tsquery('simple', query_text)
    AND (filter_source_types IS NULL OR kc.source_type = ANY(filter_source_types))
  ORDER BY text_score DESC
  LIMIT match_count;
END;
$$;

-- 3. knowledge_usage 테이블에 CRAG 로깅 컬럼 추가
ALTER TABLE public.knowledge_usage
  ADD COLUMN IF NOT EXISTS domain_analysis JSONB,
  ADD COLUMN IF NOT EXISTS relevance_grade TEXT,
  ADD COLUMN IF NOT EXISTS web_search_used BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS web_search_results_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS question_type TEXT,
  ADD COLUMN IF NOT EXISTS complexity TEXT,
  ADD COLUMN IF NOT EXISTS pipeline_stages TEXT[];
