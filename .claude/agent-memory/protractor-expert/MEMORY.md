# Protractor Expert Memory

## 비율 지표 역산 재계산 패턴 (2026-02-27)
- per_10k 지표: `raw = per_10k / 10000 * impressions` → 누적 후 `per_10k = totalRaw / totalImp * 10000`
- rate 지표: `raw = rate / 100 * impressions` → 누적 후 `rate = totalRaw / totalImp * 100`
- retention_rate 특수: `p100_raw = retention_rate / 100 * p3s_raw` → `retention = totalP100 / totalP3s * 100`
- click_to_checkout_rate: `checkout_raw = rate / 100 * clicks` → `rate = totalCheckout / totalClicks * 100`

## 공유 함수 구조 (aggregate.ts)
- `initAccum(row)` / `addAccum(acc, row)`: 내부 역산 누적 헬퍼
- `recalculateRatioMetrics(row, acc)`: 누적 acc로 비율 지표 재계산 (export)
- `aggregateInsightsByAd(insights)`: ad_id별 그루핑 + 비율 재계산 (export)
- `getTop5Ads(insights)`: aggregateInsightsByAd → spend DESC → slice(0,5)
- ad-metrics-table.tsx의 `aggregateByAd`도 `aggregateInsightsByAd`를 import하여 사용

## 7일 제한 제거 (2026-02-27)
- OverlapAnalysis.tsx: 7일 미만 차단 삭제 → 3일 미만 경고 배너로 교체
- overlap/route.ts: 7일 미만 400 에러 삭제

## Key Files
- `src/lib/protractor/aggregate.ts` — 집계 + 비율 재계산 유틸
- `src/app/(main)/protractor/components/ad-metrics-table.tsx` — 광고 성과 테이블
- `src/components/protractor/OverlapAnalysis.tsx` — 타겟중복 분석 UI
- `src/app/api/protractor/overlap/route.ts` — 타겟중복 API
