# TASK: P1-1 실데이터 연동 + P1-2 진단 결과 UI

## 목표
총가치각도기와 대시보드의 **더미 데이터를 실제 Supabase 데이터로 연결**하고, **진단 엔진 결과를 UI에 표시**한다.

**중요:** 기존 GCP 원본 코드의 지표 계산 방식과 숫자가 동일해야 함. UX는 변경 OK.

## 참조 파일 (반드시 읽을 것)
1. **원본 API**: `/Users/smith/.openclaw/workspace/총가치각도기-source/dashboard-api/dashboard_api.py` — 지표 계산 로직 (get_account_summary, get_top5_ads)
2. **원본 진단엔진**: `/Users/smith/.openclaw/workspace/총가치각도기-source/dashboard-api/diagnose_ad_v3.py` — 진단 로직
3. **TS 진단엔진 (이미 포팅)**: `src/lib/diagnosis/` — engine.ts, metrics.ts, types.ts
4. **설계서**: `/Users/smith/.openclaw/workspace/projects/qa-knowledge-base/docs/02-design/P1-1-realdata-integration.md`

## 원본 지표 계산 방식 (dashboard_api.py에서 발췌, 이대로 구현)

### get_account_summary (계정 요약)
```sql
SUM(spend) as total_spend,
SUM(impressions) as total_impressions,
SUM(clicks) as total_clicks,
SUM(purchases) as total_purchases,
SUM(purchase_value) as total_revenue,
SAFE_DIVIDE(SUM(clicks), SUM(impressions)) * 100 as avg_ctr,
SAFE_DIVIDE(SUM(spend), SUM(clicks)) as avg_cpc,
SAFE_DIVIDE(SUM(purchase_value), SUM(spend)) as roas
```

### get_top5_ads (TOP 5 광고)
- daily_ad_insights에서 해당 날짜의 ad 레벨 데이터
- spend DESC LIMIT 5
- 27개 지표 포함 (ctr, cpc, cpm, video rates, engagement rates, conversion rates, roas)

### get_daily_ad_average (기간 평균)
- 기간 내 AVG(각 rate 지표), SUM(spend/impressions/clicks/purchases/purchase_value)
- roas = SUM(purchase_value) / SUM(spend)

## 작업 목록

### Part 1: 데이터 집계 유틸 (신규)
`src/lib/protractor/aggregate.ts` 작성:

```typescript
import { type AdInsightRow } from "@/components/protractor/ad-metrics-table"; // 또는 적절한 타입

// 원본 get_account_summary와 동일한 계산
export function aggregateSummary(insights: any[]) {
  const totalSpend = insights.reduce((sum, r) => sum + (r.spend || 0), 0);
  const totalImpressions = insights.reduce((sum, r) => sum + (r.impressions || 0), 0);
  const totalClicks = insights.reduce((sum, r) => sum + (r.clicks || 0), 0);
  const totalPurchases = insights.reduce((sum, r) => sum + (r.purchases || 0), 0);
  const totalRevenue = insights.reduce((sum, r) => sum + (r.purchase_value || 0), 0);

  return {
    totalSpend: Math.round(totalSpend),
    totalImpressions,
    totalClicks,
    totalPurchases,
    totalRevenue: Math.round(totalRevenue),
    avgCtr: totalImpressions > 0 ? +(totalClicks / totalImpressions * 100).toFixed(2) : 0,
    avgCpc: totalClicks > 0 ? Math.round(totalSpend / totalClicks) : 0,
    roas: totalSpend > 0 ? +(totalRevenue / totalSpend).toFixed(2) : 0,
  };
}

// TOP 5 광고 (spend 기준)
export function getTop5Ads(insights: any[]) {
  // ad_id로 그루핑 (같은 날짜에 같은 ad_id는 1행이지만, 기간 선택 시 합산 필요)
  // 원본은 단일 날짜라 그루핑 없이 ORDER BY spend DESC LIMIT 5
  // 기간 선택 시에는 ad_id별 합산 후 spend DESC LIMIT 5
  // ...구현
}

// 일별 트렌드 (차트용)
export function toDailyTrend(insights: any[]) {
  // date별로 그루핑 → { date, spend, revenue, roas, purchases }
}

// 전환 퍼널
export function toFunnelData(insights: any[]) {
  // impressions → clicks → cart → checkout → purchases
}
```

### Part 2: 총가치각도기 실데이터 연결
`src/app/(main)/protractor/page.tsx` 수정:

현재 이미 API 호출 로직이 있음 (insights, benchmarks). 컴포넌트에 실데이터 props 전달하는 부분만 연결.

1. **SummaryCards** — aggregateSummary(insights) → cards props로 변환
   - "총 매출", "광고비", "ROAS", "구매전환수", "CPA" (원본과 동일)
   - changePercent는 전주 대비로 계산 (없으면 0)
2. **PerformanceTrendChart** — toDailyTrend(insights) → 일별 매출/광고비/ROAS 차트
3. **DailyMetricsTable** — insights 배열 그대로 → 테이블 (ad_name, spend, impressions, clicks, ctr, purchases, purchase_value, roas)
4. **ConversionFunnel** — toFunnelData(insights) → 노출→클릭→장바구니→결제→구매

### Part 3: 진단 결과 UI 연동
1. protractor/page.tsx에서 계정+기간 선택 시 `/api/diagnose` POST 호출
2. 요청: { insights: top5Ads, benchmarks: benchmarkData } (원본 engine과 동일한 입력)
3. 응답의 진단 결과를 **DiagnosticPanel** 에 전달
   - grade (A/B/C/D/F) 계산: 원본에는 없지만, 4파트 판정(GOOD/WARNING/BAD) 기반으로 산출
   - summary: 한줄 진단 (one-line.ts에서 생성)
   - issues: 각 파트별 WARNING/BAD 항목

### Part 4: 대시보드 실데이터
1. **V0Dashboard (admin)** — 전체 계정 요약 (최근 7일 합산: 총매출, 총광고비, 평균ROAS, 활성 계정 수)
   - `/api/protractor/insights` 호출 (admin은 전체 조회 가능)
2. **StudentHome (student)** — 내 계정 요약 미니카드 + "총가치각도기 보기" 링크

## DB 데이터 (확인 완료)
- daily_ad_insights: 7,366건
- benchmarks: 3,026건
- ad_accounts: 30개
- 컬럼: spend, impressions, reach, clicks, purchases, purchase_value, roas, ctr, 
  video_p3s_rate, thruplay_rate, retention_rate, reactions/comments/shares/engagement_per_10k,
  click_to_cart_rate, click_to_checkout_rate, click_to_purchase_rate, cart_to_purchase_rate, 
  checkout_to_purchase_rate, quality_ranking, engagement_ranking, conversion_ranking,
  creative_type, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name

## 기존 API (이미 구현됨, 활용할 것)
- `GET /api/protractor/accounts` — 내 계정 목록
- `GET /api/protractor/insights?account_id=xxx&start=YYYY-MM-DD&end=YYYY-MM-DD` — 일별 insights
- `GET /api/protractor/benchmarks` — 벤치마크 데이터
- `POST /api/diagnose` — 진단 엔진
- `GET /api/protractor/lp-metrics` — LP 지표

## 기존 컴포넌트 (수정만, 신규 생성 최소화)
- `src/components/protractor/SummaryCards.tsx` — defaultCards 하드코딩 → props 활용
- `src/components/protractor/DiagnosticPanel.tsx` — 더미 → 실 진단 결과
- `src/components/protractor/PerformanceTrendChart.tsx` — 더미 → 실 차트
- `src/components/protractor/DailyMetricsTable.tsx` — 더미 → 실 테이블
- `src/components/protractor/ConversionFunnel.tsx` — 더미 → 실 퍼널

## 체크리스트
- [ ] aggregate.ts 유틸 작성 (원본과 동일한 계산)
- [ ] SummaryCards 실데이터 연결
- [ ] PerformanceTrendChart 실데이터 연결
- [ ] DailyMetricsTable 실데이터 연결 (TOP 5 광고 포함)
- [ ] ConversionFunnel 실데이터 연결
- [ ] DiagnosticPanel → /api/diagnose 연동 + 결과 표시
- [ ] V0Dashboard 실데이터 요약
- [ ] StudentHome 실데이터 요약
- [ ] `npm run build` 성공
- [ ] git add -A && git commit -m "feat: P1-1 실데이터 연동 + P1-2 진단 UI" && git push

## 디자인 가이드
- Primary: #F75D5D (coral red), Hover: #E54949
- 폰트: Pretendard
- 한국어 UI, 라이트 모드 only
- 기존 디자인 시스템 유지 (shadcn/ui)
