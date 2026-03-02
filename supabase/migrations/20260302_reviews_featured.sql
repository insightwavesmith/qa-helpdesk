-- C3: 베스트 후기 컬럼 추가
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS featured_order INTEGER DEFAULT NULL;

-- 인덱스 (베스트 후기 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_reviews_featured ON reviews (is_featured, featured_order)
  WHERE is_featured = true;

-- 코멘트
COMMENT ON COLUMN reviews.is_featured IS '베스트 후기 선정 여부';
COMMENT ON COLUMN reviews.featured_order IS '베스트 후기 표시 순서 (1=최상단, NULL=미선정)';
