-- landing_pages: LP URL 정규화 테이블
CREATE TABLE IF NOT EXISTS landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  canonical_url text UNIQUE NOT NULL,
  original_urls text[] DEFAULT '{}',
  domain text,
  product_id text,
  product_name text,
  page_type text DEFAULT 'product', -- product / event / article / homepage / external
  platform text, -- cafe24 / smartstore / custom / oliveyoung
  is_active boolean DEFAULT true,
  ad_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lp_account ON landing_pages(account_id);
CREATE INDEX IF NOT EXISTS idx_lp_domain ON landing_pages(domain);
CREATE INDEX IF NOT EXISTS idx_lp_page_type ON landing_pages(page_type);

-- RLS
ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_lp" ON landing_pages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_lp" ON landing_pages FOR SELECT TO authenticated USING (true);

-- lp_snapshots: LP별 뷰포트 스크린샷
CREATE TABLE IF NOT EXISTS lp_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_id uuid REFERENCES landing_pages(id) ON DELETE CASCADE,
  viewport text NOT NULL, -- 'mobile' (375x812) / 'desktop' (1280x800)
  screenshot_url text,
  cta_screenshot_url text,
  screenshot_hash text,
  cta_screenshot_hash text,
  section_screenshots jsonb DEFAULT '{}',
  crawled_at timestamptz DEFAULT now(),
  crawler_version text
);
CREATE INDEX IF NOT EXISTS idx_lps_lp_id ON lp_snapshots(lp_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lps_lp_viewport ON lp_snapshots(lp_id, viewport);

-- RLS
ALTER TABLE lp_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_lps" ON lp_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_lps" ON lp_snapshots FOR SELECT TO authenticated USING (true);
