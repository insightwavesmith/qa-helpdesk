-- Q&A 지식베이스 서비스 - RLS 정책
-- Created: 2026-02-04

-- ============================================
-- 헬퍼 함수: 현재 사용자 역할 확인
-- ============================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_approved_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('approved', 'admin')
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================
-- profiles 테이블 RLS
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 본인 프로필 조회
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- 승인된 사용자는 다른 프로필도 조회 가능
CREATE POLICY "Approved users can view others"
  ON profiles FOR SELECT
  USING (is_approved_user());

-- 회원가입 시 프로필 생성
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 본인 프로필 수정
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 관리자는 모든 프로필 수정 가능 (역할 변경 등)
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (is_admin());

-- ============================================
-- categories 테이블 RLS
-- ============================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- 승인된 사용자만 카테고리 조회
CREATE POLICY "Approved users can view categories"
  ON categories FOR SELECT
  USING (is_approved_user());

-- 관리자만 카테고리 관리
CREATE POLICY "Admins can manage categories"
  ON categories FOR ALL
  USING (is_admin());

-- ============================================
-- questions 테이블 RLS
-- ============================================
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- 승인된 사용자만 질문 조회
CREATE POLICY "Approved users can view questions"
  ON questions FOR SELECT
  USING (is_approved_user());

-- 승인된 사용자만 질문 작성
CREATE POLICY "Approved users can create questions"
  ON questions FOR INSERT
  WITH CHECK (is_approved_user() AND auth.uid() = author_id);

-- 본인 질문만 수정
CREATE POLICY "Users can update own questions"
  ON questions FOR UPDATE
  USING (auth.uid() = author_id);

-- 관리자는 모든 질문 수정 가능
CREATE POLICY "Admins can update any question"
  ON questions FOR UPDATE
  USING (is_admin());

-- 본인 질문만 삭제
CREATE POLICY "Users can delete own questions"
  ON questions FOR DELETE
  USING (auth.uid() = author_id);

-- 관리자는 모든 질문 삭제 가능
CREATE POLICY "Admins can delete any question"
  ON questions FOR DELETE
  USING (is_admin());

-- ============================================
-- answers 테이블 RLS
-- ============================================
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

-- 승인된 사용자만 답변 조회
CREATE POLICY "Approved users can view answers"
  ON answers FOR SELECT
  USING (is_approved_user());

-- 승인된 사용자만 답변 작성
CREATE POLICY "Approved users can create answers"
  ON answers FOR INSERT
  WITH CHECK (is_approved_user() AND (auth.uid() = author_id OR author_id IS NULL));

-- 본인 답변만 수정
CREATE POLICY "Users can update own answers"
  ON answers FOR UPDATE
  USING (auth.uid() = author_id);

-- 관리자는 모든 답변 수정 가능 (승인 포함)
CREATE POLICY "Admins can update any answer"
  ON answers FOR UPDATE
  USING (is_admin());

-- 본인 답변만 삭제
CREATE POLICY "Users can delete own answers"
  ON answers FOR DELETE
  USING (auth.uid() = author_id);

-- 관리자는 모든 답변 삭제 가능
CREATE POLICY "Admins can delete any answer"
  ON answers FOR DELETE
  USING (is_admin());

-- ============================================
-- posts 테이블 RLS
-- ============================================
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- 승인된 사용자만 공개된 게시글 조회
CREATE POLICY "Approved users can view published posts"
  ON posts FOR SELECT
  USING (is_approved_user() AND (is_published = TRUE OR auth.uid() = author_id));

-- 관리자는 모든 게시글 조회
CREATE POLICY "Admins can view all posts"
  ON posts FOR SELECT
  USING (is_admin());

-- 승인된 사용자만 게시글 작성
CREATE POLICY "Approved users can create posts"
  ON posts FOR INSERT
  WITH CHECK (is_approved_user() AND auth.uid() = author_id);

-- 본인 게시글만 수정
CREATE POLICY "Users can update own posts"
  ON posts FOR UPDATE
  USING (auth.uid() = author_id);

-- 관리자는 모든 게시글 수정 가능 (승인/고정 포함)
CREATE POLICY "Admins can update any post"
  ON posts FOR UPDATE
  USING (is_admin());

-- 본인 게시글만 삭제
CREATE POLICY "Users can delete own posts"
  ON posts FOR DELETE
  USING (auth.uid() = author_id);

-- 관리자는 모든 게시글 삭제 가능
CREATE POLICY "Admins can delete any post"
  ON posts FOR DELETE
  USING (is_admin());

-- ============================================
-- comments 테이블 RLS
-- ============================================
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 승인된 사용자만 댓글 조회
CREATE POLICY "Approved users can view comments"
  ON comments FOR SELECT
  USING (is_approved_user());

-- 승인된 사용자만 댓글 작성
CREATE POLICY "Approved users can create comments"
  ON comments FOR INSERT
  WITH CHECK (is_approved_user() AND auth.uid() = author_id);

-- 본인 댓글만 수정
CREATE POLICY "Users can update own comments"
  ON comments FOR UPDATE
  USING (auth.uid() = author_id);

-- 본인 댓글만 삭제
CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  USING (auth.uid() = author_id);

-- 관리자는 모든 댓글 삭제 가능
CREATE POLICY "Admins can delete any comment"
  ON comments FOR DELETE
  USING (is_admin());

-- ============================================
-- likes 테이블 RLS
-- ============================================
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

-- 승인된 사용자만 좋아요 조회
CREATE POLICY "Approved users can view likes"
  ON likes FOR SELECT
  USING (is_approved_user());

-- 승인된 사용자만 좋아요 생성
CREATE POLICY "Approved users can create likes"
  ON likes FOR INSERT
  WITH CHECK (is_approved_user() AND auth.uid() = user_id);

-- 본인 좋아요만 취소
CREATE POLICY "Users can delete own likes"
  ON likes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- lecture_chunks 테이블 RLS
-- ============================================
ALTER TABLE lecture_chunks ENABLE ROW LEVEL SECURITY;

-- 승인된 사용자만 강의 청크 조회 (RAG 검색용)
CREATE POLICY "Approved users can view lecture chunks"
  ON lecture_chunks FOR SELECT
  USING (is_approved_user());

-- 관리자만 강의 청크 관리
CREATE POLICY "Admins can manage lecture chunks"
  ON lecture_chunks FOR ALL
  USING (is_admin());

-- ============================================
-- notification_preferences 테이블 RLS
-- ============================================
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- 본인 알림 설정만 조회
CREATE POLICY "Users can view own notification preferences"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

-- 본인 알림 설정만 생성
CREATE POLICY "Users can create own notification preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 본인 알림 설정만 수정
CREATE POLICY "Users can update own notification preferences"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);
