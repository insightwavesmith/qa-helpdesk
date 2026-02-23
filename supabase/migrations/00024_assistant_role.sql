-- 00024: assistant(조교) role 추가
-- admin(전체관리) + assistant(조교) 2단계 권한 체계

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('lead', 'member', 'student', 'assistant', 'admin', 'pending', 'approved', 'rejected', 'inactive'));
