-- T3: search_vector (tsvector) 채우기 + 트리거 + GIN 인덱스

-- 1) 기존 + 신규 chunks의 search_vector 일괄 UPDATE
UPDATE knowledge_chunks
SET search_vector = to_tsvector('simple', content)
WHERE search_vector IS NULL;

-- 2) INSERT/UPDATE 트리거: 새 row의 search_vector 자동 생성
CREATE OR REPLACE FUNCTION knowledge_chunks_search_vector_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kc_search_vector ON knowledge_chunks;
CREATE TRIGGER trg_kc_search_vector
  BEFORE INSERT OR UPDATE OF content ON knowledge_chunks
  FOR EACH ROW
  EXECUTE FUNCTION knowledge_chunks_search_vector_trigger();

-- 3) GIN 인덱스
CREATE INDEX IF NOT EXISTS idx_kc_search_vector
  ON knowledge_chunks USING gin(search_vector);
