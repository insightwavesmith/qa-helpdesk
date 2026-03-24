-- =============================================================
-- Meta API 전체 필드 수집 확장
-- video 재생 5개 + frequency/cpm/cpp 컬럼 추가 + 트리거 업데이트
-- =============================================================

-- 1. daily_ad_insights 컬럼 추가
ALTER TABLE daily_ad_insights ADD COLUMN IF NOT EXISTS video_p25 INTEGER;
ALTER TABLE daily_ad_insights ADD COLUMN IF NOT EXISTS video_p50 INTEGER;
ALTER TABLE daily_ad_insights ADD COLUMN IF NOT EXISTS video_p75 INTEGER;
ALTER TABLE daily_ad_insights ADD COLUMN IF NOT EXISTS video_p3s INTEGER;
ALTER TABLE daily_ad_insights ADD COLUMN IF NOT EXISTS video_avg_time FLOAT;
ALTER TABLE daily_ad_insights ADD COLUMN IF NOT EXISTS frequency FLOAT;
ALTER TABLE daily_ad_insights ADD COLUMN IF NOT EXISTS cpm FLOAT;
ALTER TABLE daily_ad_insights ADD COLUMN IF NOT EXISTS cpp FLOAT;

-- 2. 트리거 함수 업데이트 (기존 + 신규 필드)
CREATE OR REPLACE FUNCTION fn_extract_daily_metrics()
RETURNS TRIGGER AS $$
DECLARE
  _impressions bigint;
  _clicks integer;
  _spend numeric;
  _reach integer;
  _actions jsonb;
  _action_values jsonb;
  _video_thruplay jsonb;
  _video_p100 jsonb;
  _purchases integer;
  _purchase_value numeric;
  _initiate_checkout integer;
  _video_p3s integer;
  _thruplay integer;
  _p100 integer;
  _reactions integer;
  _comments integer;
  _shares integer;
  _saves integer;
  -- 신규 변수
  _video_p25_arr jsonb;
  _video_p50_arr jsonb;
  _video_p75_arr jsonb;
  _video_p3s_arr jsonb;
  _video_avg_arr jsonb;
  _video_p25 integer;
  _video_p50 integer;
  _video_p75 integer;
  _video_p3s_direct integer;
  _video_avg_time numeric;
BEGIN
  -- raw_insight가 없으면 기존 방식 유지 (하위 호환)
  IF NEW.raw_insight IS NULL THEN
    RETURN NEW;
  END IF;

  -- 기본 지표 추출
  _impressions := COALESCE((NEW.raw_insight->>'impressions')::bigint, 0);
  _clicks := COALESCE((NEW.raw_insight->>'clicks')::integer, 0);
  _spend := COALESCE((NEW.raw_insight->>'spend')::numeric, 0);
  _reach := COALESCE((NEW.raw_insight->>'reach')::integer, 0);
  _actions := COALESCE(NEW.raw_insight->'actions', '[]'::jsonb);
  _action_values := COALESCE(NEW.raw_insight->'action_values', '[]'::jsonb);
  _video_thruplay := COALESCE(NEW.raw_insight->'video_thruplay_watched_actions', '[]'::jsonb);
  _video_p100 := COALESCE(NEW.raw_insight->'video_p100_watched_actions', '[]'::jsonb);

  -- 신규 비디오 배열
  _video_p25_arr := COALESCE(NEW.raw_insight->'video_p25_watched_actions', '[]'::jsonb);
  _video_p50_arr := COALESCE(NEW.raw_insight->'video_p50_watched_actions', '[]'::jsonb);
  _video_p75_arr := COALESCE(NEW.raw_insight->'video_p75_watched_actions', '[]'::jsonb);
  _video_p3s_arr := COALESCE(NEW.raw_insight->'video_p3s_watched_actions', '[]'::jsonb);
  _video_avg_arr := COALESCE(NEW.raw_insight->'video_avg_time_watched_actions', '[]'::jsonb);

  -- actions 배열에서 값 추출
  SELECT COALESCE(SUM((a->>'value')::integer), 0) INTO _purchases
  FROM jsonb_array_elements(_actions) a
  WHERE a->>'action_type' IN ('purchase', 'omni_purchase');

  SELECT COALESCE(SUM((a->>'value')::numeric), 0) INTO _purchase_value
  FROM jsonb_array_elements(_action_values) a
  WHERE a->>'action_type' IN ('purchase', 'omni_purchase');

  SELECT COALESCE(SUM((a->>'value')::integer), 0) INTO _initiate_checkout
  FROM jsonb_array_elements(_actions) a
  WHERE a->>'action_type' IN ('initiate_checkout', 'omni_initiated_checkout');

  SELECT COALESCE(SUM((a->>'value')::integer), 0) INTO _video_p3s
  FROM jsonb_array_elements(_actions) a
  WHERE a->>'action_type' = 'video_view';

  SELECT COALESCE(SUM((a->>'value')::integer), 0) INTO _thruplay
  FROM jsonb_array_elements(_video_thruplay) a;

  SELECT COALESCE(SUM((a->>'value')::integer), 0) INTO _p100
  FROM jsonb_array_elements(_video_p100) a;

  SELECT COALESCE(SUM((a->>'value')::integer), 0) INTO _reactions
  FROM jsonb_array_elements(_actions) a
  WHERE a->>'action_type' IN ('post_reaction', 'like');

  SELECT COALESCE(SUM((a->>'value')::integer), 0) INTO _comments
  FROM jsonb_array_elements(_actions) a
  WHERE a->>'action_type' = 'comment';

  SELECT COALESCE(SUM((a->>'value')::integer), 0) INTO _shares
  FROM jsonb_array_elements(_actions) a
  WHERE a->>'action_type' = 'post';

  SELECT COALESCE(SUM((a->>'value')::integer), 0) INTO _saves
  FROM jsonb_array_elements(_actions) a
  WHERE a->>'action_type' = 'onsite_conversion.post_save';

  -- 신규 비디오 필드 추출
  SELECT COALESCE(SUM((a->>'value')::integer), 0) INTO _video_p25
  FROM jsonb_array_elements(_video_p25_arr) a;

  SELECT COALESCE(SUM((a->>'value')::integer), 0) INTO _video_p50
  FROM jsonb_array_elements(_video_p50_arr) a;

  SELECT COALESCE(SUM((a->>'value')::integer), 0) INTO _video_p75
  FROM jsonb_array_elements(_video_p75_arr) a;

  SELECT COALESCE(SUM((a->>'value')::integer), 0) INTO _video_p3s_direct
  FROM jsonb_array_elements(_video_p3s_arr) a;

  -- video_avg_time: 첫 번째 요소의 value (초 단위)
  SELECT (a->>'value')::numeric INTO _video_avg_time
  FROM jsonb_array_elements(_video_avg_arr) a
  LIMIT 1;

  -- 기존 컬럼에 값 설정
  NEW.impressions := _impressions;
  NEW.clicks := _clicks;
  NEW.spend := round(_spend, 2);
  NEW.reach := _reach;
  NEW.ctr := round(COALESCE((NEW.raw_insight->>'ctr')::numeric, 0), 4);
  NEW.purchases := _purchases;
  NEW.purchase_value := round(_purchase_value, 2);
  NEW.roas := CASE WHEN _spend > 0 THEN round(_purchase_value / _spend, 4) ELSE 0 END;
  NEW.initiate_checkout := _initiate_checkout;
  NEW.video_p100 := _p100;

  -- 비율 지표 (분모 > 0 체크)
  NEW.video_p3s_rate := CASE WHEN _impressions > 0 THEN round(_video_p3s::numeric / _impressions * 100, 4) ELSE NULL END;
  NEW.thruplay_rate := CASE WHEN _impressions > 0 THEN round(_thruplay::numeric / _impressions * 100, 4) ELSE NULL END;
  NEW.retention_rate := CASE WHEN _video_p3s > 0 THEN round(_p100::numeric / _video_p3s * 100, 4) ELSE NULL END;

  NEW.reactions_per_10k := CASE WHEN _impressions > 0 THEN round(_reactions::numeric / _impressions * 10000, 2) ELSE NULL END;
  NEW.comments_per_10k := CASE WHEN _impressions > 0 THEN round(_comments::numeric / _impressions * 10000, 2) ELSE NULL END;
  NEW.shares_per_10k := CASE WHEN _impressions > 0 THEN round(_shares::numeric / _impressions * 10000, 2) ELSE NULL END;
  NEW.saves_per_10k := CASE WHEN _impressions > 0 THEN round(_saves::numeric / _impressions * 10000, 2) ELSE NULL END;
  NEW.engagement_per_10k := CASE WHEN _impressions > 0 THEN round((_reactions + _comments + _shares + _saves)::numeric / _impressions * 10000, 2) ELSE NULL END;

  NEW.click_to_checkout_rate := CASE WHEN _clicks > 0 THEN round(_initiate_checkout::numeric / _clicks * 100, 4) ELSE NULL END;
  NEW.click_to_purchase_rate := CASE WHEN _clicks > 0 THEN round(_purchases::numeric / _clicks * 100, 4) ELSE NULL END;
  NEW.checkout_to_purchase_rate := CASE WHEN _initiate_checkout > 0 THEN round(_purchases::numeric / _initiate_checkout * 100, 4) ELSE NULL END;
  NEW.reach_to_purchase_rate := CASE WHEN _impressions > 0 THEN round(_purchases::numeric / _impressions * 100, 6) ELSE NULL END;

  -- 신규 컬럼 설정
  NEW.video_p25 := _video_p25;
  NEW.video_p50 := _video_p50;
  NEW.video_p75 := _video_p75;
  NEW.video_p3s := CASE WHEN _video_p3s_direct > 0 THEN _video_p3s_direct ELSE _video_p3s END;
  NEW.video_avg_time := _video_avg_time;
  NEW.frequency := COALESCE((NEW.raw_insight->>'frequency')::float, NULL);
  NEW.cpm := COALESCE((NEW.raw_insight->>'cpm')::float, NULL);
  NEW.cpp := COALESCE((NEW.raw_insight->>'cpp')::float, NULL);

  -- raw_ad에서 추출
  IF NEW.raw_ad IS NOT NULL THEN
    NEW.campaign_id := COALESCE(NEW.campaign_id, NEW.raw_ad->>'campaign_id');
    NEW.campaign_name := COALESCE(NEW.campaign_name, NEW.raw_ad->>'campaign_name');
    NEW.adset_id := COALESCE(NEW.adset_id, NEW.raw_ad->>'adset_id');
    NEW.adset_name := COALESCE(NEW.adset_name, NEW.raw_ad->>'adset_name');
    NEW.ad_name := COALESCE(NEW.ad_name, NEW.raw_ad->>'name', NEW.raw_ad->>'ad_name');
    NEW.quality_ranking := COALESCE(NEW.quality_ranking, NEW.raw_insight->>'quality_ranking');
    NEW.engagement_ranking := COALESCE(NEW.engagement_ranking, NEW.raw_insight->>'engagement_rate_ranking');
    NEW.conversion_ranking := COALESCE(NEW.conversion_ranking, NEW.raw_insight->>'conversion_rate_ranking');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 재생성 (함수 업데이트로 자동 적용되지만 명시적으로)
DROP TRIGGER IF EXISTS trg_extract_daily_metrics ON daily_ad_insights;
CREATE TRIGGER trg_extract_daily_metrics
  BEFORE INSERT OR UPDATE ON daily_ad_insights
  FOR EACH ROW
  EXECUTE FUNCTION fn_extract_daily_metrics();
