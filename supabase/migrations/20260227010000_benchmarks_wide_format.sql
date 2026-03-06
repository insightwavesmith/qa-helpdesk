-- M1: benchmarks 테이블 재생성 (wide format, GCP 방식)
-- 기존 EAV(metric_name/p25/p50/p75/p90) → wide format (컬럼별 지표)
-- creative_type × ranking_type × ranking_group별 그룹 평균 저장
-- ⚠️ 기존 benchmarks 데이터 삭제됨 (collect-benchmarks 재실행 필요)

-- 기존 테이블 삭제
DROP TABLE IF EXISTS benchmarks;

-- 신규 테이블 생성 (wide format)
CREATE TABLE benchmarks (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_type             TEXT NOT NULL,             -- VIDEO / IMAGE / CATALOG
  ranking_type              TEXT NOT NULL,             -- quality / engagement / conversion
  ranking_group             TEXT NOT NULL,             -- ABOVE_AVERAGE / AVERAGE / BELOW_AVERAGE / MEDIAN_ALL
  sample_count              INTEGER,                   -- 그룹 내 광고 수

  -- 영상 지표 (VIDEO만, IMAGE/CATALOG은 NULL)
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

  calculated_at             TIMESTAMPTZ DEFAULT now()
);

-- 유일 인덱스 (한 번에 하나씩 유지)
CREATE UNIQUE INDEX idx_benchmarks_unique
  ON benchmarks (creative_type, ranking_type, ranking_group);

-- 성능 인덱스
CREATE INDEX idx_benchmarks_ct_rt ON benchmarks (creative_type, ranking_type);
CREATE INDEX idx_benchmarks_calc ON benchmarks (calculated_at DESC);

-- RLS: service_role만 접근 (collect-benchmarks 크론 전용)
ALTER TABLE benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON benchmarks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 인증된 사용자 읽기 허용 (총가치각도기 대시보드)
CREATE POLICY "Authenticated read"
  ON benchmarks FOR SELECT
  TO authenticated
  USING (true);
