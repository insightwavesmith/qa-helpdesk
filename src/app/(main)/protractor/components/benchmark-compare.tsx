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
import { Inbox, Ruler } from "lucide-react";
import type { AdInsightRow, BenchmarkRow } from "./ad-metrics-table";
import { findAboveAvg, getVerdict, fmtPercent } from "./utils";
import { VerdictDot } from "./verdict-dot";

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
    format: fmtPercent,
  },
  {
    label: "ThruPlay율",
    insightKey: "thruplay_rate",
    benchKey: "avg_thruplay_rate",
    benchGroup: "engagement",
    higherBetter: true,
    format: fmtPercent,
  },
  {
    label: "지속 비율",
    insightKey: "retention_rate",
    benchKey: "avg_retention_rate",
    benchGroup: "engagement",
    higherBetter: true,
    format: fmtPercent,
  },
];

const ENGAGEMENT_METRICS: MetricDef[] = [
  {
    label: "광고 CTR",
    insightKey: "ctr",
    benchKey: "avg_ctr",
    benchGroup: "conversion",
    higherBetter: true,
    format: fmtPercent,
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
    format: fmtPercent,
  },
  {
    label: "클릭→결제시작",
    insightKey: "click_to_checkout_rate",
    benchKey: "avg_click_to_checkout_rate",
    benchGroup: "conversion",
    higherBetter: true,
    format: fmtPercent,
  },
  {
    label: "결제→구매",
    insightKey: "checkout_to_purchase_rate",
    benchKey: "avg_checkout_to_purchase_rate",
    benchGroup: "conversion",
    higherBetter: true,
    format: fmtPercent,
  },
  {
    label: "클릭→구매",
    insightKey: "click_to_purchase_rate",
    benchKey: "avg_click_to_purchase_rate",
    benchGroup: "conversion",
    higherBetter: true,
    format: fmtPercent,
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
          <CardTitle className="flex items-center gap-2 text-base">
            <Ruler className="h-4 w-4" />
            벤치마크 비교
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Inbox className="h-8 w-8" />
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
        <CardTitle className="flex items-center gap-2 text-base">
          <Ruler className="h-4 w-4" />
          벤치마크 비교
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          내 평균 수치 vs 업종 상위 기준선
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* 영상 기반점수 */}
          <MetricSection
            title="기반점수 (영상)"
            badge="Engagement 기준"
            metrics={VIDEO_METRICS}
            insights={insights}
            engBench={engBench}
            convBench={convBench}
          />

          {/* 참여율 */}
          <MetricSection
            title="참여율"
            badge="Engagement 기준"
            metrics={ENGAGEMENT_METRICS}
            insights={insights}
            engBench={engBench}
            convBench={convBench}
          />

          {/* 전환율 */}
          <MetricSection
            title="전환율"
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
                <TableCell className="text-center"><VerdictDot label={v.label} /></TableCell>
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
