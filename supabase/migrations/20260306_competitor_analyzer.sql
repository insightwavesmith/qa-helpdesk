-- 경쟁사 분석기 테이블 마이그레이션
-- T2: 모니터링 + T3: AI 인사이트 캐시

-- 1. competitor_monitors: 브랜드 모니터링 등록
CREATE TABLE IF NOT EXISTS competitor_monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name text NOT NULL,
  page_id text,
  last_checked_at timestamptz,
  last_ad_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_monitors_user_id
  ON competitor_monitors(user_id);

-- RLS 정책
ALTER TABLE competitor_monitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "사용자 본인 모니터 조회"
  ON competitor_monitors FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "사용자 본인 모니터 등록"
  ON competitor_monitors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "사용자 본인 모니터 삭제"
  ON competitor_monitors FOR DELETE
  USING (auth.uid() = user_id);

-- 2. competitor_alerts: 신규 광고 알림
CREATE TABLE IF NOT EXISTS competitor_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id uuid NOT NULL REFERENCES competitor_monitors(id) ON DELETE CASCADE,
  new_ad_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  detected_at timestamptz DEFAULT now(),
  is_read boolean DEFAULT false
);

-- RLS 정책: monitor_id JOIN으로 user_id 확인
ALTER TABLE competitor_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "모니터 소유자 알림 조회"
  ON competitor_alerts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM competitor_monitors m
      WHERE m.id = competitor_alerts.monitor_id
      AND m.user_id = auth.uid()
    )
  );

-- 3. competitor_insight_cache: AI 분석 결과 캐시
CREATE TABLE IF NOT EXISTS competitor_insight_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_query text NOT NULL,
  insight_data jsonb NOT NULL,
  ad_count integer,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_insight_cache_query
  ON competitor_insight_cache(search_query);

-- 서비스 클라이언트로만 접근 (RLS 불필요)
ALTER TABLE competitor_insight_cache ENABLE ROW LEVEL SECURITY;
