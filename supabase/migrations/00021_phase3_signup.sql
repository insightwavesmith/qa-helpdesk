-- Phase 3: 회원가입 리팩토링 + 초대코드 + 미들웨어 + 온보딩
-- 2026-02-20

-- ============================================
-- 1. profiles 컬럼 추가
-- ============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'not_started'
  CHECK (onboarding_status IN ('not_started', 'in_progress', 'completed'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invite_code_used TEXT;

-- 2. 기존 onboarding_completed → onboarding_status 데이터 마이그레이션
UPDATE profiles SET onboarding_status = CASE
  WHEN onboarding_completed = true THEN 'completed'
  ELSE 'not_started'
END;

-- 3. NOT NULL 해제 (lead 간소화 가입에서 미입력 허용)
ALTER TABLE profiles ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN shop_url DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN shop_name DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN business_number DROP NOT NULL;

-- ============================================
-- 4. role CHECK 제약 업데이트 (안전하게 재생성)
-- ============================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('lead', 'member', 'student', 'alumni', 'admin', 'pending', 'approved', 'rejected'));

ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'lead';

-- ============================================
-- 5. Auth trigger: 가입 시 role 분기
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, name, phone, shop_url, shop_name, business_number, cohort,
    role, onboarding_status, onboarding_step
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'shop_url',
    NEW.raw_user_meta_data->>'shop_name',
    NEW.raw_user_meta_data->>'business_number',
    NEW.raw_user_meta_data->>'cohort',
    (CASE
      WHEN NEW.raw_user_meta_data->>'invite_code' IS NOT NULL
        AND NEW.raw_user_meta_data->>'invite_code' != ''
      THEN 'student'
      ELSE 'lead'
    END)::user_role,
    CASE
      WHEN NEW.raw_user_meta_data->>'invite_code' IS NOT NULL
        AND NEW.raw_user_meta_data->>'invite_code' != ''
      THEN 'not_started'
      ELSE 'not_started'
    END,
    0
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- 6. is_approved_user() 업데이트 — 새 역할 체계 반영
-- ============================================
CREATE OR REPLACE FUNCTION is_approved_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('lead', 'member', 'student', 'alumni', 'admin')
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- ============================================
-- 7. invite_codes RLS 정책
-- ============================================
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage invite codes" ON invite_codes;
CREATE POLICY "Admins can manage invite codes"
  ON invite_codes FOR ALL USING (is_admin());

-- ============================================
-- 8. student_registry RLS 정책
-- ============================================
ALTER TABLE student_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage student registry" ON student_registry;
CREATE POLICY "Admins can manage student registry"
  ON student_registry FOR ALL USING (is_admin());
