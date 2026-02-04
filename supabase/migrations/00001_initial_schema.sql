-- Q&A 지식베이스 서비스 - 초기 스키마
-- Created: 2026-02-04

-- pgvector 확장 활성화 (벡터 유사도 검색용)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 1. profiles 테이블 (사용자 프로필)
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  shop_url TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  business_number TEXT NOT NULL,
  business_cert_url TEXT,          -- 사업자등록증 이미지 URL (Supabase Storage)
  cohort TEXT,                     -- 수강 기수
  monthly_ad_budget TEXT,          -- 월 광고비 규모 (선택)
  category TEXT,                   -- 주요 판매 카테고리 (선택)
  role TEXT NOT NULL DEFAULT 'pending' CHECK (role IN ('pending', 'approved', 'admin', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. categories 테이블 (질문 카테고리)
-- ============================================
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INT DEFAULT 0
);

-- 기본 카테고리 시드 데이터
INSERT INTO categories (name, slug, sort_order) VALUES
  ('메타 광고 기초', 'meta-basics', 1),
  ('CAPI', 'capi', 2),
  ('카탈로그', 'catalog', 3),
  ('ASC', 'asc', 4),
  ('크리에이티브', 'creative', 5),
  ('픽셀/전환API', 'pixel-conversion', 6),
  ('자사몰 운영', 'shop-operation', 7),
  ('기타', 'etc', 8);

-- ============================================
-- 3. questions 테이블 (질문)
-- ============================================
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id),
  category_id INT REFERENCES categories(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(768),          -- Gemini text-embedding-004 벡터
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  view_count INT DEFAULT 0,
  like_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. answers 테이블 (답변)
-- ============================================
CREATE TABLE answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id), -- NULL이면 AI 답변
  content TEXT NOT NULL,
  is_ai BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT FALSE,      -- Smith님 승인 여부
  approved_at TIMESTAMPTZ,
  source_refs JSONB,                      -- AI 답변일 때 참고 강의 출처
  like_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. posts 테이블 (정보 공유 블로그)
-- ============================================
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID REFERENCES profiles(id), -- NULL이면 모찌(시스템) 작성
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'info' CHECK (category IN ('info', 'notice', 'webinar')),
  is_published BOOLEAN DEFAULT FALSE,     -- 승인 후 공개
  is_pinned BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  view_count INT DEFAULT 0,
  like_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. comments 테이블 (댓글 - posts/questions 공통)
-- ============================================
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (post_id IS NOT NULL OR question_id IS NOT NULL)
);

-- ============================================
-- 7. likes 테이블 (좋아요)
-- ============================================
CREATE TABLE likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  answer_id UUID REFERENCES answers(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, question_id),
  UNIQUE(user_id, answer_id),
  UNIQUE(user_id, post_id)
);

-- ============================================
-- 8. lecture_chunks 테이블 (RAG용 강의 청크)
-- ============================================
CREATE TABLE lecture_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_name TEXT NOT NULL,
  week TEXT NOT NULL,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(768),          -- Gemini text-embedding-004 벡터
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. notification_preferences 테이블 (알림 설정)
-- ============================================
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) UNIQUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  slack_webhook_url TEXT,
  notify_new_post BOOLEAN DEFAULT TRUE,
  notify_answer BOOLEAN DEFAULT TRUE,
  notify_notice BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 인덱스
-- ============================================
CREATE INDEX idx_questions_author ON questions(author_id);
CREATE INDEX idx_questions_category ON questions(category_id);
CREATE INDEX idx_questions_status ON questions(status);
CREATE INDEX idx_questions_created ON questions(created_at DESC);
CREATE INDEX idx_answers_question ON answers(question_id);
CREATE INDEX idx_answers_author ON answers(author_id);
CREATE INDEX idx_posts_category ON posts(category);
CREATE INDEX idx_posts_published ON posts(is_published, published_at DESC);
CREATE INDEX idx_comments_post ON comments(post_id);
CREATE INDEX idx_comments_question ON comments(question_id);
CREATE INDEX idx_likes_user ON likes(user_id);
CREATE INDEX idx_lecture_chunks_lecture ON lecture_chunks(lecture_name, week);

-- 벡터 인덱스 (IVFFlat - 데이터 쌓인 후 활성화 권장)
-- CREATE INDEX idx_questions_embedding ON questions USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- CREATE INDEX idx_lecture_chunks_embedding ON lecture_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- updated_at 자동 갱신 트리거
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_questions_updated_at
  BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_answers_updated_at
  BEFORE UPDATE ON answers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
