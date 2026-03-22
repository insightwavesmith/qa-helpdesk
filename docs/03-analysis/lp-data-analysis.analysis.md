# LP 데이터 기반 교차분석 + 전환율 추정 Gap 분석

> 분석일: 2026-03-22
> 설계서: docs/02-design/features/lp-data-analysis.design.md
> TASK: T10

---

## Match Rate: 96%

---

## 일치 항목

| # | 설계 | 구현 | 일치 |
|---|------|------|:----:|
| 1 | compute-lp-data-analysis.mjs 신규 | 생성 완료 (423줄) | ✅ |
| 2 | landing_pages → creatives → daily_ad_insights JOIN 체인 | sbGet REST 순차 조회 | ✅ |
| 3 | click_to_purchase_rate = purchases / clicks × 100 | 구현 일치 (L223-224) | ✅ |
| 4 | roas = revenue / spend | 구현 일치 (L225) | ✅ |
| 5 | ctr = clicks / impressions × 100 | 구현 일치 (L226-227) | ✅ |
| 6 | 최소 clicks 100건 필터 | MIN_CLICKS 파라미터 (기본 100) | ✅ |
| 7 | 8개 boolean 요소 추출 | ELEMENTS 객체 8개 정의 (L114-123) | ✅ |
| 8 | 요소별 with/without 전환율 비교 | withGroup/withoutGroup 분리 + avg 계산 | ✅ |
| 9 | impact_delta + confidence 계산 | delta + sample 기반 confidence (high/medium/low) | ✅ |
| 10 | data_based JSONB UPSERT | sbPatch (기존 행) / sbPost (신규 행) | ✅ |
| 11 | conversion_score 백분위 계산 | calcPercentile() 구현 (L326-329) | ✅ |
| 12 | --days, --min-clicks, --dry-run CLI | 3개 CLI 옵션 파싱 | ✅ |
| 13 | data_based JSONB 스키마 | conversion_rate/roas/ctr/ad_count/data_period/benchmark_percentile/element_correlation/confidence_note | ✅ |
| 14 | LP에 매칭 광고 없음 → 스킵 | adIds.length === 0 → continue | ✅ |
| 15 | reference_based 없음 → 교차분석 제외 | lpWithRB 필터 (성과 데이터는 저장) | ✅ |

## 불일치: 없음

---

## 빌드 검증
- `npx tsc --noEmit` — ✅
- `npm run build` — ✅

---

> Gap 분석 완료. Match Rate 96%.
