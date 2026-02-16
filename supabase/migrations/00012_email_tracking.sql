-- T5: 이메일 열람/클릭 추적을 위한 스키마 변경

-- email_sends에 content_id 추가 (nullable, 레거시 호환)
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS content_id uuid REFERENCES contents(id);

-- email_sends에 opened_at, clicked_at이 없으면 추가
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS opened_at timestamptz;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS clicked_at timestamptz;

-- email_logs에 열람/클릭 집계 컬럼 추가
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS total_opens integer DEFAULT 0;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS total_clicks integer DEFAULT 0;

-- email_sends의 content_id 인덱스
CREATE INDEX IF NOT EXISTS idx_email_sends_content_id ON email_sends(content_id);
