-- Phase 2 보안 수정 + 벡터 임베딩
-- C-3: SECURITY DEFINER search_path 추가
-- M-1: RLS 정책 수정 (USING(true) → is_admin())
-- 벡터: contents embedding 컬럼 + match_contents 함수

-- ============================================
-- C-3: SECURITY DEFINER 함수에 search_path 추가
-- ============================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_approved_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('approved', 'admin')
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- ============================================
-- M-1: RLS 정책 수정 — USING(true) → is_admin()
-- ============================================

-- contents
DROP POLICY IF EXISTS "Service role full access" ON contents;
CREATE POLICY "Admins can manage contents" ON contents FOR ALL USING (is_admin());

-- distributions
DROP POLICY IF EXISTS "Service role full access" ON distributions;
CREATE POLICY "Admins can manage distributions" ON distributions FOR ALL USING (is_admin());

-- email_logs
DROP POLICY IF EXISTS "Service role full access" ON email_logs;
CREATE POLICY "Admins can manage email_logs" ON email_logs FOR ALL USING (is_admin());

-- ============================================
-- 벡터: contents 테이블에 embedding 컬럼 추가
-- ============================================
ALTER TABLE contents ADD COLUMN IF NOT EXISTS embedding VECTOR(768);

-- 벡터 검색 인덱스
CREATE INDEX IF NOT EXISTS idx_contents_embedding ON contents
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- 벡터 검색 함수
CREATE OR REPLACE FUNCTION match_contents(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  body_md TEXT,
  summary TEXT,
  category TEXT,
  tags TEXT[],
  status TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.title,
    c.body_md,
    c.summary,
    c.category,
    c.tags,
    c.status,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM contents c
  WHERE c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_contents TO authenticated;
GRANT EXECUTE ON FUNCTION match_contents TO service_role;
