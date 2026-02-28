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
import { METRIC_GROUPS, type CommonMetricDef, type MetricGroupDef } from "@/lib/protractor/metric-groups";

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

// METRIC_GROUPS 공통 상수에서 포맷 함수 매핑
function fmtMetricValue(m: CommonMetricDef, n: number | null): string {
  if (n == null) return "-";
  if (m.unit === "pct") return fmtPercent(n);
  if (m.unit === "per10k") return n.toFixed(1);
  return n.toFixed(2);
}

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
          {METRIC_GROUPS.map((group) => (
            <MetricSection
              key={group.groupKey}
              group={group}
              insights={insights}
              engBench={engBench}
              convBench={convBench}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// 지표 섹션 (3열 중 하나) — METRIC_GROUPS 공통 상수 사용
function MetricSection({
  group,
  insights,
  engBench,
  convBench,
}: {
  group: MetricGroupDef;
  insights: AdInsightRow[];
  engBench: BenchmarkRow | undefined;
  convBench: BenchmarkRow | undefined;
}) {
  const badge = group.metrics[0]?.benchGroup === "engagement" ? "Engagement 기준" : "Conversion 기준";
  const allMetrics = [...group.metrics, ...(group.summaryMetric ? [group.summaryMetric] : [])];

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold">{group.label}</span>
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
          {allMetrics.map((m) => {
            const myVal = calcAverage(insights, m.key as keyof AdInsightRow);
            const bench = m.benchGroup === "engagement" ? engBench : convBench;
            const benchVal = bench
              ? (bench[m.benchKey] as number | undefined)
              : undefined;
            const v = getVerdict(myVal, benchVal ?? null, m.ascending);

            return (
              <TableRow key={m.key}>
                <TableCell className="text-xs">{m.label}</TableCell>
                <TableCell
                  className={`text-right text-xs font-medium ${v.className}`}
                >
                  {fmtMetricValue(m, myVal)}
                </TableCell>
                <TableCell className="text-center"><VerdictDot label={v.label} /></TableCell>
                <TableCell className="text-right text-[11px] text-muted-foreground">
                  {benchVal != null ? fmtMetricValue(m, benchVal) : "-"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
