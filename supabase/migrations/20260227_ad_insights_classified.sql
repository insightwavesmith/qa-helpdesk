-- M2: ad_insights_classified 테이블 생성
-- collect-benchmarks에서 수집한 광고별 분류 데이터 임시 저장
-- 매주 collect-benchmarks 실행 시 DELETE→INSERT로 교체

CREATE TABLE IF NOT EXISTS ad_insights_classified (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id                     TEXT NOT NULL,
  account_id                TEXT NOT NULL,
  ad_name                   TEXT,
  creative_type             TEXT NOT NULL,             -- VIDEO / IMAGE / CATALOG / SHARE / UNKNOWN
  quality_ranking           TEXT,                      -- ABOVE_AVERAGE / AVERAGE / BELOW_AVERAGE / UNKNOWN
  engagement_ranking        TEXT,
  conversion_ranking        TEXT,

  -- 기본 지표
  impressions               INTEGER,
  clicks                    INTEGER,
  spend                     FLOAT8,
  reach                     INTEGER,

  -- 영상 지표
  video_p3s_rate            FLOAT8,
  thruplay_rate             FLOAT8,
  retention_rate            FLOAT8,

  -- 참여 지표
  reactions_per_10k         FLOAT8,
  comments_per_10k          FLOAT8,
  shares_per_10k            FLOAT8,
  saves_per_10k             FLOAT8,
  engagement_per_10k        FLOAT8,

  -- 전환율 지표
  ctr                       FLOAT8,
  click_to_checkout_rate    FLOAT8,
  click_to_purchase_rate    FLOAT8,
  checkout_to_purchase_rate FLOAT8,
  roas                      FLOAT8,

  collected_at              TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_aic_account_ct
  ON ad_insights_classified (account_id, creative_type);
CREATE INDEX IF NOT EXISTS idx_aic_collected
  ON ad_insights_classified (collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_aic_rankings
  ON ad_insights_classified (quality_ranking, engagement_ranking, conversion_ranking);

-- RLS: service_role만 (collect-benchmarks 전용)
ALTER TABLE ad_insights_classified ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON ad_insights_classified FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 인증된 사용자는 읽기만 허용 (진단 API 참조용)
CREATE POLICY "Authenticated read"
  ON ad_insights_classified FOR SELECT
  TO authenticated
  USING (true);
