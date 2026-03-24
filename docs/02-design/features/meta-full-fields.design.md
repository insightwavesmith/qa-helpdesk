# Meta API 전체 필드 수집 확장 — Design

## 1. 데이터 모델

### 1.1 INSIGHT_FIELDS (기존 12 → 30개)
```typescript
export const INSIGHT_FIELDS = [
  // 기본 지표
  "spend", "impressions", "clicks", "ctr", "reach", "frequency",
  // 액션/가치 (JSONB 배열)
  "actions", "action_values", "cost_per_action_type",
  // 동영상 지표
  "video_thruplay_watched_actions", "video_p100_watched_actions",
  "video_p25_watched_actions", "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_avg_time_watched_actions", "video_play_actions",
  "cost_per_thruplay",
  // 랭킹
  "quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking",
  // 비용 지표
  "cpm", "cpp", "cost_per_unique_click",
  // 유니크 지표
  "unique_clicks", "unique_ctr",
  // 외부 클릭
  "outbound_clicks", "outbound_clicks_ctr",
  // 인라인
  "inline_link_clicks", "inline_link_click_ctr",
  // ROAS
  "website_purchase_roas",
  // 기타
  "social_spend",
].join(",");
```

### 1.2 AD_FIELDS (기존 9 → 12개)
```typescript
export const AD_FIELDS = [
  "id", "name",
  "adset_id", "adset_name",
  "campaign_id", "campaign_name",
  "account_id", "account_name",
  "effective_status", "configured_status",
  // creative 하위 필드 확장
  "creative.fields(object_type,product_set_id,video_id,image_hash,asset_feed_spec,object_story_spec,thumbnail_url,body,title,link_url)",
].join(",");
```

### 1.3 DB 컬럼 추가 (daily_ad_insights)
| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| video_p25 | INTEGER | 25% 재생 횟수 |
| video_p50 | INTEGER | 50% 재생 횟수 |
| video_p75 | INTEGER | 75% 재생 횟수 |
| video_p3s | INTEGER | 3초 재생 횟수 |
| video_avg_time | FLOAT | 평균 재생 시간(초) |
| frequency | FLOAT | 빈도 (노출/도달) |
| cpm | FLOAT | 1000회 노출 단가 |
| cpp | FLOAT | 1000명 도달 단가 |

> 나머지 신규 필드(outbound_clicks, unique_clicks 등)는 raw_insight JSONB에 저장되므로 필요 시 쿼리로 추출. 컬럼 추가는 처방에서 바로 쓰는 것만.

## 2. 트리거 업데이트 (fn_extract_daily_metrics)
```sql
-- 추가 변수
_video_p25 integer;
_video_p50 integer;
_video_p75 integer;
_video_p3s_direct integer;
_video_avg_time numeric;
_frequency numeric;

-- 추가 추출 로직
_video_p25 = video_p25_watched_actions 합산
_video_p50 = video_p50_watched_actions 합산
_video_p75 = video_p75_watched_actions 합산
_video_p3s_direct = video_p3s_watched_actions 합산 (없으면 actions의 video_view 사용)
_video_avg_time = video_avg_time_watched_actions 첫 번째 값
_frequency = raw_insight->>'frequency'

-- 컬럼 설정
NEW.video_p25 := _video_p25;
NEW.video_p50 := _video_p50;
NEW.video_p75 := _video_p75;
NEW.video_p3s := _video_p3s_direct;
NEW.video_avg_time := _video_avg_time;
NEW.frequency := _frequency;
NEW.cpm := raw_insight->>'cpm';
NEW.cpp := raw_insight->>'cpp';
```

## 3. 구현 순서
1. DB 마이그레이션: 컬럼 추가 + 트리거 업데이트
2. `collect-daily-utils.ts` INSIGHT_FIELDS + AD_FIELDS 확장
3. `meta-collector.ts` INSIGHT_FIELDS + AD_FIELDS 확장 (동일 값)
4. `database.ts` 타입 수동 추가
5. 1개 계정 테스트

## 4. 에러 처리
- Meta API가 특정 필드를 지원 안 하면 해당 필드만 빈 값 반환 (에러 아님)
- 권한 없는 필드는 자동으로 무시됨 (Meta API 특성)
- `video_p3s_watched_actions`는 일부 계정에서 deprecated → actions의 video_view로 fallback
