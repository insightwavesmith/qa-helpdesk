"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// 광고 인사이트 로우 타입 (daily_ad_insights 테이블)
export interface AdInsightRow {
  date: string;
  account_id: string;
  ad_id: string;
  ad_name: string;
  campaign_name?: string;
  adset_name?: string;
  creative_type?: string;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  spend: number;
  purchases: number;
  purchase_value: number;
  roas: number;
  video_p3s_rate?: number;
  thruplay_rate?: number;
  retention_rate?: number;
  reactions_per_10k?: number;
  comments_per_10k?: number;
  shares_per_10k?: number;
  engagement_per_10k?: number;
  click_to_cart_rate?: number;
  click_to_checkout_rate?: number;
  checkout_to_purchase_rate?: number;
  click_to_purchase_rate?: number;
  reach_to_purchase_rate?: number;
  quality_ranking?: string;
  engagement_ranking?: string;
  conversion_ranking?: string;
}

// 벤치마크 로우 타입 (benchmarks 테이블)
export interface BenchmarkRow {
  ranking_type: string;
  ranking_group: string;
  creative_type: string;
  avg_ctr?: number;
  avg_roas?: number;
  avg_video_p3s_rate?: number;
  avg_thruplay_rate?: number;
  avg_retention_rate?: number;
  avg_reactions_per_10k?: number;
  avg_comments_per_10k?: number;
  avg_shares_per_10k?: number;
  avg_engagement_per_10k?: number;
  avg_click_to_cart_rate?: number;
  avg_click_to_checkout_rate?: number;
  avg_checkout_to_purchase_rate?: number;
  avg_click_to_purchase_rate?: number;
  avg_reach_to_purchase_rate?: number;
  [key: string]: string | number | undefined;
}

// 벤치마크에서 above_avg 값 찾기
function findAboveAvg(
  benchmarks: BenchmarkRow[],
  rankingType: string,
  creativeType = "VIDEO"
): BenchmarkRow | undefined {
  return benchmarks.find(
    (b) =>
      b.ranking_type === rankingType &&
      b.ranking_group === "above_avg" &&
      b.creative_type === creativeType
  );
}

// 3단계 판정: 우수🟢 / 보통🟡 / 미달🔴
function getVerdict(
  value: number | undefined | null,
  aboveAvg: number | undefined | null,
  higherBetter = true
): { emoji: string; className: string } {
  if (value == null || aboveAvg == null || aboveAvg === 0) {
    return { emoji: "", className: "" };
  }
  const threshold = aboveAvg * 0.75;

  if (higherBetter) {
    if (value >= aboveAvg) return { emoji: "🟢", className: "text-green-600 dark:text-green-400" };
    if (value >= threshold) return { emoji: "🟡", className: "text-yellow-600 dark:text-yellow-400" };
    return { emoji: "🔴", className: "text-red-600 dark:text-red-400" };
  } else {
    if (value <= aboveAvg) return { emoji: "🟢", className: "text-green-600 dark:text-green-400" };
    if (value <= aboveAvg * 1.25) return { emoji: "🟡", className: "text-yellow-600 dark:text-yellow-400" };
    return { emoji: "🔴", className: "text-red-600 dark:text-red-400" };
  }
}

// 숫자 포맷
function fmt(n: number | undefined | null): string {
  if (n == null) return "-";
  return n.toLocaleString("ko-KR");
}
function fmtCurrency(n: number | undefined | null): string {
  if (n == null) return "-";
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}
function fmtPercent(n: number | undefined | null): string {
  if (n == null) return "-";
  return n.toFixed(2) + "%";
}

// 인사이트 데이터를 광고별로 집계 (기간 합산)
function aggregateByAd(rows: AdInsightRow[]): AdInsightRow[] {
  const map = new Map<string, AdInsightRow>();

  for (const row of rows) {
    const existing = map.get(row.ad_id);
    if (!existing) {
      map.set(row.ad_id, { ...row });
    } else {
      existing.impressions += row.impressions || 0;
      existing.reach += row.reach || 0;
      existing.clicks += row.clicks || 0;
      existing.spend += row.spend || 0;
      existing.purchases += row.purchases || 0;
      existing.purchase_value += row.purchase_value || 0;
      // ROAS, CTR 등 비율 지표는 합산 후 재계산
      existing.roas =
        existing.spend > 0 ? existing.purchase_value / existing.spend : 0;
      existing.ctr =
        existing.impressions > 0
          ? (existing.clicks / existing.impressions) * 100
          : 0;
    }
  }

  // spend 기준 내림차순 정렬
  return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
}

interface AdMetricsTableProps {
  insights: AdInsightRow[];
  benchmarks: BenchmarkRow[];
}

// 광고 성과 테이블
export function AdMetricsTable({ insights, benchmarks }: AdMetricsTableProps) {
  if (insights.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📊 광고 성과</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-lg">📭</p>
            <p className="mt-2 text-sm">아직 수집된 광고 데이터가 없습니다</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const ads = aggregateByAd(insights);
  const engBench = findAboveAvg(benchmarks, "engagement");
  const convBench = findAboveAvg(benchmarks, "conversion");

  // 전체 합계
  const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
  const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);
  const totalPurchases = ads.reduce((s, a) => s + a.purchases, 0);
  const totalRevenue = ads.reduce((s, a) => s + a.purchase_value, 0);
  const totalRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">📊 광고 성과</CardTitle>
        <p className="text-sm text-muted-foreground">
          광고비 기준 상위 광고 · 벤치마크 대비 판정
        </p>
      </CardHeader>
      <CardContent>
        {/* 요약 카드 */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="총 광고비" value={fmtCurrency(totalSpend)} />
          <SummaryCard label="총 클릭" value={fmt(totalClicks)} />
          <SummaryCard label="총 구매" value={fmt(totalPurchases)} />
          <SummaryCard
            label="ROAS"
            value={totalRoas.toFixed(2)}
            highlight
          />
        </div>

        {/* 광고별 테이블 */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">광고명</TableHead>
                <TableHead className="text-right">광고비</TableHead>
                <TableHead className="text-right">노출</TableHead>
                <TableHead className="text-right">클릭</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">구매</TableHead>
                <TableHead className="text-right">매출</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-center">판정</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ads.slice(0, 10).map((ad) => {
                const roasV = getVerdict(ad.roas, convBench?.avg_roas);
                const ctrV = getVerdict(ad.ctr, convBench?.avg_ctr);

                return (
                  <TableRow key={ad.ad_id}>
                    <TableCell className="max-w-[240px] truncate font-medium">
                      {ad.ad_name || ad.ad_id}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {fmtCurrency(ad.spend)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {fmt(ad.impressions)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {fmt(ad.clicks)}
                    </TableCell>
                    <TableCell className={`text-right whitespace-nowrap font-medium ${ctrV.className}`}>
                      {fmtPercent(ad.ctr)} {ctrV.emoji}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {fmt(ad.purchases)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {fmtCurrency(ad.purchase_value)}
                    </TableCell>
                    <TableCell className={`text-right whitespace-nowrap font-bold ${roasV.className}`}>
                      {ad.roas?.toFixed(2) || "-"}
                    </TableCell>
                    <TableCell className="text-center text-lg">
                      {roasV.emoji || "⚪"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* 범례 */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <span>🟢 우수 (≥ 기준선)</span>
          <span>🟡 보통 (≥ 75%)</span>
          <span>🔴 미달 (&lt; 75%)</span>
          <span>⚪ 데이터 부족</span>
        </div>
      </CardContent>
    </Card>
  );
}

// 요약 미니카드
function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-4 text-center ${
        highlight
          ? "bg-primary text-primary-foreground"
          : "bg-muted"
      }`}
    >
      <div className="text-xl font-bold">{value}</div>
      <div className={`mt-1 text-xs ${highlight ? "opacity-90" : "text-muted-foreground"}`}>
        {label}
      </div>
    </div>
  );
}
