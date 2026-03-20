-- ═══════════════════════════════════════════════════════════════════
-- DB Architecture v2: 계정 종속 구조 정규화
--
-- 핵심 원칙:
--   수강생 계정(ad_accounts)이 최상위
--   소재(creatives)/LP(landing_pages)는 계정에 종속
--   ad_creative_embeddings → creatives + creative_media + creative_performance 분리
--   기존 테이블 유지 (호환성) + 새 정규화 테이블 추가
--
-- 관계도:
--   profiles ← ad_accounts ← creatives ← creative_media
--                                       ← creative_performance
--                           ← landing_pages ← lp_snapshots
--                                           ← lp_analysis
--                                           ← creative_lp_map
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 0-a. update_updated_at_column() 함수 (public 스키마)
--      storage 스키마에만 있을 수 있으므로 public에 생성
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- 0-b. ad_accounts UNIQUE 제약 (FK 참조 기반)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_ad_accounts_account_id'
  ) THEN
    ALTER TABLE ad_accounts ADD CONSTRAINT uq_ad_accounts_account_id UNIQUE (account_id);
  END IF;
END $$;


-- ─────────────────────────────────────────────
-- 1. creatives (소재 마스터)
--    ad_creative_embeddings에서 소재 메타데이터 분리
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creatives (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id       text UNIQUE NOT NULL,               -- Meta 광고 ID
  account_id  text NOT NULL,                       -- Meta 광고 계정 ID (ad_accounts.account_id 참조)
  lp_id       uuid REFERENCES landing_pages(id),   -- 정규화된 LP 연결
  creative_type text,                              -- IMAGE / VIDEO / CAROUSEL
  source      text DEFAULT 'bscamp',               -- bscamp / competitor
  brand_name  text,
  category    text,
  cohort      text,
  is_active   boolean DEFAULT true,
  duration_days int,
  lp_url      text,                                -- 원본 LP URL (역호환 + 정규화 전)
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- account_id FK: 소프트 참조 (경쟁사 데이터는 ad_accounts에 없을 수 있음)
-- bscamp 소재만 FK 검증하려면 partial index 사용
CREATE INDEX IF NOT EXISTS idx_cr_account   ON creatives(account_id);
CREATE INDEX IF NOT EXISTS idx_cr_lp        ON creatives(lp_id);
CREATE INDEX IF NOT EXISTS idx_cr_type      ON creatives(creative_type);
CREATE INDEX IF NOT EXISTS idx_cr_source    ON creatives(source);
CREATE INDEX IF NOT EXISTS idx_cr_active    ON creatives(is_active) WHERE is_active = true;

COMMENT ON TABLE creatives IS '소재 마스터: ad_creative_embeddings에서 소재 메타데이터 분리. 계정(account_id) 종속.';
COMMENT ON COLUMN creatives.account_id IS 'Meta 광고 계정 ID. ad_accounts.account_id와 매칭. 경쟁사 소재는 ad_accounts에 없을 수 있어 hard FK 아님.';


-- ─────────────────────────────────────────────
-- 2. creative_media (미디어 파일 + 임베딩)
--    ad_creative_embeddings에서 미디어/임베딩 분리
--    1 creative = 1 media (현재 구조)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creative_media (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id         uuid NOT NULL REFERENCES creatives(id) ON DELETE CASCADE UNIQUE,
  media_type          text NOT NULL,                -- IMAGE / VIDEO
  media_url           text,                         -- Meta CDN URL (일시적)
  storage_url         text,                         -- Supabase Storage (영구, 이미지/mp4)
  thumbnail_url       text,                         -- 영상 썸네일
  media_hash          text,                         -- 중복 감지 SHA-256
  file_size           bigint,                       -- 바이트
  duration_seconds    float,                        -- 영상 길이 (초)
  width               int,
  height              int,
  ad_copy             text,                         -- 광고 카피 텍스트
  video_analysis      jsonb,                        -- 영상 분석 메타데이터

  -- 임베딩 (인라인: 유사도 검색 시 JOIN 최소화)
  embedding           vector(3072),                 -- 소재 비주얼 임베딩
  text_embedding      vector(3072),                 -- 광고 카피 텍스트 임베딩
  embedding_model     text,                         -- 모델 버전 (gemini-embedding-002 등)
  embedded_at         timestamptz,

  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cm_creative   ON creative_media(creative_id);
CREATE INDEX IF NOT EXISTS idx_cm_hash       ON creative_media(media_hash);
CREATE INDEX IF NOT EXISTS idx_cm_type       ON creative_media(media_type);

-- NOTE: HNSW 인덱스는 pgvector 2000차원 제한으로 3072차원 벡터에 사용 불가
-- ~3000행 규모에서 순차 스캔으로 충분. 규모 커지면 IVFFlat 고려.

COMMENT ON TABLE creative_media IS '소재 미디어 파일 + 임베딩. 이미지 원본, mp4 영상, 썸네일, 광고 카피 보관.';


-- ─────────────────────────────────────────────
-- 3. creative_performance (성과 집계)
--    ad_creative_embeddings + daily_ad_insights 집계
--    1 creative = 1 performance snapshot
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creative_performance (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id           uuid NOT NULL REFERENCES creatives(id) ON DELETE CASCADE UNIQUE,
  roas                  float,
  ctr                   float,
  click_to_purchase_rate float,
  roas_percentile       float,
  quality_ranking       text,                       -- Meta 품질 순위
  total_spend           float,
  total_impressions     bigint,
  total_clicks          bigint,
  total_purchases       int,
  total_revenue         float,
  date_from             date,                       -- 집계 시작일
  date_to               date,                       -- 집계 종료일
  computed_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cp_creative ON creative_performance(creative_id);
CREATE INDEX IF NOT EXISTS idx_cp_roas     ON creative_performance(roas DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_cp_ctr      ON creative_performance(ctr DESC NULLS LAST);

COMMENT ON TABLE creative_performance IS '소재별 성과 집계. daily_ad_insights에서 계산한 스냅샷.';


-- ─────────────────────────────────────────────
-- 4. lp_analysis (LP 분석 + 임베딩)
--    lp_structure_analysis에서 lp_url → lp_id FK로 전환
--    LP 임베딩도 여기에 통합 (ad_creative_embeddings에서 분리)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lp_analysis (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_id               uuid NOT NULL REFERENCES landing_pages(id) ON DELETE CASCADE,
  viewport            text NOT NULL DEFAULT 'mobile',  -- mobile / desktop

  -- 구조 분석 (기존 lp_structure_analysis 필드)
  conversion_score    float,                        -- 전환 점수 0~100
  hero_type           text,
  price_position      text,
  discount_highlight  boolean,
  review_position_pct float,
  review_type         text,
  review_density      text,
  review_count        int,
  cta_type            text,
  cta_position        text,
  social_proof        jsonb,
  page_length         text,
  trust_badges        text[],
  option_types        text[],
  cross_sell          boolean,
  easy_pay            text[],
  urgency_stock       boolean,
  urgency_timedeal    boolean,
  touches_to_checkout int,

  -- 비주얼 분석
  dominant_color      text,
  color_palette       text[],
  color_tone          text,
  text_density_pct    float,
  photo_review_ratio  float,
  video_review_count  int DEFAULT 0,
  gif_count           int DEFAULT 0,
  gif_positions       text[],
  video_count         int DEFAULT 0,
  video_autoplay      boolean,

  -- AI 분석 원본
  raw_analysis        jsonb,
  model_version       text,

  -- 임베딩 (LP 시각/텍스트)
  embedding           vector(3072),                 -- LP 비주얼 임베딩
  text_embedding      vector(3072),                 -- LP 텍스트 임베딩
  embedded_at         timestamptz,

  analyzed_at         timestamptz DEFAULT now(),
  UNIQUE(lp_id, viewport)
);

CREATE INDEX IF NOT EXISTS idx_la_lp       ON lp_analysis(lp_id);
CREATE INDEX IF NOT EXISTS idx_la_viewport ON lp_analysis(viewport);
CREATE INDEX IF NOT EXISTS idx_la_score    ON lp_analysis(conversion_score DESC NULLS LAST);

-- NOTE: LP 임베딩 HNSW도 3072차원 제한으로 생략. ~50 LP 규모에서 순차 스캔 충분.

COMMENT ON TABLE lp_analysis IS 'LP 구조 분석 + 임베딩. 뷰포트(모바일/PC)별 각각 분석. lp_structure_analysis 정규화 버전.';


-- ─────────────────────────────────────────────
-- 5. creative_lp_map (소재↔LP 일관성 점수)
--    creative_lp_consistency에서 ad_id/lp_url → FK로 전환
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creative_lp_map (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id     uuid NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
  lp_id           uuid NOT NULL REFERENCES landing_pages(id) ON DELETE CASCADE,
  visual_score    float,                            -- 비주얼 일관성
  video_score     float,                            -- 비디오 일관성
  semantic_score  float,                            -- 의미론적 일관성
  cross_vt_score  float,                            -- 비디오→텍스트 교차
  cross_tv_score  float,                            -- 텍스트→비디오 교차
  holistic_score  float,                            -- 종합 일관성
  total_score     float,                            -- 최종 점수
  analyzed_at     timestamptz DEFAULT now(),
  UNIQUE(creative_id, lp_id)
);

CREATE INDEX IF NOT EXISTS idx_clm_creative ON creative_lp_map(creative_id);
CREATE INDEX IF NOT EXISTS idx_clm_lp       ON creative_lp_map(lp_id);
CREATE INDEX IF NOT EXISTS idx_clm_total    ON creative_lp_map(total_score DESC NULLS LAST);

COMMENT ON TABLE creative_lp_map IS '소재↔LP 일관성 분석. creative_lp_consistency 정규화 버전.';


-- ═══════════════════════════════════════════════════════════════════
-- RLS 정책 (모든 신규 테이블)
-- 패턴: service_role 전체 접근 + authenticated 읽기 전용
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_cr" ON creatives
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_cr" ON creatives
  FOR SELECT TO authenticated USING (true);

ALTER TABLE creative_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_cm" ON creative_media
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_cm" ON creative_media
  FOR SELECT TO authenticated USING (true);

ALTER TABLE creative_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_cp" ON creative_performance
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_cp" ON creative_performance
  FOR SELECT TO authenticated USING (true);

ALTER TABLE lp_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_la" ON lp_analysis
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_la" ON lp_analysis
  FOR SELECT TO authenticated USING (true);

ALTER TABLE creative_lp_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_clm" ON creative_lp_map
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_clm" ON creative_lp_map
  FOR SELECT TO authenticated USING (true);


-- ═══════════════════════════════════════════════════════════════════
-- updated_at 자동 갱신 트리거
-- ═══════════════════════════════════════════════════════════════════

CREATE TRIGGER update_creatives_updated_at
  BEFORE UPDATE ON creatives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ═══════════════════════════════════════════════════════════════════
-- RPC: 유사 소재 검색 v2 (새 구조 기반)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION search_similar_creatives_v2(
  query_embedding vector(3072),
  match_count int DEFAULT 20,
  filter_source text DEFAULT NULL,
  filter_account text DEFAULT NULL,
  filter_category text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  ad_id text,
  brand_name text,
  source text,
  media_url text,
  storage_url text,
  ad_copy text,
  lp_url text,
  creative_type text,
  roas float,
  ctr float,
  similarity float
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.ad_id,
    c.brand_name,
    c.source,
    cm.media_url,
    cm.storage_url,
    cm.ad_copy,
    c.lp_url,
    c.creative_type,
    cp.roas,
    cp.ctr,
    1 - (cm.embedding <=> query_embedding) AS similarity
  FROM creatives c
  JOIN creative_media cm ON cm.creative_id = c.id
  LEFT JOIN creative_performance cp ON cp.creative_id = c.id
  WHERE cm.embedding IS NOT NULL
    AND (filter_source IS NULL OR c.source = filter_source)
    AND (filter_account IS NULL OR c.account_id = filter_account)
    AND (filter_category IS NULL OR c.category = filter_category)
  ORDER BY cm.embedding <=> query_embedding
  LIMIT match_count;
$$;


-- ═══════════════════════════════════════════════════════════════════
-- RPC: 수강생별 소재/LP 현황 (계정 종속 구조 활용)
-- ═══════════════════════════════════════════════════════════════════

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
  LEFT JOIN creatives c ON c.account_id = aa.account_id AND c.source = 'bscamp'
  LEFT JOIN creative_performance cp ON cp.creative_id = c.id
  WHERE (target_user_id IS NULL OR p.id = target_user_id)
  GROUP BY p.id, p.name, p.shop_name, aa.account_id
  ORDER BY total_creatives DESC;
$$;


-- ═══════════════════════════════════════════════════════════════════
-- 호환성 뷰: 기존 코드가 ad_creative_embeddings 쿼리 패턴 유지
-- (Phase 3에서 코드 마이그레이션 후 제거 예정)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW creatives_compat_v1 AS
SELECT
  c.id,
  c.source,
  NULL::uuid AS brand_id,
  c.brand_name,
  c.account_id,
  c.category,
  c.cohort,
  c.ad_id,
  cm.media_url,
  cm.media_type,
  cm.ad_copy,
  c.creative_type,
  cm.embedding,
  cm.text_embedding,
  c.lp_url,
  cm.storage_url,
  cp.roas,
  cp.ctr,
  cp.click_to_purchase_rate,
  cp.roas_percentile,
  cp.quality_ranking,
  c.is_active,
  c.duration_days,
  cm.media_hash,
  cm.embedding_model,
  c.created_at,
  c.updated_at,
  cm.embedded_at,
  cm.video_analysis
FROM creatives c
LEFT JOIN creative_media cm ON cm.creative_id = c.id
LEFT JOIN creative_performance cp ON cp.creative_id = c.id;
