-- 00009: 콘텐츠 소스 관리 테이블
-- 크롤링 대상 URL 목록 관리 (외부 콘텐츠 파이프라인 FR-01)
-- 실행: Supabase Dashboard SQL Editor

-- ============================================
-- 1. content_sources 테이블 생성
-- ============================================
CREATE TABLE IF NOT EXISTS content_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  feed_type TEXT NOT NULL DEFAULT 'rss',
  is_active BOOLEAN DEFAULT TRUE,
  last_crawled_at TIMESTAMPTZ,
  crawl_frequency TEXT DEFAULT 'daily',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. 제약조건
-- ============================================
ALTER TABLE content_sources ADD CONSTRAINT content_sources_feed_type_check
  CHECK (feed_type IN ('rss', 'html', 'api'));

ALTER TABLE content_sources ADD CONSTRAINT content_sources_crawl_frequency_check
  CHECK (crawl_frequency IN ('daily', 'weekly'));

-- ============================================
-- 3. 인덱스
-- ============================================
CREATE INDEX IF NOT EXISTS idx_content_sources_is_active ON content_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_content_sources_feed_type ON content_sources(feed_type);

-- ============================================
-- 4. RLS 정책 (admin만 CRUD)
-- ============================================
ALTER TABLE content_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on content_sources"
  ON content_sources FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================
-- 5. updated_at 자동 갱신 트리거
-- ============================================
CREATE OR REPLACE FUNCTION update_content_sources_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_content_sources_updated_at
  BEFORE UPDATE ON content_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_content_sources_updated_at();
