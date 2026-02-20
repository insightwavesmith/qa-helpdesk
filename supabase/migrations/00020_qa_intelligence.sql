-- T0: QA 지능화 — 부분 인덱스 + 안전 컬럼 추가

-- questions.image_urls 안전 처리 (이미 있을 수 있음)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_urls jsonb DEFAULT '[]'::jsonb;

-- knowledge_chunks 부분 인덱스 (qa_question/qa_answer 빠른 조회)
CREATE INDEX IF NOT EXISTS idx_kc_qa_question ON knowledge_chunks(source_type)
  WHERE source_type = 'qa_question';

CREATE INDEX IF NOT EXISTS idx_kc_qa_answer ON knowledge_chunks(source_type)
  WHERE source_type = 'qa_answer';

CREATE INDEX IF NOT EXISTS idx_kc_metadata_question_id ON knowledge_chunks((metadata->>'question_id'))
  WHERE metadata->>'question_id' IS NOT NULL;
