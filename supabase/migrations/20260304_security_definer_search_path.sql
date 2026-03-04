-- SECURITY DEFINER 함수에 SET search_path = public 추가
-- Supabase Security Advisor 경고 해소
-- 함수 로직 변경 없음 — search_path 속성만 추가

-- ============================================
-- 1. debug_log_autonomous
-- ============================================
CREATE OR REPLACE FUNCTION public.debug_log_autonomous(p_msg text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM dblink_exec('dbname=postgres', format('INSERT INTO public.debug_log (msg) VALUES (%L)', p_msg));
END;
$function$;

-- ============================================
-- 2. get_user_role
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT role FROM profiles WHERE id = auth.uid()
$function$;

-- ============================================
-- 3. is_admin
-- ============================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
$function$;

-- ============================================
-- 4. is_member_or_above
-- ============================================
CREATE OR REPLACE FUNCTION public.is_member_or_above()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('member', 'student', 'alumni', 'admin'))
$function$;

-- ============================================
-- 5. is_student_or_above
-- ============================================
CREATE OR REPLACE FUNCTION public.is_student_or_above()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('student', 'alumni', 'admin'))
$function$;
