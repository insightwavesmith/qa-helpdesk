-- Phase 2: screenshot_hash 컬럼 추가 (변경 감지용)
-- lp_screenshot_url, lp_cta_screenshot_url은 이미 존재

ALTER TABLE ad_creative_embeddings
  ADD COLUMN IF NOT EXISTS screenshot_hash TEXT;

-- screenshot_hash 인덱스 (변경 감지 조회용)
CREATE INDEX IF NOT EXISTS idx_ace_screenshot_hash
  ON ad_creative_embeddings(screenshot_hash)
  WHERE screenshot_hash IS NOT NULL;
