-- STEP 2: creative_media에 5축 분석 결과 저장 컬럼 추가
-- analysis_json: Gemini 3.1 Pro 분석 결과 (5축 JSON)
-- analyzed_at: 분석 실행 시각
-- analysis_model: 분석에 사용한 모델명

ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS analysis_json jsonb;
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS analysis_model text;

COMMENT ON COLUMN creative_media.analysis_json IS '5축 분석 결과 JSON (hook, product, color, text, composition)';
COMMENT ON COLUMN creative_media.analyzed_at IS '분석 실행 시각';
COMMENT ON COLUMN creative_media.analysis_model IS '분석 모델명 (e.g., gemini-3.1-pro-preview)';
