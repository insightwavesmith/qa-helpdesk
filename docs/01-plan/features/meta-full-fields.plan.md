# Meta API 전체 필드 수집 확장 — Plan

## 배경
현재 INSIGHT_FIELDS 12개, AD_FIELDS 9개만 요청 중. Meta Ads API에서 받을 수 있는 모든 필드를 다 받아야 한다. raw_insight JSONB에 원본 저장하므로 필드 추가 시 자동 보존됨.

## 범위

### 1. INSIGHT_FIELDS 확장 (12 → 30+)
추가 필드:
- video_p25_watched_actions, video_p50_watched_actions, video_p75_watched_actions
- video_p3s_watched_actions (= 3초 재생, 현재는 actions의 video_view로 추출)
- video_avg_time_watched_actions, video_play_actions
- frequency, cost_per_action_type, cost_per_thruplay
- outbound_clicks, outbound_clicks_ctr
- website_purchase_roas
- cost_per_unique_click, unique_clicks, unique_ctr
- cpp, cpm, social_spend
- inline_link_clicks, inline_link_click_ctr

### 2. AD_FIELDS 확장
- creative 하위 필드 추가: thumbnail_url, body, title, link_url
- effective_status, configured_status
- object_story_spec (이미 있음)

### 3. DB 마이그레이션
video 재생 5개 필드를 컬럼으로 추가 (처방에 바로 쓰임):
- video_p25 INTEGER
- video_p50 INTEGER
- video_p75 INTEGER
- video_p3s INTEGER
- video_avg_time FLOAT

### 4. 트리거 업데이트
fn_extract_daily_metrics()에 5개 video 필드 추출 로직 추가.

## 수정 대상 파일
1. `src/lib/collect-daily-utils.ts` — AD_FIELDS, INSIGHT_FIELDS 상수
2. `src/lib/protractor/meta-collector.ts` — AD_FIELDS, INSIGHT_FIELDS 상수 (중복)
3. `supabase/migrations/` — 새 마이그레이션 파일 (컬럼 + 트리거)
4. `src/types/database.ts` — 타입 재생성 (또는 수동 추가)

## 의존성
- 없음 (독립 작업)

## 성공 기준
- INSIGHT_FIELDS 30+개, AD_FIELDS 12+개
- 1개 계정 테스트 통과 (에러 없이 수집)
- video 5개 컬럼 추가 + 트리거 반영
- tsc + build 통과
