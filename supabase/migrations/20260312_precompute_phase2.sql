-- ============================================================
-- 사전계산 Phase 2: 집계 캐시 4개 테이블 신설
-- ============================================================

-- 1. 대시보드 통계 캐시
CREATE TABLE IF NOT EXISTS dashboard_stats_cache (
  stat_key TEXT PRIMARY KEY,
  stat_value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE dashboard_stats_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on dashboard_stats_cache"
  ON dashboard_stats_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read dashboard_stats_cache"
  ON dashboard_stats_cache FOR SELECT TO authenticated USING (true);

-- 2. 이메일 캠페인 통계
CREATE TABLE IF NOT EXISTS email_campaign_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subject TEXT NOT NULL UNIQUE,
  content_id TEXT,
  sent_at TIMESTAMPTZ,
  recipients INT DEFAULT 0,
  opens INT DEFAULT 0,
  clicks INT DEFAULT 0,
  open_rate NUMERIC(5,1) DEFAULT 0,
  click_rate NUMERIC(5,1) DEFAULT 0,
  sends_json JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE email_campaign_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on email_campaign_stats"
  ON email_campaign_stats FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read email_campaign_stats"
  ON email_campaign_stats FOR SELECT TO authenticated USING (true);

-- 3. 지식관리 일별 통계
CREATE TABLE IF NOT EXISTS knowledge_daily_stats (
  stat_date DATE PRIMARY KEY,
  total_cost NUMERIC(10,4) DEFAULT 0,
  avg_duration_ms INT DEFAULT 0,
  call_count INT DEFAULT 0,
  consumer_counts JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE knowledge_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on knowledge_daily_stats"
  ON knowledge_daily_stats FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read knowledge_daily_stats"
  ON knowledge_daily_stats FOR SELECT TO authenticated USING (true);

-- 4. 계정 동기화 상태
CREATE TABLE IF NOT EXISTS account_sync_status (
  account_id TEXT PRIMARY KEY,
  account_name TEXT,
  meta_ok BOOLEAN DEFAULT false,
  meta_last_date TEXT,
  meta_ad_count INT DEFAULT 0,
  mixpanel_ok BOOLEAN DEFAULT false,
  mixpanel_state TEXT DEFAULT 'not_configured',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE account_sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on account_sync_status"
  ON account_sync_status FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read account_sync_status"
  ON account_sync_status FOR SELECT TO authenticated USING (true);
