-- =============================================================
-- Wave 1: CAROUSEL 지원 — creative_media 1:N 전환 + 데이터 교정
-- =============================================================

-- 1. creative_media에 position/card_total 컬럼 추가
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS position INT DEFAULT 0;
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS card_total INT DEFAULT 1;

-- 2. UNIQUE(creative_id) 제거 → UNIQUE(creative_id, position)
ALTER TABLE creative_media DROP CONSTRAINT IF EXISTS creative_media_creative_id_key;
ALTER TABLE creative_media ADD CONSTRAINT creative_media_creative_position_unique
  UNIQUE (creative_id, position);

-- 3. 카드별 LP (슬라이드 카드마다 LP 다를 수 있음)
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS lp_id UUID REFERENCES landing_pages(id);

-- 4. 인덱스
CREATE INDEX IF NOT EXISTS idx_cm_creative_position ON creative_media (creative_id, position);

-- 5. creatives CAROUSEL 재분류 (raw_creative가 있는 것만)
-- object_story_spec.template_data 존재 = CAROUSEL
-- asset_feed_spec.images 2개 이상 = CAROUSEL (CATALOG 제외)
UPDATE creatives
SET creative_type = 'CAROUSEL'
WHERE raw_creative IS NOT NULL
  AND creative_type NOT IN ('CAROUSEL', 'CATALOG')
  AND (
    raw_creative->'object_story_spec'->'template_data' IS NOT NULL
    OR jsonb_array_length(COALESCE(raw_creative->'asset_feed_spec'->'images', '[]'::jsonb)) > 1
  );
