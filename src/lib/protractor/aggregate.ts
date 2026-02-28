/**
 * 데이터 집계 유틸리티
 * 원본 dashboard_api.py의 get_account_summary, get_top5_ads, get_daily_ad_average와
 * 동일한 계산 방식으로 구현.
 */

import type { AdInsightRow } from "@/app/(main)/protractor/components/ad-metrics-table";

// ============================================================
// 계정 요약 (원본 get_account_summary와 동일한 계산)
// ============================================================

export interface AccountSummary {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalPurchases: number;
  totalRevenue: number;
  avgCtr: number;    // SUM(clicks)/SUM(impressions)*100
  avgCpc: number;    // SUM(spend)/SUM(clicks)
  roas: number;      // SUM(purchase_value)/SUM(spend)
}

/**
 * 원본 get_account_summary와 동일:
 *   SUM(spend), SUM(impressions), SUM(clicks), SUM(purchases), SUM(purchase_value),
 *   SAFE_DIVIDE(SUM(clicks), SUM(impressions)) * 100 as avg_ctr,
 *   SAFE_DIVIDE(SUM(spend), SUM(clicks)) as avg_cpc,
 *   SAFE_DIVIDE(SUM(purchase_value), SUM(spend)) as roas
 */
export function aggregateSummary(insights: AdInsightRow[]): AccountSummary {
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
    // SAFE_DIVIDE(SUM(clicks), SUM(impressions)) * 100
    avgCtr: totalImpressions > 0 ? +(totalClicks / totalImpressions * 100).toFixed(2) : 0,
    // SAFE_DIVIDE(SUM(spend), SUM(clicks))
    avgCpc: totalClicks > 0 ? Math.round(totalSpend / totalClicks) : 0,
    // SAFE_DIVIDE(SUM(purchase_value), SUM(spend))
    roas: totalSpend > 0 ? +(totalRevenue / totalSpend).toFixed(2) : 0,
  };
}

// ============================================================
// SummaryCards용 변환
// ============================================================

export interface SummaryCardData {
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
  changePercent: number;
  changeLabel: string;
}

/**
 * 현재 기간과 이전 기간의 insights를 비교하여 SummaryCards에 필요한 데이터 생성
 * 카드: 총 광고비, 총 클릭, 총 구매, ROAS
 */
export function toSummaryCards(
  current: AccountSummary,
  previous?: AccountSummary | null,
): SummaryCardData[] {
  const pct = (cur: number, prev: number): number => {
    if (!prev || prev === 0) return 0;
    return +((cur - prev) / prev * 100).toFixed(1);
  };

  return [
    {
      label: "총 광고비",
      value: current.totalSpend.toLocaleString("ko-KR"),
      prefix: "₩",
      changePercent: pct(current.totalSpend, previous?.totalSpend ?? 0),
      changeLabel: "전기간 대비",
    },
    {
      label: "총 클릭",
      value: current.totalClicks.toLocaleString("ko-KR"),
      changePercent: pct(current.totalClicks, previous?.totalClicks ?? 0),
      changeLabel: "전기간 대비",
    },
    {
      label: "총 구매",
      value: current.totalPurchases.toLocaleString("ko-KR"),
      changePercent: pct(current.totalPurchases, previous?.totalPurchases ?? 0),
      changeLabel: "전기간 대비",
    },
    {
      label: "ROAS",
      value: current.roas.toFixed(2),
      changePercent: pct(current.roas, previous?.roas ?? 0),
      changeLabel: "전기간 대비",
    },
  ];
}

// ============================================================
// 비율 지표 역산 누적 & 재계산 (공유 유틸)
// ============================================================

/** 역산 누적용 내부 타입 */
interface RatioAccum {
  _totalReactions: number;
  _totalComments: number;
  _totalShares: number;
  _totalSaves: number;
  _totalEngagement: number;
  _totalP3s: number;
  _totalThruplay: number;
  _totalP100: number;
  _totalCheckout: number;
}

/** row 1건에서 역산 raw 값 추출 */
function initAccum(row: AdInsightRow): RatioAccum {
  const imp = row.impressions || 0;
  const clicks = row.clicks || 0;
  const p3sRaw = (row.video_p3s_rate ?? 0) / 100 * imp;
  return {
    _totalReactions: (row.reactions_per_10k ?? 0) / 10000 * imp,
    _totalComments: (row.comments_per_10k ?? 0) / 10000 * imp,
    _totalShares: (row.shares_per_10k ?? 0) / 10000 * imp,
    _totalSaves: (row.saves_per_10k ?? 0) / 10000 * imp,
    _totalEngagement: (row.engagement_per_10k ?? 0) / 10000 * imp,
    _totalP3s: p3sRaw,
    _totalThruplay: (row.thruplay_rate ?? 0) / 100 * imp,
    _totalP100: (row.retention_rate ?? 0) / 100 * p3sRaw,
    _totalCheckout: (row.click_to_checkout_rate ?? 0) / 100 * clicks,
  };
}

/** 기존 누적에 row 1건 추가 */
function addAccum(acc: RatioAccum, row: AdInsightRow): void {
  const imp = row.impressions || 0;
  const clicks = row.clicks || 0;
  const p3sRaw = (row.video_p3s_rate ?? 0) / 100 * imp;
  acc._totalReactions += (row.reactions_per_10k ?? 0) / 10000 * imp;
  acc._totalComments += (row.comments_per_10k ?? 0) / 10000 * imp;
  acc._totalShares += (row.shares_per_10k ?? 0) / 10000 * imp;
  acc._totalSaves += (row.saves_per_10k ?? 0) / 10000 * imp;
  acc._totalEngagement += (row.engagement_per_10k ?? 0) / 10000 * imp;
  acc._totalP3s += p3sRaw;
  acc._totalThruplay += (row.thruplay_rate ?? 0) / 100 * imp;
  acc._totalP100 += (row.retention_rate ?? 0) / 100 * p3sRaw;
  acc._totalCheckout += (row.click_to_checkout_rate ?? 0) / 100 * clicks;
}

/**
 * 누적된 절대값 + raw 누적으로 비율 지표 재계산.
 * aggregate.ts / ad-metrics-table.tsx 양쪽에서 사용.
 */
export function recalculateRatioMetrics(row: AdInsightRow, acc: RatioAccum): void {
  const imp = row.impressions;
  const clicks = row.clicks;
  row.ctr = imp > 0 ? +((clicks / imp) * 100).toFixed(2) : 0;
  row.roas = row.spend > 0 ? +(row.purchase_value / row.spend).toFixed(2) : 0;
  row.reactions_per_10k = imp > 0 ? +(acc._totalReactions / imp * 10000).toFixed(2) : 0;
  row.comments_per_10k = imp > 0 ? +(acc._totalComments / imp * 10000).toFixed(2) : 0;
  row.shares_per_10k = imp > 0 ? +(acc._totalShares / imp * 10000).toFixed(2) : 0;
  row.saves_per_10k = imp > 0 ? +(acc._totalSaves / imp * 10000).toFixed(2) : 0;
  row.engagement_per_10k = imp > 0 ? +(acc._totalEngagement / imp * 10000).toFixed(2) : 0;
  row.video_p3s_rate = imp > 0 ? +(acc._totalP3s / imp * 100).toFixed(2) : 0;
  row.thruplay_rate = imp > 0 ? +(acc._totalThruplay / imp * 100).toFixed(2) : 0;
  row.retention_rate = acc._totalP3s > 0 ? +(acc._totalP100 / acc._totalP3s * 100).toFixed(2) : 0;
  row.click_to_purchase_rate = clicks > 0 ? +(row.purchases / clicks * 100).toFixed(2) : 0;
  row.click_to_checkout_rate = clicks > 0 ? +(acc._totalCheckout / clicks * 100).toFixed(2) : 0;
  row.checkout_to_purchase_rate = acc._totalCheckout > 0 ? +(row.purchases / acc._totalCheckout * 100).toFixed(2) : 0;
  row.reach_to_purchase_rate = row.impressions > 0 ? +(row.purchases / row.impressions * 100).toFixed(2) : 0;
}

/**
 * ad_id별 그루핑 + 비율 지표 역산 재계산.
 * aggregate.ts / ad-metrics-table.tsx 양쪽에서 사용하는 공용 함수.
 */
export function aggregateInsightsByAd(insights: AdInsightRow[]): AdInsightRow[] {
  const map = new Map<string, AdInsightRow & { _acc: RatioAccum }>();

  for (const row of insights) {
    const existing = map.get(row.ad_id);
    if (!existing) {
      const acc = initAccum(row);
      map.set(row.ad_id, { ...row, _acc: acc });
    } else {
      existing.impressions += row.impressions || 0;
      existing.reach += row.reach || 0;
      existing.clicks += row.clicks || 0;
      existing.spend += row.spend || 0;
      existing.purchases += row.purchases || 0;
      existing.purchase_value += row.purchase_value || 0;
      addAccum(existing._acc, row);
    }
  }

  return Array.from(map.values()).map((entry) => {
    recalculateRatioMetrics(entry, entry._acc);
    const { _acc, ...clean } = entry;
    return clean as AdInsightRow;
  });
}

// ============================================================
// TOP 5 광고 (원본 get_top5_ads와 동일)
// ============================================================

/**
 * ad_id별로 그루핑 (기간 선택 시 합산 필요) → spend DESC LIMIT 5
 * 비율 지표(per_10k, rate)를 역산 방식으로 정확히 재계산
 */
export function getTop5Ads(insights: AdInsightRow[]): AdInsightRow[] {
  return aggregateInsightsByAd(insights)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);
}

// ============================================================
// 일별 트렌드 (차트용)
// ============================================================

export interface DailyTrendPoint {
  date: string;
  revenue: number;
  adSpend: number;
}

/**
 * date별로 그루핑하여 일별 매출/광고비 차트 데이터 생성
 */
export function toDailyTrend(insights: AdInsightRow[]): DailyTrendPoint[] {
  const map = new Map<string, { revenue: number; adSpend: number }>();

  for (const row of insights) {
    const existing = map.get(row.date);
    if (!existing) {
      map.set(row.date, {
        revenue: row.purchase_value || 0,
        adSpend: row.spend || 0,
      });
    } else {
      existing.revenue += row.purchase_value || 0;
      existing.adSpend += row.spend || 0;
    }
  }

  return Array.from(map.entries())
    .map(([date, vals]) => {
      // M/D 형식으로 변환 (1/10, 2/3 등)
      const d = new Date(date);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      return {
        date: label,
        revenue: Math.round(vals.revenue),
        adSpend: Math.round(vals.adSpend),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date, undefined, { numeric: true }));
}

// ============================================================
// 전환 퍼널
// ============================================================

export interface FunnelStepData {
  label: string;
  value: string;
  rawValue: number;
  conversionRate?: string;
  color: {
    border: string;
    bg: string;
    text: string;
  };
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/**
 * 노출 → 클릭 → 결제시작 → 구매
 * 결제시작 추정: clicks * avg(click_to_checkout_rate)/100
 */
export function toFunnelData(insights: AdInsightRow[]): {
  steps: FunnelStepData[];
  overallRate: string;
} {
  const totalImpressions = insights.reduce((s, r) => s + (r.impressions || 0), 0);
  const totalClicks = insights.reduce((s, r) => s + (r.clicks || 0), 0);
  const totalPurchases = insights.reduce((s, r) => s + (r.purchases || 0), 0);

  // 결제시작 추정: clicks * avg click_to_checkout_rate
  const checkoutRates = insights
    .filter((r) => r.click_to_checkout_rate != null && r.click_to_checkout_rate > 0);
  const avgCheckoutRate = checkoutRates.length > 0
    ? checkoutRates.reduce((s, r) => s + (r.click_to_checkout_rate ?? 0), 0) / checkoutRates.length
    : 0;
  const estimatedCheckout = Math.round(totalClicks * avgCheckoutRate / 100);

  const ctrPct = totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : "0";
  const clickToCheckoutPct = totalClicks > 0 ? (estimatedCheckout / totalClicks * 100).toFixed(2) : "0";
  const checkoutToPurchasePct = estimatedCheckout > 0 ? (totalPurchases / estimatedCheckout * 100).toFixed(1) : "0";
  const overallRate = totalImpressions > 0 ? (totalPurchases / totalImpressions * 100).toFixed(3) : "0";

  return {
    steps: [
      {
        label: "노출",
        value: formatCompact(totalImpressions),
        rawValue: totalImpressions,
        color: { border: "border-primary/20", bg: "bg-primary/10", text: "text-primary" },
      },
      {
        label: "클릭",
        value: formatCompact(totalClicks),
        rawValue: totalClicks,
        conversionRate: ctrPct,
        color: { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700" },
      },
      {
        label: "결제시작",
        value: formatCompact(estimatedCheckout),
        rawValue: estimatedCheckout,
        conversionRate: clickToCheckoutPct,
        color: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700" },
      },
      {
        label: "구매",
        value: formatCompact(totalPurchases),
        rawValue: totalPurchases,
        conversionRate: checkoutToPurchasePct,
        color: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700" },
      },
    ],
    overallRate,
  };
}

// ============================================================
// DailyMetricsTable용 일별 집계
// ============================================================

export interface DailyMetric {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  adSpend: number;
  revenue: number;
  roas: number;
  conversions: number;
}

/**
 * date별로 그루핑 → 일별 성과 테이블 데이터
 * 원본 get_account_summary와 동일한 계산 방식 (SUM 후 비율 재계산)
 */
export function toDailyMetrics(insights: AdInsightRow[]): DailyMetric[] {
  const map = new Map<string, {
    impressions: number;
    clicks: number;
    spend: number;
    revenue: number;
    purchases: number;
  }>();

  for (const row of insights) {
    const existing = map.get(row.date);
    if (!existing) {
      map.set(row.date, {
        impressions: row.impressions || 0,
        clicks: row.clicks || 0,
        spend: row.spend || 0,
        revenue: row.purchase_value || 0,
        purchases: row.purchases || 0,
      });
    } else {
      existing.impressions += row.impressions || 0;
      existing.clicks += row.clicks || 0;
      existing.spend += row.spend || 0;
      existing.revenue += row.purchase_value || 0;
      existing.purchases += row.purchases || 0;
    }
  }

  return Array.from(map.entries())
    .map(([date, v]) => {
      const d = new Date(date);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      return {
        date: label,
        impressions: v.impressions,
        clicks: v.clicks,
        ctr: v.impressions > 0 ? +((v.clicks / v.impressions) * 100).toFixed(2) : 0,
        cpc: v.clicks > 0 ? Math.round(v.spend / v.clicks) : 0,
        adSpend: Math.round(v.spend),
        revenue: Math.round(v.revenue),
        roas: v.spend > 0 ? Math.round((v.revenue / v.spend) * 100) : 0,
        conversions: v.purchases,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date, undefined, { numeric: true }));
}

// ============================================================
// 전주 데이터 분리 유틸
// ============================================================

/**
 * 현재 기간과 동일한 길이의 이전 기간 insights 분리
 * ex) 1/10~1/16 선택 시 → 이전 기간은 1/3~1/9
 */
export function splitPreviousPeriod(
  allInsights: AdInsightRow[],
  currentStart: string,
  currentEnd: string,
): { current: AdInsightRow[]; previous: AdInsightRow[] } {
  const start = new Date(currentStart);
  const end = new Date(currentEnd);
  const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - periodDays + 1);

  const prevStartStr = prevStart.toISOString().split("T")[0];
  const prevEndStr = prevEnd.toISOString().split("T")[0];

  const current = allInsights.filter((r) => r.date >= currentStart && r.date <= currentEnd);
  const previous = allInsights.filter((r) => r.date >= prevStartStr && r.date <= prevEndStr);

  return { current, previous };
}
