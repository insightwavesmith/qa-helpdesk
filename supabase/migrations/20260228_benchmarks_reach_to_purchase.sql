-- D1: benchmarks 테이블에 reach_to_purchase_rate 컬럼 추가
-- collect-benchmarks 크론잡과 benchmarks API에서 이미 사용 중이나 DB 컬럼이 누락되어 있음
-- 계산식: purchases / impressions × 100 (분모 = impressions)

ALTER TABLE benchmarks
ADD COLUMN IF NOT EXISTS reach_to_purchase_rate FLOAT8;
