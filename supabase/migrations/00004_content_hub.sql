-- Phase 1: 콘텐츠 허브 인프라 테이블
-- 실행: Supabase Dashboard SQL Editor에서 실행

-- 콘텐츠 허브 테이블
CREATE TABLE IF NOT EXISTS contents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  body_md text NOT NULL,
  summary text,
  thumbnail_url text,
  category text NOT NULL DEFAULT 'general',
  tags text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  source_type text,
  source_ref text,
  source_hash text,
  author_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contents_category ON contents(category);
CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status);
CREATE INDEX IF NOT EXISTS idx_contents_tags ON contents USING GIN(tags);

ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON contents FOR ALL USING (true);

-- 배포 기록 테이블
CREATE TABLE IF NOT EXISTS distributions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id uuid REFERENCES contents(id) ON DELETE CASCADE,
  channel text NOT NULL,
  channel_ref text,
  rendered_title text,
  rendered_body text,
  status text NOT NULL DEFAULT 'pending',
  distributed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_distributions_content ON distributions(content_id);
CREATE INDEX IF NOT EXISTS idx_distributions_channel ON distributions(channel);

ALTER TABLE distributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON distributions FOR ALL USING (true);

-- 이메일 발송 이력 테이블
CREATE TABLE IF NOT EXISTS email_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id uuid REFERENCES contents(id),
  subject text NOT NULL,
  template text NOT NULL DEFAULT 'newsletter',
  html_body text NOT NULL,
  recipient_count integer DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  attachments jsonb DEFAULT '[]'
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON email_logs FOR ALL USING (true);

-- posts 테이블에 content_id 컬럼 추가 (기존 데이터 호환)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_id uuid REFERENCES contents(id);
