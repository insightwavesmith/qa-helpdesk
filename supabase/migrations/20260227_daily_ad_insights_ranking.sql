-- D4: daily_ad_insights에 ranking 3종 + video_p100 컬럼 추가
-- TASK-데이터수집v2 D4 참조

ALTER TABLE daily_ad_insights
  ADD COLUMN IF NOT EXISTS quality_ranking TEXT DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS engagement_ranking TEXT DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS conversion_ranking TEXT DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS video_p100 INTEGER DEFAULT 0;
