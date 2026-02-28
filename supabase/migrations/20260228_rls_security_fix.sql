-- T1: RLS 보안 수정 — 미설정 테이블 RLS 활성화 + 정책 추가
-- 보안 코드리뷰 보고서 기반, defense-in-depth 적용
-- 주의: protractor API는 createServiceClient() 사용하여 RLS 우회됨

-- ═══════════════════════════════════════════════════
-- 1. ad_accounts — user_id = auth.uid() 기반
-- ═══════════════════════════════════════════════════
ALTER TABLE ad_accounts ENABLE ROW LEVEL SECURITY;

-- 본인 계정만 조회
CREATE POLICY "Users can view own ad accounts"
  ON ad_accounts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 본인만 생성 (user_id 일치 강제)
CREATE POLICY "Users can insert own ad accounts"
  ON ad_accounts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 본인만 수정
CREATE POLICY "Users can update own ad accounts"
  ON ad_accounts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 본인만 삭제
CREATE POLICY "Users can delete own ad accounts"
  ON ad_accounts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- service_role 전체 접근 (크론/API용)
CREATE POLICY "Service role full access on ad_accounts"
  ON ad_accounts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════
-- 2. daily_ad_insights — account_id 기반 (user_id 없음, subquery)
-- ═══════════════════════════════════════════════════
ALTER TABLE daily_ad_insights ENABLE ROW LEVEL SECURITY;

-- 본인 계정의 인사이트만 조회
CREATE POLICY "Users can view own ad insights"
  ON daily_ad_insights FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM ad_accounts WHERE user_id = auth.uid()
    )
  );

-- service_role 전체 접근 (크론 수집용)
CREATE POLICY "Service role full access on daily_ad_insights"
  ON daily_ad_insights FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════
-- 3. service_secrets — user_id = auth.uid() 기반
-- ═══════════════════════════════════════════════════
ALTER TABLE service_secrets ENABLE ROW LEVEL SECURITY;

-- 본인 시크릿만 조회
CREATE POLICY "Users can view own secrets"
  ON service_secrets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 본인만 생성
CREATE POLICY "Users can insert own secrets"
  ON service_secrets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 본인만 수정
CREATE POLICY "Users can update own secrets"
  ON service_secrets FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 본인만 삭제
CREATE POLICY "Users can delete own secrets"
  ON service_secrets FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- service_role 전체 접근
CREATE POLICY "Service role full access on service_secrets"
  ON service_secrets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════
-- 4. daily_overlap_insights — 테이블 미존재, 생성 시 RLS 포함
-- ═══════════════════════════════════════════════════
-- NOTE: daily_overlap_insights 테이블은 아직 DB에 없음.
-- 향후 테이블 생성 마이그레이션에서 RLS를 함께 설정할 것.
-- 현재는 adset_overlap_cache가 대체 사용 중.

-- ═══════════════════════════════════════════════════
-- 5. invite_codes — 기존 admin 정책에 authenticated SELECT 추가
-- ═══════════════════════════════════════════════════

-- 인증된 사용자 SELECT 허용 (가입 시 초대코드 검증용)
CREATE POLICY "Authenticated users can view invite codes"
  ON invite_codes FOR SELECT
  TO authenticated
  USING (true);

-- ═══════════════════════════════════════════════════
-- 6. adset_overlap_cache — RLS ON인데 정책 0개 → 추가
-- ═══════════════════════════════════════════════════

-- service_role 전체 접근 (크론 캐시 저장용)
CREATE POLICY "Service role full access on adset_overlap_cache"
  ON adset_overlap_cache FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 본인 계정 캐시만 조회
CREATE POLICY "Users can view own overlap cache"
  ON adset_overlap_cache FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM ad_accounts WHERE user_id = auth.uid()
    )
  );
