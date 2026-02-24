-- email_sends RLS 활성화 (C6: 기존 email_logs 패턴과 동일)
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_email_sends" ON email_sends FOR ALL
  USING (auth.role() = 'service_role' OR is_admin())
  WITH CHECK (auth.role() = 'service_role' OR is_admin());
