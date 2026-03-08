-- 초대코드 가입 시 invite_code_used 저장 + used_count 증가 근본 수정
-- 2026-03-09
--
-- 문제: 가입한 5명 전부 profiles.invite_code_used = NULL, invite_codes.used_count 미증가
-- 원인: handle_new_user 트리거가 invite_code_used 미저장 + useInviteCode 서버액션 silent failure
-- 수정: (A) 트리거에 invite_code_used 추가, (B) RPC 함수로 원자적 처리, (C) 기존 데이터 복구

-- ============================================
-- A. handle_new_user 트리거 업데이트
--    invite_code_used 컬럼을 INSERT에 추가
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, name, phone, shop_url, shop_name, business_number, cohort,
    invite_code_used,
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
    NULLIF(NEW.raw_user_meta_data->>'invite_code', ''),
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

-- ============================================
-- B. consume_invite_code RPC 함수
--    단일 트랜잭션 + FOR UPDATE 행잠금으로 원자적 처리
-- ============================================
CREATE OR REPLACE FUNCTION consume_invite_code(
  p_user_id UUID,
  p_email TEXT,
  p_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_current_used INT;
BEGIN
  -- 1. 초대코드 조회 + 행 잠금 (동시성 보장)
  SELECT code, cohort, max_uses, used_count, expires_at
  INTO v_invite
  FROM invite_codes
  WHERE LOWER(code) = LOWER(TRIM(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '유효하지 않은 초대코드입니다');
  END IF;

  -- 2. 만료 체크
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
    RETURN jsonb_build_object('error', '초대코드가 만료되었습니다');
  END IF;

  -- 3. 사용 횟수 체크
  v_current_used := COALESCE(v_invite.used_count, 0);
  IF v_invite.max_uses IS NOT NULL AND v_current_used >= v_invite.max_uses THEN
    RETURN jsonb_build_object('error', '초대코드 사용 한도를 초과했습니다');
  END IF;

  -- 4. used_count 원자적 증가
  UPDATE invite_codes
  SET used_count = v_current_used + 1
  WHERE LOWER(code) = LOWER(TRIM(p_code));

  -- 5. profiles 업데이트: invite_code_used + cohort
  UPDATE profiles
  SET invite_code_used = TRIM(p_code),
      cohort = v_invite.cohort
  WHERE id = p_user_id;

  -- 6. student_registry 이메일 매칭 시도
  UPDATE student_registry
  SET matched_profile_id = p_user_id
  WHERE LOWER(email) = LOWER(p_email)
    AND matched_profile_id IS NULL;

  RETURN jsonb_build_object('error', NULL);
END;
$$;

-- ============================================
-- C. 기존 가입자 데이터 복구
--    auth.users 메타데이터에서 invite_code 추출 → profiles 업데이트
-- ============================================

-- C1. invite_code_used가 NULL인 수강생(role=student) 프로필 복구
UPDATE profiles p
SET invite_code_used = u.raw_user_meta_data->>'invite_code'
FROM auth.users u
WHERE p.id = u.id
  AND p.invite_code_used IS NULL
  AND p.role = 'student'
  AND u.raw_user_meta_data->>'invite_code' IS NOT NULL
  AND u.raw_user_meta_data->>'invite_code' != '';

-- C2. invite_codes.used_count를 실제 사용량으로 재계산
UPDATE invite_codes ic
SET used_count = sub.actual_count
FROM (
  SELECT LOWER(invite_code_used) AS code_lower, COUNT(*) AS actual_count
  FROM profiles
  WHERE invite_code_used IS NOT NULL
  GROUP BY LOWER(invite_code_used)
) sub
WHERE LOWER(ic.code) = sub.code_lower
  AND COALESCE(ic.used_count, 0) != sub.actual_count;
