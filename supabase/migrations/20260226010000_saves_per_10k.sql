-- saves_per_10k 컬럼 추가 (daily_ad_insights)
-- 참여 지표에 saves(저장) 포함: engagement = reactions + comments + shares + saves
ALTER TABLE daily_ad_insights
  ADD COLUMN IF NOT EXISTS saves_per_10k float8;
