-- 00008: 콘텐츠 카테고리 구조 정리
-- 실행: Supabase Dashboard SQL Editor

-- ============================================
-- 0. 백업 (롤백용)
-- ============================================
CREATE TABLE IF NOT EXISTS _backup_posts AS SELECT * FROM posts;
CREATE TABLE IF NOT EXISTS _backup_contents_category AS
  SELECT id, category FROM contents;

-- ============================================
-- 1. contents.category 데이터 마이그레이션
-- ============================================
-- news → notice
UPDATE contents SET category = 'notice' WHERE category = 'news';
-- case-study → case_study (하이픈 버전 통합)
UPDATE contents SET category = 'case_study' WHERE category = 'case-study';
-- webinar → case_study (가장 유사한 카테고리로 흡수)
UPDATE contents SET category = 'case_study' WHERE category = 'webinar';
-- recruitment → education (가장 유사한 카테고리로 흡수)
UPDATE contents SET category = 'education' WHERE category = 'recruitment';

-- ============================================
-- 2. contents.category CHECK 제약조건 교체
-- ============================================
ALTER TABLE contents DROP CONSTRAINT IF EXISTS contents_category_check;
ALTER TABLE contents ADD CONSTRAINT contents_category_check
  CHECK (category IN ('education', 'notice', 'case_study', 'newsletter'));

-- ============================================
-- 3. posts 테이블 삭제 (CASCADE로 FK 자동 정리)
-- ============================================
DROP TABLE IF EXISTS posts CASCADE;

-- ============================================
-- 4. comments 테이블 post_id 컬럼 정리
-- ============================================
ALTER TABLE comments DROP COLUMN IF EXISTS post_id;
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_check;
ALTER TABLE comments ADD CONSTRAINT comments_check
  CHECK (question_id IS NOT NULL);

-- ============================================
-- 5. likes 테이블 post_id 컬럼 정리
-- ============================================
ALTER TABLE likes DROP COLUMN IF EXISTS post_id;

-- ============================================
-- 6. debug_log 테이블 삭제
-- ============================================
DROP TABLE IF EXISTS debug_log;

-- ============================================
-- 7. qa_categories __temp_기타 정리
-- ============================================
DO $$
DECLARE
  temp_id INT;
  etc_id INT;
BEGIN
  SELECT id INTO temp_id FROM qa_categories WHERE name = '__temp_기타';
  IF temp_id IS NOT NULL THEN
    SELECT id INTO etc_id FROM qa_categories WHERE name = '기타';
    IF etc_id IS NOT NULL THEN
      UPDATE questions SET category_id = etc_id WHERE category_id = temp_id;
    END IF;
    DELETE FROM qa_categories WHERE id = temp_id;
  END IF;
END $$;
