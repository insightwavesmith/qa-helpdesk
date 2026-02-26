-- T1: daily_mixpanel_insights 테이블 생성
-- 믹스패널에서 수집한 일별 매출/구매 데이터 저장

CREATE TABLE IF NOT EXISTS daily_mixpanel_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE NOT NULL,
  user_id         UUID NOT NULL REFERENCES profiles(id),
  account_id      TEXT NOT NULL,
  project_id      TEXT NOT NULL,
  total_revenue   NUMERIC(15, 2) DEFAULT 0,
  purchase_count  INTEGER DEFAULT 0,
  collected_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (date, account_id, project_id)
);

CREATE INDEX idx_dmi_user_date ON daily_mixpanel_insights (user_id, date DESC);
CREATE INDEX idx_dmi_account_date ON daily_mixpanel_insights (account_id, date DESC);

-- RLS 정책
ALTER TABLE daily_mixpanel_insights ENABLE ROW LEVEL SECURITY;

-- 본인 데이터만 조회
CREATE POLICY "Users can view own mixpanel insights"
  ON daily_mixpanel_insights
  FOR SELECT
  USING (user_id = auth.uid());

-- 관리자 전체 조회
CREATE POLICY "Admins can view all mixpanel insights"
  ON daily_mixpanel_insights
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- service_role만 INSERT (크론 API)
CREATE POLICY "Service role can insert mixpanel insights"
  ON daily_mixpanel_insights
  FOR INSERT
  WITH CHECK (true);
