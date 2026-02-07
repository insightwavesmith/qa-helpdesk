-- Step 2: type 컬럼 추가 + category 매핑 (설계서 §1 기준)

-- type 컬럼 추가
ALTER TABLE contents ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'info';

-- CHECK 제약조건
ALTER TABLE contents ADD CONSTRAINT contents_type_check
  CHECK (type IN ('info', 'result', 'promo'));

-- Step 8: 기존 데이터 category 매핑 (설계서 §1 카테고리 매핑 테이블)
UPDATE contents SET category = 'education', type = 'info' WHERE category = 'general';
UPDATE contents SET category = 'news', type = 'info' WHERE category = 'meta-update';
UPDATE contents SET category = 'education', type = 'info' WHERE category = 'meta-ads';
UPDATE contents SET category = 'education', type = 'info' WHERE category = 'social-marketing';
UPDATE contents SET category = 'education', type = 'info' WHERE category = 'paid-media';
UPDATE contents SET category = 'education', type = 'info' WHERE category = 'blueprint';
UPDATE contents SET category = 'news', type = 'info' WHERE category = 'trend';
UPDATE contents SET category = 'education', type = 'info' WHERE category = 'insight';

-- category CHECK 제약조건
ALTER TABLE contents DROP CONSTRAINT IF EXISTS contents_category_check;
ALTER TABLE contents ADD CONSTRAINT contents_category_check
  CHECK (category IN ('education', 'news', 'case-study', 'webinar', 'recruitment'));
