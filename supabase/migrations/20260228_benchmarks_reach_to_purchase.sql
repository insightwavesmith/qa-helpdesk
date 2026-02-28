-- D1: reach_to_purchase_rate 컬럼 추가 (두 테이블 모두)
-- collect-benchmarks 크론잡에서 calculateMetrics()가 reach_to_purchase_rate를 계산하지만
-- ad_insights_classified에 컬럼이 없어 INSERT 실패 → benchmarks까지 도달 못함
-- 계산식: purchases / impressions × 100 (분모 = impressions, reach 아님)

-- 1. ad_insights_classified: 크론잡 INSERT 대상
ALTER TABLE ad_insights_classified
ADD COLUMN IF NOT EXISTS reach_to_purchase_rate FLOAT8;

-- 2. benchmarks: 그룹 평균 저장 대상
ALTER TABLE benchmarks
ADD COLUMN IF NOT EXISTS reach_to_purchase_rate FLOAT8;
