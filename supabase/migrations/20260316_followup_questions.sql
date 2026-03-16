-- 20260316: 꼬리질문 (follow-up questions)
-- questions 테이블에 parent_question_id 추가

-- 1. parent_question_id 컬럼 추가
ALTER TABLE questions ADD COLUMN IF NOT EXISTS parent_question_id UUID REFERENCES questions(id) ON DELETE CASCADE;

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_questions_parent_question_id ON questions(parent_question_id);
