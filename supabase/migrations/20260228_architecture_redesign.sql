-- TASK-아키텍처재설계: A1 + A4 마이그레이션
-- 에이전트팀 작성, 모찌 실행

-- ═══════════════════════════════════════════════════
-- A1: daily_ad_insights UPSERT를 위한 unique constraint
-- ═══════════════════════════════════════════════════
ALTER TABLE daily_ad_insights
ADD CONSTRAINT IF NOT EXISTS daily_ad_insights_unique
UNIQUE (account_id, date, ad_id);

-- ═══════════════════════════════════════════════════
-- A4: benchmarks 테이블 date 컬럼 + unique constraint
-- ═══════════════════════════════════════════════════
ALTER TABLE benchmarks ADD COLUMN IF NOT EXISTS date DATE;

-- 기존 데이터: calculated_at 날짜를 date로 채움
UPDATE benchmarks SET date = calculated_at::date WHERE date IS NULL;

-- UPSERT를 위한 unique constraint
ALTER TABLE benchmarks
ADD CONSTRAINT IF NOT EXISTS benchmarks_unique
UNIQUE (creative_type, ranking_type, ranking_group, date);
