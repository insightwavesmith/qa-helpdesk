-- T5a: answers 테이블에 image_urls 컬럼 추가 (QA 답변 이미지 첨부용)
ALTER TABLE answers ADD COLUMN IF NOT EXISTS image_urls jsonb DEFAULT '[]'::jsonb;
