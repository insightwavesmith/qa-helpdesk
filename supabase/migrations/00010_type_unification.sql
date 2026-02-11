-- 00010: 콘텐츠 유형 체계 통합 (category×type 2축 → type 단일축 5가지)
-- 실행: Supabase Dashboard SQL Editor

-- ============================================
-- 1. 기존 type CHECK 제약 제거
-- ============================================
ALTER TABLE contents DROP CONSTRAINT IF EXISTS contents_type_check;

-- ============================================
-- 2. 기존 데이터 마이그레이션 (순서 중요)
-- ============================================
-- 2-1. result → case_study (고객사례로 흡수)
UPDATE contents SET type = 'case_study' WHERE type = 'result';

-- 2-2. category 기반 매핑 (promo는 보호)
UPDATE contents SET type = 'education' WHERE category = 'education' AND type = 'info';
UPDATE contents SET type = 'notice' WHERE category = 'notice' AND type NOT IN ('promo', 'case_study');
UPDATE contents SET type = 'case_study' WHERE category = 'case_study' AND type NOT IN ('promo', 'notice');

-- 2-3. 나머지 info → education (기본값)
UPDATE contents SET type = 'education' WHERE type NOT IN ('education', 'case_study', 'webinar', 'notice', 'promo');

-- ============================================
-- 3. 새 type CHECK 제약 (5가지)
-- ============================================
ALTER TABLE contents ADD CONSTRAINT contents_type_check
  CHECK (type IN ('education', 'case_study', 'webinar', 'notice', 'promo'));

-- ============================================
-- 4. category 컬럼은 유지 (deprecated)
-- ============================================
COMMENT ON COLUMN contents.category IS 'DEPRECATED: type 단일축으로 통합됨. 하위 호환용으로만 유지.';
