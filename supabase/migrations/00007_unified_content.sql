-- 00007: Unified Content - posts -> contents 통합 마이그레이션
-- contents 테이블 확장 + posts 데이터 이관
-- 실행: Supabase Dashboard SQL Editor에서 실행

-- ============================================
-- 1. contents 테이블 확장 컬럼 추가
-- ============================================

-- 이메일 관련 필드
ALTER TABLE contents ADD COLUMN IF NOT EXISTS email_summary TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS email_subject TEXT;

-- 미디어 필드
ALTER TABLE contents ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS video_url TEXT;

-- 게시글 기능 필드
ALTER TABLE contents ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0;

-- 타임스탬프 필드
ALTER TABLE contents ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

-- AI 출처 필드
ALTER TABLE contents ADD COLUMN IF NOT EXISTS ai_source TEXT;

-- ============================================
-- 2. posts 데이터를 contents로 이관
-- ============================================
INSERT INTO contents (
  title, body_md, summary, category, status,
  is_pinned, view_count, like_count,
  published_at, created_at, updated_at
)
SELECT
  p.title,
  p.content,
  LEFT(p.content, 200),
  CASE p.category
    WHEN 'info' THEN 'education'
    WHEN 'notice' THEN 'news'
    WHEN 'webinar' THEN 'case_study'
    ELSE 'education'
  END,
  'published',
  p.is_pinned,
  p.view_count,
  p.like_count,
  p.published_at,
  p.created_at,
  p.updated_at
FROM posts p
WHERE p.is_published = true
ON CONFLICT DO NOTHING;

-- ============================================
-- 3. category CHECK 제약조건 업데이트
--    case_study 추가 (하이픈 없는 버전)
-- ============================================
ALTER TABLE contents DROP CONSTRAINT IF EXISTS contents_category_check;
ALTER TABLE contents ADD CONSTRAINT contents_category_check
  CHECK (category IN ('education', 'news', 'case-study', 'case_study', 'webinar', 'recruitment'));

-- ============================================
-- 4. 인덱스 추가
-- ============================================
CREATE INDEX IF NOT EXISTS idx_contents_published_at ON contents(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_contents_is_pinned ON contents(is_pinned);
