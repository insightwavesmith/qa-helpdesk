-- newsletter_segments: 뉴스레터 수신자 세그먼트 정의

CREATE TABLE IF NOT EXISTS newsletter_segments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  filter_rules jsonb NOT NULL DEFAULT '{}',
  is_default boolean NOT NULL DEFAULT false,
  member_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS 활성화
ALTER TABLE newsletter_segments ENABLE ROW LEVEL SECURITY;

-- 관리자만 접근
CREATE POLICY "admin_only" ON newsletter_segments
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- updated_at 자동 갱신 트리거
CREATE TRIGGER update_newsletter_segments_updated_at
  BEFORE UPDATE ON newsletter_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 기본 세그먼트 시드 데이터
INSERT INTO newsletter_segments (name, description, filter_rules, is_default)
VALUES
  ('all',       '전체 구독자',  '{}'::jsonb,                  true),
  ('students',  '현재 수강생',  '{"role": "student"}'::jsonb, false),
  ('prospects', '잠재 고객',    '{"role": "prospect"}'::jsonb, false),
  ('alumni',    '수료생',       '{"role": "alumni"}'::jsonb,  false)
ON CONFLICT (name) DO NOTHING;
