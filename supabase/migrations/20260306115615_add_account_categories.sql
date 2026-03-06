-- 광고 계정 카테고리 분류 테이블
CREATE TABLE IF NOT EXISTS account_categories (
  account_id text PRIMARY KEY,
  category text NOT NULL,
  confidence real DEFAULT 1.0,
  signals jsonb DEFAULT '{}',
  classified_at timestamptz DEFAULT now(),
  classified_by text DEFAULT 'auto'
);

-- benchmarks에 category 컬럼 추가
ALTER TABLE benchmarks ADD COLUMN IF NOT EXISTS category text;

-- benchmarks unique constraint에 category 포함 (기존 constraint 교체)
ALTER TABLE benchmarks DROP CONSTRAINT IF EXISTS benchmarks_unique;
ALTER TABLE benchmarks
ADD CONSTRAINT benchmarks_unique
UNIQUE (creative_type, ranking_type, ranking_group, date, category);

-- 기존 benchmarks 데이터 중 category가 null인 건 'uncategorized'로 채움
UPDATE benchmarks SET category = 'uncategorized' WHERE category IS NULL;

-- 코멘트
COMMENT ON TABLE account_categories IS '광고 계정 카테고리 분류 (멀티시그널 AI 종합판단)';
COMMENT ON COLUMN account_categories.confidence IS '분류 신뢰도 0~1';
COMMENT ON COLUMN account_categories.signals IS '분류 근거 {page_category, landing_url, ad_text, account_name}';
COMMENT ON COLUMN account_categories.classified_by IS 'auto 또는 manual';
