-- channel_credentials: 채널별 OAuth 토큰/인증 정보 저장
-- 서비스 롤만 접근 (사용자 정책 미생성 — 토큰 보안)

CREATE TABLE IF NOT EXISTS channel_credentials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  channel text NOT NULL UNIQUE CHECK (channel IN ('naver_blog', 'naver_cafe', 'youtube', 'instagram')),
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  extra_config jsonb DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS 활성화 (사용자 정책 없음 → 일반 사용자/anon 전부 차단, 서비스 롤만 접근 가능)
ALTER TABLE channel_credentials ENABLE ROW LEVEL SECURITY;

-- updated_at 자동 갱신 트리거
CREATE TRIGGER update_channel_credentials_updated_at
  BEFORE UPDATE ON channel_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
