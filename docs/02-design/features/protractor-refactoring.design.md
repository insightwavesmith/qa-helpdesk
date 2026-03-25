# 총가치각도기 (Protractor) 설계서

> 최종 갱신: 2026-02-28 (아키텍처 재설계 A1~A4, B1~B3, C1~C3 반영)

---

## 1. 데이터 흐름도

```
[Meta API] → /api/cron/collect-daily → daily_ad_insights (DB)
                                      → daily_overlap_insights (DB)
[Meta API /ads] → /api/cron/collect-benchmarks → ad_insights_classified → benchmarks (DB)
  └ /ads endpoint + creative.fields(object_type,product_set_id) + nested insights.date_preset(last_7d)
[Mixpanel API] → /api/cron/collect-mixpanel → daily_mixpanel_insights (DB)

daily_ad_insights + benchmarks
  → GET /api/protractor/total-value → computeMetricValues() → calculateT3Score()
  → POST /api/diagnose → 진단 파트 배열

UI:
  → benchmark-compare.tsx (성과요약 탭)
  → content-ranking.tsx (콘텐츠 탭)
  둘 다 metric-groups.ts 참조
```

## 2. 데이터 모델

### DB 테이블

| 테이블 | 용도 | 주요 컬럼 |
|--------|------|-----------|
| daily_ad_insights | 일별 광고 지표 | date, account_id, ad_id, 13개 지표 + spend/impressions/reach/clicks/purchases 등 |
| daily_overlap_insights | 광고셋 중복도 | date, account_id, overall_rate, pairs(jsonb) |
| benchmarks | ABOVE_AVERAGE 기준 평균 | creative_type, ranking_type, ranking_group, date, 14개 지표 |
| ad_insights_classified | 벤치마크 원본 분류 | ad_id, account_id, creative_type, ranking 3종, 13개 지표 |
| daily_mixpanel_insights | Mixpanel 매출 | date, account_id, project_id, total_revenue, purchase_count |

## 3. 지표 정의 (13개)

**Single Source of Truth**: `src/lib/protractor/metric-groups.ts`

### 영상 지표 (3개) — groupKey: "foundation"

| key | 한국어 라벨 | 계산식 | benchGroup | unit | higher_better |
|-----|------------|--------|------------|------|---------------|
| video_p3s_rate | 3초시청률 | video_view / impressions × 100 | engagement | % | true |
| thruplay_rate | ThruPlay율 | thruplay / impressions × 100 | engagement | % | true |
| retention_rate | 지속비율 | video_p100 / video_p3s × 100 | engagement | % | true |

### 참여 지표 (5개) — groupKey: "engagement"

| key | 한국어 라벨 | 계산식 | benchGroup | unit | higher_better |
|-----|------------|--------|------------|------|---------------|
| reactions_per_10k | 좋아요/만노출 | reactions / impressions × 10000 | engagement | /만노출 | true |
| comments_per_10k | 댓글/만노출 | comments / impressions × 10000 | engagement | /만노출 | true |
| shares_per_10k | 공유/만노출 | shares / impressions × 10000 | engagement | /만노출 | true |
| saves_per_10k | 저장/만노출 | saves / impressions × 10000 | engagement | /만노출 | true |
| engagement_per_10k | 참여합계/만노출 | (reactions+comments+shares+saves) / impressions × 10000 | engagement | /만노출 | true |

> engagement_per_10k는 summaryMetric (그룹 요약 지표)

### 전환 지표 (5개) — groupKey: "conversion"

| key | 한국어 라벨 | 계산식 | benchGroup | unit | higher_better |
|-----|------------|--------|------------|------|---------------|
| ctr | CTR | clicks / impressions × 100 (Meta API ctr 필드 직접 사용) | conversion | % | true |
| click_to_checkout_rate | 결제시작율 | initiate_checkout / clicks × 100 | conversion | % | true |
| click_to_purchase_rate | 구매전환율 | purchases / clicks × 100 | conversion | % | true |
| checkout_to_purchase_rate | 결제→구매율 | purchases / initiate_checkout × 100 | conversion | % | true |
| reach_to_purchase_rate | 노출당구매확률 | purchases / **impressions** × 100 | conversion | % | true |

> **주의**: reach_to_purchase_rate의 분모는 reach가 아니라 **impressions**. DB 컬럼명은 역사적 이유로 유지.

## 4. T3 점수 계산

### computeMetricValues (t3-engine.ts)
- 입력: daily_ad_insights row 배열 (기간별)
- 처리: 전체 기간 raw 합산 → 비율 재계산
  - impressions, clicks, purchases 등 합산
  - rate 지표는 (합산 분자 / 합산 분모) × 단위 로 재계산

### calculateT3Score (t3-engine.ts)
- 입력: metricValues (13개 값), benchMap (ABOVE_AVERAGE 기준값)
- ratio 기반 점수: `value / aboveAvg` (ascending=true)
- ratio → 점수 매핑:
  - ≥ 1.33 → 100
  - ≥ 1.0  → 75~100
  - ≥ 0.75 → 50~75
  - ≥ 0.5  → 25~50
  - < 0.5  → 0~25
- 파트 점수 = 파트 내 지표 점수의 산술 평균
- T3 총점 = 파트 점수의 산술 평균

### verdict (UI 표시)
- score ≥ 75 → 🟢
- score ≥ 50 → 🟡
- else → 🔴

### 등급
- ≥ 80: A (우수) / ≥ 60: B (양호) / ≥ 40: C (보통) / ≥ 20: D (주의 필요) / < 20: F (위험)

## 5. API 설계

### GET /api/protractor/total-value
- 입력: account_id, period (1/7/14/30), date_start, date_end
- 처리: daily_ad_insights 조회 → computeMetricValues → fetchBenchmarks → calculateT3Score
- 벤치마크: creative_type별 ABOVE_AVERAGE 행에서 추출

### GET /api/protractor/benchmarks
- creative_type별 벤치마크 반환

### POST /api/diagnose
- 3파트 진단 결과 반환

### 관리자 재수집 API
- GET /api/protractor/collect-daily (date 파라미터)
- GET /api/protractor/collect-mixpanel (date 파라미터)

## 6. 컴포넌트 구조

| 컴포넌트 | 역할 | metric-groups.ts 참조 |
|----------|------|----------------------|
| benchmark-compare.tsx | 성과요약 탭: 벤치마크 대비 | ✅ |
| content-ranking.tsx | 콘텐츠 탭: 광고별 순위 | ✅ |
| t3-engine.ts | 점수 계산 엔진 | ✅ (T3_PARTS 파생) |

## 7. 에러 처리

- null 지표: T3 계산에서 제외 (점수 없음 = ⚪)
- 벤치마크 없음: 기본 50점 반환 + "벤치마크 데이터 없음" 메시지
- creative_type 매칭 실패: "ALL" 폴백
- creative_type 판별 (GCP 방식): VIDEO=object_type VIDEO|PRIVACY_CHECK_FAIL, CATALOG=SHARE|(IMAGE+product_set_id), IMAGE=나머지
- 데이터 없음: score: null + "내일부터 확인 가능합니다"

## 8. 구현 완료 항목

- [x] metric-groups.ts — 13개 지표 single source (영상3 + 참여5 + 전환5)
- [x] t3-engine.ts — ratio 기반 점수 (GCP 방식, A2: retention_rate=p100/p3s 통일)
- [x] total-value API — 기간별 T3 점수
- [x] collect-daily — 일일 Meta 수집 + overlap (A1: upsert 전환)
- [x] collect-benchmarks — GCP 방식 /ads 엔드포인트 + nested insights (A3: creative_type 정확 판별, A4: date+upsert 이력 보존, B3: reach_to_purchase_rate 포함 14개 지표)
- [x] collect-mixpanel — Mixpanel 매출 수집
- [x] benchmark-compare.tsx — 성과요약 UI
- [x] content-ranking.tsx — 콘텐츠 순위 UI

<!-- 2026-03-25: Supabase SDK 제거 — import @/lib/supabase/server → @/lib/db 전환 완료 -->
