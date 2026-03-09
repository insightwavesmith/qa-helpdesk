-- 성능 개선 인덱스 일괄 생성
-- 실행: Supabase SQL Editor 또는 Management API

-- 질문/답변
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_is_approved ON answers(is_approved);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_category_id ON questions(category_id);

-- 광고 인사이트 (가장 크리티컬 — 복합 인덱스)
CREATE INDEX IF NOT EXISTS idx_daily_ad_insights_account_date ON daily_ad_insights(account_id, date);

-- 콘텐츠
CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status);
CREATE INDEX IF NOT EXISTS idx_contents_category ON contents(category);

-- 지식 베이스
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_id ON knowledge_chunks(content_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source_type ON knowledge_chunks(source_type, lecture_name);

-- 사용자/계정
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_user_id ON ad_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_account_id ON ad_accounts(account_id);
