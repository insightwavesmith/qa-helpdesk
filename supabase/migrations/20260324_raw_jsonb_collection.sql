-- =============================================================
-- raw JSONB 수집 구조 전환
-- Meta API 응답 원본을 JSONB로 저장, 메트릭은 트리거로 자동 추출
-- =============================================================

-- 1. daily_ad_insights에 raw 컬럼 추가
ALTER TABLE daily_ad_insights ADD COLUMN IF NOT EXISTS raw_insight JSONB;
ALTER TABLE daily_ad_insights ADD COLUMN IF NOT EXISTS raw_ad JSONB;

-- 2. creatives에 raw 컬럼 추가
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS raw_creative JSONB;

-- 3. daily_ad_insights 메트릭 자동 추출 트리거
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

  -- actions 배열에서 값 추출 헬퍼 (인라인)
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

  -- 컬럼에 값 설정
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

-- 기존 트리거 제거 후 재생성
DROP TRIGGER IF EXISTS trg_extract_daily_metrics ON daily_ad_insights;
CREATE TRIGGER trg_extract_daily_metrics
  BEFORE INSERT OR UPDATE ON daily_ad_insights
  FOR EACH ROW
  EXECUTE FUNCTION fn_extract_daily_metrics();

-- 4. raw_insight GIN 인덱스 (향후 JSONB 쿼리 최적화)
CREATE INDEX IF NOT EXISTS idx_dai_raw_insight ON daily_ad_insights USING gin (raw_insight) WHERE raw_insight IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cr_raw_creative ON creatives USING gin (raw_creative) WHERE raw_creative IS NOT NULL;
