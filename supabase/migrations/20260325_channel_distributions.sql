-- channel_distributions: 원본 글 → 각 채널 변환/발행 이력 관리

CREATE TABLE IF NOT EXISTS channel_distributions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_post_id uuid NOT NULL REFERENCES organic_posts(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('naver_blog', 'naver_cafe', 'newsletter', 'youtube', 'instagram', 'google_seo')),
  transformed_title text,
  transformed_body text,
  transformed_metadata jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'review', 'approved', 'publishing', 'published', 'failed', 'rejected')),
  scheduled_at timestamptz,
  published_at timestamptz,
  external_id text,
  external_url text,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_distribution_unique UNIQUE (source_post_id, channel)
);

-- 조회 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_cd_source_post_id ON channel_distributions(source_post_id);
CREATE INDEX IF NOT EXISTS idx_cd_status ON channel_distributions(status);
CREATE INDEX IF NOT EXISTS idx_cd_scheduled ON channel_distributions(scheduled_at) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_cd_channel ON channel_distributions(channel);

-- RLS 활성화
ALTER TABLE channel_distributions ENABLE ROW LEVEL SECURITY;

-- 관리자만 접근 (서비스 레벨 접근 — 서비스 롤은 RLS 무시)
CREATE POLICY "admin_only" ON channel_distributions
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- updated_at 자동 갱신 트리거
CREATE TRIGGER update_channel_distributions_updated_at
  BEFORE UPDATE ON channel_distributions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
