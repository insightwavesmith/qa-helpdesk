-- 00022: Phase 3b 회원관리 전체 정비
-- profiles 컬럼 추가 + reviews 테이블 + alumni→member 마이그레이션

-- 1. profiles 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mixpanel_secret_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS annual_revenue TEXT;

-- 2. alumni → member 마이그레이션 (C-05 우려사항 반영)
-- DB enum에서 alumni는 제거하지 않음 (기존 데이터 호환)
-- 코드에서만 alumni 제거, DB 데이터는 member로 변환
UPDATE profiles SET role = 'member' WHERE role = 'alumni';

-- 3. reviews 테이블 생성
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- C-03: SET NULL로 안전 삭제
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_urls TEXT[] DEFAULT '{}',
  view_count INT DEFAULT 0,
  like_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. reviews RLS
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reviews"
  ON reviews FOR SELECT
  USING (true);

CREATE POLICY "Students can create reviews"
  ON reviews FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'student')
  );

CREATE POLICY "Authors can update own reviews"
  ON reviews FOR UPDATE
  USING (author_id = auth.uid());

CREATE POLICY "Admins can delete reviews"
  ON reviews FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 5. reviews updated_at 트리거
CREATE OR REPLACE FUNCTION update_reviews_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_reviews_updated_at();
