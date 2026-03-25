-- organic_posts Phase 2 컬럼 추가
-- 원본 연결, AI 변환 상태, 예약 발행, 이미지, 지역화 마크업, 해시태그

ALTER TABLE organic_posts
  ADD COLUMN IF NOT EXISTS original_content_id uuid REFERENCES contents(id),
  ADD COLUMN IF NOT EXISTS is_source boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_transform_status text CHECK (ai_transform_status IN ('pending', 'processing', 'done', 'failed')),
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS word_count integer,
  ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS geo_markup jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hashtags text[] DEFAULT '{}';

-- 원본 글 조회 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_op_is_source
  ON organic_posts(is_source)
  WHERE is_source = true;

-- 예약 발행 조회 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_op_scheduled_at
  ON organic_posts(scheduled_at)
  WHERE scheduled_at IS NOT NULL;
