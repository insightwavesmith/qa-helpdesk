# LP 데이터 기반 교차분석 + 전환율 추정 설계서

> 작성일: 2026-03-22
> TASK: T10 (architecture-v3-execution-plan.md)
> 의존성: T5 ✅ (lp_analysis.reference_based 존재)

---

## 1. 데이터 모델

### 1.1 data_based JSONB 스키마

lp_analysis.data_based에 저장:
```json
{
  "conversion_rate": 2.8,
  "roas": 3.2,
  "ctr": 1.5,
  "ad_count": 12,
  "data_period": "2026-02-19~2026-03-21",
  "benchmark_percentile": 65,
  "element_correlation": {
    "reviews_present": {
      "with": 3.2, "without": 2.0,
      "impact_delta": 1.2, "impact_pct": 60,
      "sample_with": 45, "sample_without": 28,
      "confidence": "high"
    },
    "sticky_cta": {
      "with": 3.5, "without": 2.8,
      "impact_delta": 0.7, "impact_pct": 25,
      "sample_with": 52, "sample_without": 21,
      "confidence": "high"
    }
  },
  "confidence_note": "high: ≥30 samples, medium: 10-29, low: <10"
}
```

### 1.2 전환율 계산

LP별 전환율은 **해당 LP를 사용하는 광고의 성과 집계**:
```
landing_pages ← creatives (lp_id) ← daily_ad_insights (ad_id)
```

click_to_purchase_rate = purchases / clicks × 100
roas = revenue / spend
ctr = clicks / impressions × 100

---

## 2. API 설계

### 2.1 compute-lp-data-analysis.mjs (신규)

```
Usage: node scripts/compute-lp-data-analysis.mjs [--days N] [--min-clicks N] [--dry-run]

동작:
1. LP별 성과 집계 (30일)
   - landing_pages → creatives (lp_id) → daily_ad_insights (ad_id)
   - click_to_purchase_rate, roas, ctr 계산
   - 최소 clicks 100건 필터

2. LP 요소 × 전환율 교차분석
   - lp_analysis.reference_based에서 boolean 요소 추출
   - 요소 있는 LP vs 없는 LP의 전환율 비교
   - impact_delta + confidence

3. lp_analysis.data_based UPSERT
4. conversion_score = click_to_purchase_rate 기반 백분위

분석 대상 요소 (reference_based에서):
- reviews_present: social_proof.review_count > 0
- sticky_cta: cta_structure.type === "sticky"
- urgency_timer: urgency_scarcity.timer === true
- trust_certification: trust_elements.certification === true
- easy_pay_available: cta_structure.easy_pay.length > 0
- brand_story: trust_elements.brand_story === true
- photo_reviews: social_proof.types includes "photo"
- objection_handling: conversion_psychology.objection_handling === true
```

---

## 3. 컴포넌트 구조

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `scripts/compute-lp-data-analysis.mjs` | **신규** | LP 성과 집계 + 요소 교차분석 |

---

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| LP에 매칭 광고 없음 | 스킵 |
| clicks < min-clicks | 통계 부족 → 스킵 |
| reference_based 없음 | 교차분석 제외 (성과 데이터만 저장) |
| daily_ad_insights 데이터 부족 | confidence: "low" |

---

## 5. 구현 순서

- [ ] LP별 성과 집계 (REST API로 JOIN 체인 조회)
- [ ] click_to_purchase_rate, roas, ctr 계산
- [ ] 요소 8개 boolean 추출 (reference_based에서)
- [ ] 요소별 with/without 전환율 비교
- [ ] impact_delta + confidence 계산
- [ ] lp_analysis.data_based UPSERT
- [ ] conversion_score 백분위 계산
- [ ] `npx tsc --noEmit` + `npm run build` 통과

---

> 설계서 작성 완료.
