-- ═══════════════════════════════════════════════════════════════════
-- v3 Schema Additions: 마스터 설계서 기반 DB 보강
--
-- 변경 내역:
--   1. creatives.source: 'bscamp' → 'member' 값 변경 + CHECK 제약
--   2. creative_media: +saliency_url, +is_active, +updated_at + 트리거
--   3. landing_pages: +content_hash, +last_crawled_at
--   4. lp_analysis: +reference_based, +data_based, +eye_tracking
--   5. creative_lp_map: +message_alignment, +cta_alignment, +offer_alignment, +overall_score, +issues
--   6. lp_click_data: 신규 테이블 (Mixpanel 클릭 데이터)
--   7. change_log: 신규 테이블 (변화→성과 추적)
--   8. competitor_ad_cache: +analysis_json
--   9. RPC 재정의: get_student_creative_summary (source 'member')
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 1. creatives.source 값 통일 (3계층: member/benchmark/competitor)
-- ─────────────────────────────────────────────
UPDATE creatives SET source = 'member' WHERE source = 'bscamp';
ALTER TABLE creatives ALTER COLUMN source SET DEFAULT 'member';
ALTER TABLE creatives DROP CONSTRAINT IF EXISTS chk_creatives_source;
ALTER TABLE creatives ADD CONSTRAINT chk_creatives_source
  CHECK (source IN ('member', 'benchmark', 'competitor'));


-- ─────────────────────────────────────────────
-- 2. creative_media 컬럼 추가
-- ─────────────────────────────────────────────
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS saliency_url text;
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DROP TRIGGER IF EXISTS update_creative_media_updated_at ON creative_media;
CREATE TRIGGER update_creative_media_updated_at
  BEFORE UPDATE ON creative_media
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON COLUMN creative_media.saliency_url IS 'DeepGaze 시선 히트맵 URL (saliency/{account_id}/{ad_id}.png)';
COMMENT ON COLUMN creative_media.is_active IS '활성 상태 (creatives.is_active와 연동)';
COMMENT ON COLUMN creative_media.updated_at IS '마지막 수정 시각 (트리거 자동 갱신)';


-- ─────────────────────────────────────────────
-- 3. landing_pages 컬럼 추가
-- ─────────────────────────────────────────────
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS last_crawled_at timestamptz;

COMMENT ON COLUMN landing_pages.content_hash IS 'LP 콘텐츠 SHA-256 해시 (변경 감지용)';
COMMENT ON COLUMN landing_pages.last_crawled_at IS '마지막 크롤링 시각';


-- ─────────────────────────────────────────────
-- 4. lp_analysis 컬럼 추가
-- ─────────────────────────────────────────────
ALTER TABLE lp_analysis ADD COLUMN IF NOT EXISTS reference_based jsonb;
ALTER TABLE lp_analysis ADD COLUMN IF NOT EXISTS data_based jsonb;
ALTER TABLE lp_analysis ADD COLUMN IF NOT EXISTS eye_tracking jsonb;

COMMENT ON COLUMN lp_analysis.reference_based IS '레퍼런스 기반 분석 (8개 카테고리 JSONB)';
COMMENT ON COLUMN lp_analysis.data_based IS '데이터 기반 분석 (전환율 교차 JSONB, Phase 2)';
COMMENT ON COLUMN lp_analysis.eye_tracking IS 'DeepGaze LP 시선 분석 (섹션별 weight + fixation)';


-- ─────────────────────────────────────────────
-- 5. creative_lp_map 컬럼 추가 (기존 v1 컬럼 유지 + 신규 병행)
-- ─────────────────────────────────────────────
ALTER TABLE creative_lp_map ADD COLUMN IF NOT EXISTS message_alignment float;
ALTER TABLE creative_lp_map ADD COLUMN IF NOT EXISTS cta_alignment float;
ALTER TABLE creative_lp_map ADD COLUMN IF NOT EXISTS offer_alignment float;
ALTER TABLE creative_lp_map ADD COLUMN IF NOT EXISTS overall_score float;
ALTER TABLE creative_lp_map ADD COLUMN IF NOT EXISTS issues jsonb;

COMMENT ON COLUMN creative_lp_map.message_alignment IS '메시지 일관성 점수 0-100';
COMMENT ON COLUMN creative_lp_map.cta_alignment IS 'CTA 일관성 점수 0-100';
COMMENT ON COLUMN creative_lp_map.offer_alignment IS '오퍼 일관성 점수 0-100';
COMMENT ON COLUMN creative_lp_map.overall_score IS '종합 일관성 점수 0-100';
COMMENT ON COLUMN creative_lp_map.issues IS '불일치 이슈 [{type, severity, description, action}]';


-- ─────────────────────────────────────────────
-- 6. lp_click_data 신규 테이블 (Mixpanel Autocapture 클릭)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lp_click_data (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_id             uuid NOT NULL REFERENCES landing_pages(id) ON DELETE CASCADE,
  click_x           float NOT NULL,
  click_y           float NOT NULL,
  page_width        int,
  page_height       int,
  element_tag       text,
  element_text      text,
  element_selector  text,
  section           text,
  device            text,
  referrer          text,
  mixpanel_user_id  text,
  clicked_at        timestamptz NOT NULL,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lcd_lp_id ON lp_click_data(lp_id);
CREATE INDEX IF NOT EXISTS idx_lcd_section ON lp_click_data(section);
CREATE INDEX IF NOT EXISTS idx_lcd_clicked_at ON lp_click_data(clicked_at DESC);

ALTER TABLE lp_click_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_lcd" ON lp_click_data
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_lcd" ON lp_click_data
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE lp_click_data IS 'Mixpanel Autocapture 클릭 데이터. LP별 실제 클릭 좌표+요소.';


-- ─────────────────────────────────────────────
-- 7. change_log 신규 테이블 (변화→성과 추적, 순환 학습)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type           text NOT NULL CHECK (entity_type IN ('creative', 'lp')),
  entity_id             uuid NOT NULL,
  account_id            text NOT NULL,
  change_detected_at    timestamptz DEFAULT now(),
  change_type           text CHECK (change_type IN ('element_added', 'element_removed', 'element_modified', 'new_version')),
  element_diff          jsonb,
  performance_before    jsonb,
  performance_after     jsonb,
  performance_change    jsonb,
  confidence            text CHECK (confidence IN ('low', 'medium', 'high')),
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cl_entity ON change_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_cl_account ON change_log(account_id);
CREATE INDEX IF NOT EXISTS idx_cl_detected ON change_log(change_detected_at DESC);

ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_cl" ON change_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_cl" ON change_log
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE change_log IS '소재/LP 변화 이력. 요소 diff → 성과 변화 추적 (순환 학습).';


-- ─────────────────────────────────────────────
-- 8. competitor_ad_cache: analysis_json 컬럼 추가
-- ─────────────────────────────────────────────
ALTER TABLE competitor_ad_cache ADD COLUMN IF NOT EXISTS analysis_json jsonb;

COMMENT ON COLUMN competitor_ad_cache.analysis_json IS '5축 분석 결과 (creative_media.analysis_json과 동일 스키마)';


-- ─────────────────────────────────────────────
-- 9. RPC 재정의: source 'bscamp' → 'member'
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_student_creative_summary(target_user_id uuid DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  user_name text,
  shop_name text,
  account_id text,
  total_creatives bigint,
  active_creatives bigint,
  image_count bigint,
  video_count bigint,
  lp_count bigint,
  avg_roas float,
  top_roas float
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    p.name AS user_name,
    p.shop_name,
    aa.account_id,
    count(c.id) AS total_creatives,
    count(c.id) FILTER (WHERE c.is_active) AS active_creatives,
    count(c.id) FILTER (WHERE c.creative_type = 'IMAGE') AS image_count,
    count(c.id) FILTER (WHERE c.creative_type = 'VIDEO') AS video_count,
    count(DISTINCT c.lp_id) AS lp_count,
    avg(cp.roas) AS avg_roas,
    max(cp.roas) AS top_roas
  FROM profiles p
  JOIN ad_accounts aa ON aa.user_id = p.id
  LEFT JOIN creatives c ON c.account_id = aa.account_id AND c.source = 'member'
  LEFT JOIN creative_performance cp ON cp.creative_id = c.id
  WHERE (target_user_id IS NULL OR p.id = target_user_id)
  GROUP BY p.id, p.name, p.shop_name, aa.account_id
  ORDER BY total_creatives DESC;
$$;
