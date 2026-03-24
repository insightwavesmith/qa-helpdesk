# TASK: Meta API 전체 필드 수집 확장

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 배경
현재 INSIGHT_FIELDS에 12개 필드만 요청 중. Meta Ads API에서 받을 수 있는 모든 필드를 다 받아야 한다.
raw_insight JSONB에 원본 저장하니까 필드 추가하면 자동으로 들어감.

## 해야 할 것

### 1. Meta Ads Insights API 전체 필드 조사
- https://developers.facebook.com/docs/marketing-api/insights/parameters/v21.0
- 사용 가능한 모든 insights 필드 리스트 뽑아라
- 특히 아래는 반드시 포함:

```
video_p25_watched_actions    — 25% 재생
video_p50_watched_actions    — 50% 재생  
video_p75_watched_actions    — 75% 재생
video_p3s_watched_actions    — 3초 재생
video_avg_time_watched_actions — 평균 재생 시간
video_play_actions           — 재생 시작
frequency                    — 빈도
cost_per_action_type         — 액션별 단가
cost_per_thruplay            — 완시청 단가
outbound_clicks              — 외부 클릭
outbound_clicks_ctr          — 외부 클릭률
website_purchase_roas        — 웹사이트 ROAS
cost_per_unique_click        — 유니크 클릭 단가
unique_clicks                — 유니크 클릭
unique_ctr                   — 유니크 CTR
cpp                          — 1000명 도달 비용
cpm                          — 1000회 노출 비용
social_spend                 — 소셜 지출
inline_link_clicks           — 인라인 링크 클릭
inline_link_click_ctr        — 인라인 링크 CTR
```

### 2. AD_FIELDS 확장
- creative 하위 필드도 최대한 (thumbnail_url, body, title, link_url 등)
- effective_status, configured_status
- targeting (가능하면)

### 3. src/lib/protractor/meta-collector.ts 수정
- INSIGHT_FIELDS 배열 확장
- AD_FIELDS 배열 확장
- 테스트: 1개 계정으로 호출해서 에러 없는지 확인 (일부 필드는 권한 없으면 무시됨)

### 4. DB 트리거 확인
- fn_extract_daily_metrics()에 새 필드 추출 추가 (video_p25/p50/p75/p3s 등)
- daily_ad_insights 테이블에 컬럼 없으면 추가 (migration)
- 또는 raw_insight JSONB에만 저장하고 나중에 필요할 때 추출해도 됨

## 원칙
- **받을 수 있는 건 전부 받는다** — 지금 안 쓰더라도 raw에 저장해두면 나중에 활용 가능
- raw_insight JSONB가 있으니까 컬럼 추가 안 해도 데이터는 보존됨
- 단, video 재생 관련(p25/p50/p75/p3s/avg_time)은 컬럼으로 추출 필수 (처방에 바로 쓰임)

## 완료 기준
- INSIGHT_FIELDS + AD_FIELDS 최대 확장
- 1개 계정 테스트 통과
- video 재생 5개 필드 daily_ad_insights 컬럼 추가 + 트리거 반영
- tsc + build 통과 + 커밋
