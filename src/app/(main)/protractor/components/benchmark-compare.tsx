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
import type { AdInsightRow, BenchmarkRow } from "./ad-metrics-table";

// 벤치마크에서 above_avg 그룹 값 찾기
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

// 3단계 판정
function getVerdict(
  value: number | undefined | null,
  aboveAvg: number | undefined | null,
  higherBetter = true
): { emoji: string; className: string; label: string } {
  if (value == null || aboveAvg == null || aboveAvg === 0) {
    return { emoji: "⚪", className: "text-muted-foreground", label: "데이터 없음" };
  }
  const threshold = aboveAvg * 0.75;

  if (higherBetter) {
    if (value >= aboveAvg)
      return { emoji: "🟢", className: "text-green-600 dark:text-green-400", label: "우수" };
    if (value >= threshold)
      return { emoji: "🟡", className: "text-yellow-600 dark:text-yellow-400", label: "보통" };
    return { emoji: "🔴", className: "text-red-600 dark:text-red-400", label: "미달" };
  } else {
    if (value <= aboveAvg)
      return { emoji: "🟢", className: "text-green-600 dark:text-green-400", label: "우수" };
    if (value <= aboveAvg * 1.25)
      return { emoji: "🟡", className: "text-yellow-600 dark:text-yellow-400", label: "보통" };
    return { emoji: "🔴", className: "text-red-600 dark:text-red-400", label: "미달" };
  }
}

function fmtPct(n: number | undefined | null): string {
  if (n == null) return "-";
  return n.toFixed(2) + "%";
}

// 인사이트에서 기간 평균 계산
function calcAverage(
  insights: AdInsightRow[],
  key: keyof AdInsightRow
): number | null {
  const values = insights
    .map((r) => r[key] as number)
    .filter((v) => v != null && !isNaN(v));
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// 지표 행 정의
interface MetricDef {
  label: string;
  insightKey: keyof AdInsightRow;
  benchKey: string;
  benchGroup: "engagement" | "conversion";
  higherBetter: boolean;
  format: (n: number | null) => string;
}

const VIDEO_METRICS: MetricDef[] = [
  {
    label: "3초 시청률",
    insightKey: "video_p3s_rate",
    benchKey: "avg_video_p3s_rate",
    benchGroup: "engagement",
    higherBetter: true,
    format: fmtPct,
  },
  {
    label: "ThruPlay율",
    insightKey: "thruplay_rate",
    benchKey: "avg_thruplay_rate",
    benchGroup: "engagement",
    higherBetter: true,
    format: fmtPct,
  },
  {
    label: "지속 비율",
    insightKey: "retention_rate",
    benchKey: "avg_retention_rate",
    benchGroup: "engagement",
    higherBetter: true,
    format: fmtPct,
  },
];

const ENGAGEMENT_METRICS: MetricDef[] = [
  {
    label: "광고 CTR",
    insightKey: "ctr",
    benchKey: "avg_ctr",
    benchGroup: "conversion",
    higherBetter: true,
    format: fmtPct,
  },
  {
    label: "좋아요/만노출",
    insightKey: "reactions_per_10k",
    benchKey: "avg_reactions_per_10k",
    benchGroup: "engagement",
    higherBetter: true,
    format: (n) => (n != null ? n.toFixed(1) : "-"),
  },
  {
    label: "댓글/만노출",
    insightKey: "comments_per_10k",
    benchKey: "avg_comments_per_10k",
    benchGroup: "engagement",
    higherBetter: true,
    format: (n) => (n != null ? n.toFixed(2) : "-"),
  },
  {
    label: "공유/만노출",
    insightKey: "shares_per_10k",
    benchKey: "avg_shares_per_10k",
    benchGroup: "engagement",
    higherBetter: true,
    format: (n) => (n != null ? n.toFixed(1) : "-"),
  },
];

const CONVERSION_METRICS: MetricDef[] = [
  {
    label: "클릭→장바구니",
    insightKey: "click_to_cart_rate",
    benchKey: "avg_click_to_cart_rate",
    benchGroup: "conversion",
    higherBetter: true,
    format: fmtPct,
  },
  {
    label: "클릭→결제시작",
    insightKey: "click_to_checkout_rate",
    benchKey: "avg_click_to_checkout_rate",
    benchGroup: "conversion",
    higherBetter: true,
    format: fmtPct,
  },
  {
    label: "결제→구매",
    insightKey: "checkout_to_purchase_rate",
    benchKey: "avg_checkout_to_purchase_rate",
    benchGroup: "conversion",
    higherBetter: true,
    format: fmtPct,
  },
  {
    label: "클릭→구매",
    insightKey: "click_to_purchase_rate",
    benchKey: "avg_click_to_purchase_rate",
    benchGroup: "conversion",
    higherBetter: true,
    format: fmtPct,
  },
  {
    label: "ROAS",
    insightKey: "roas",
    benchKey: "avg_roas",
    benchGroup: "conversion",
    higherBetter: true,
    format: (n) => (n != null ? n.toFixed(2) : "-"),
  },
];

interface BenchmarkCompareProps {
  insights: AdInsightRow[];
  benchmarks: BenchmarkRow[];
}

// 벤치마크 비교 카드
export function BenchmarkCompare({
  insights,
  benchmarks,
}: BenchmarkCompareProps) {
  if (insights.length === 0 || benchmarks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📐 벤치마크 비교</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-lg">📭</p>
            <p className="mt-2 text-sm">
              비교할 데이터가 부족합니다
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const engBench = findAboveAvg(benchmarks, "engagement");
  const convBench = findAboveAvg(benchmarks, "conversion");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">📐 벤치마크 비교</CardTitle>
        <p className="text-sm text-muted-foreground">
          내 평균 수치 vs 업종 상위 기준선
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* 영상 기반점수 */}
          <MetricSection
            title="🎬 기반점수 (영상)"
            badge="Engagement 기준"
            metrics={VIDEO_METRICS}
            insights={insights}
            engBench={engBench}
            convBench={convBench}
          />

          {/* 참여율 */}
          <MetricSection
            title="💬 참여율"
            badge="Engagement 기준"
            metrics={ENGAGEMENT_METRICS}
            insights={insights}
            engBench={engBench}
            convBench={convBench}
          />

          {/* 전환율 */}
          <MetricSection
            title="🛒 전환율"
            badge="Conversion 기준"
            metrics={CONVERSION_METRICS}
            insights={insights}
            engBench={engBench}
            convBench={convBench}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// 지표 섹션 (3열 중 하나)
function MetricSection({
  title,
  badge,
  metrics,
  insights,
  engBench,
  convBench,
}: {
  title: string;
  badge: string;
  metrics: MetricDef[];
  insights: AdInsightRow[];
  engBench: BenchmarkRow | undefined;
  convBench: BenchmarkRow | undefined;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {badge}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">지표</TableHead>
            <TableHead className="text-right text-xs">내 수치</TableHead>
            <TableHead className="text-center text-xs">판정</TableHead>
            <TableHead className="text-right text-xs">기준선</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {metrics.map((m) => {
            const myVal = calcAverage(insights, m.insightKey);
            const bench = m.benchGroup === "engagement" ? engBench : convBench;
            const benchVal = bench
              ? (bench[m.benchKey] as number | undefined)
              : undefined;
            const v = getVerdict(myVal, benchVal ?? null, m.higherBetter);

            return (
              <TableRow key={m.label}>
                <TableCell className="text-xs">{m.label}</TableCell>
                <TableCell
                  className={`text-right text-xs font-medium ${v.className}`}
                >
                  {m.format(myVal)}
                </TableCell>
                <TableCell className="text-center">{v.emoji}</TableCell>
                <TableCell className="text-right text-[11px] text-muted-foreground">
                  {benchVal != null ? m.format(benchVal) : "-"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
