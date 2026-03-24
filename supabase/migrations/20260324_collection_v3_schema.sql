-- ═══ Collection V3: 계정 디스커버리 + 콘텐츠 중복 제거 ═══

-- 1. ad_accounts 확장
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS is_member BOOLEAN DEFAULT false;
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS account_status INT;

-- 기존 계정 중 user_id 있는 것 → is_member=true
UPDATE ad_accounts SET is_member = true WHERE user_id IS NOT NULL;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_aa_active ON ad_accounts(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_aa_is_member ON ad_accounts(is_member);

-- 2. creative_media 확장
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_cm_content_hash ON creative_media(content_hash) WHERE content_hash IS NOT NULL;

-- 3. 기존 데이터 content_hash 채우기 (raw_creative JSONB에서 추출)
UPDATE creative_media
SET content_hash = raw_creative->>'image_hash'
WHERE media_type = 'IMAGE'
  AND content_hash IS NULL
  AND raw_creative->>'image_hash' IS NOT NULL;

UPDATE creative_media
SET content_hash = raw_creative->>'video_id'
WHERE media_type = 'VIDEO'
  AND content_hash IS NULL
  AND raw_creative->>'video_id' IS NOT NULL;
