CREATE TABLE IF NOT EXISTS cron_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cron_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  records_count INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cron_runs_name_started ON cron_runs(cron_name, started_at DESC);
ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;
