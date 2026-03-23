-- 수집 구조 리팩토링 — is_member/is_benchmark 플래그 + creative_media raw

-- 1. creatives 테이블에 분류 플래그 추가
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS is_member BOOLEAN DEFAULT false;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS is_benchmark BOOLEAN DEFAULT false;

-- 2. creative_media에 raw JSONB 추가
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS raw_creative JSONB;

-- 3. 기존 데이터 태깅
UPDATE creatives SET is_member = true WHERE source = 'member' AND is_member = false;
UPDATE creatives SET is_benchmark = true WHERE source = 'benchmark' AND is_benchmark = false;

-- 4. 인덱스
CREATE INDEX IF NOT EXISTS idx_creatives_is_member ON creatives (is_member) WHERE is_member = true;
CREATE INDEX IF NOT EXISTS idx_creatives_is_benchmark ON creatives (is_benchmark) WHERE is_benchmark = true;
CREATE INDEX IF NOT EXISTS idx_cm_raw_creative ON creative_media USING gin (raw_creative) WHERE raw_creative IS NOT NULL;
