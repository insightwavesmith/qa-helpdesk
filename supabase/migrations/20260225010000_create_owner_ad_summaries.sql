-- owner_ad_summaries: 관리자(Smith) 본인의 광고계정 성과 요약
CREATE TABLE IF NOT EXISTS owner_ad_summaries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id text NOT NULL,
  account_name text,
  owner_type text NOT NULL DEFAULT 'client',
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_spend numeric,
  total_revenue numeric,
  avg_roas numeric,
  total_purchases integer,
  collected_at timestamptz DEFAULT now()
);

ALTER TABLE owner_ad_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access" ON owner_ad_summaries
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
