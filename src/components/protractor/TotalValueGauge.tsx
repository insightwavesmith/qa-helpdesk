"use client";

import { Card, CardContent } from "@/components/ui/card";

interface MetricData {
  name: string;
  value: number | null;
  p50: number | null;
  p75: number | null;
  status: string; // 🟢🟡🔴⚪
}

interface TotalValueGaugeProps {
  grade?: "A" | "B" | "C" | "D" | "F";
  gradeLabel?: string;
  totalSpend?: number;
  metrics?: MetricData[];
  dateRange?: { start: string; end: string };
  isLoading?: boolean;
}

const GRADE_COLORS: Record<string, string> = {
  A: "border-green-500 bg-green-50 text-green-700",
  B: "border-blue-500 bg-blue-50 text-blue-700",
  C: "border-yellow-500 bg-yellow-50 text-yellow-700",
  D: "border-orange-500 bg-orange-50 text-orange-700",
  F: "border-red-500 bg-red-50 text-red-700",
};

const STATUS_COLORS: Record<string, { bar: string; text: string }> = {
  "🟢": { bar: "bg-green-500", text: "text-green-600" },
  "🟡": { bar: "bg-yellow-500", text: "text-yellow-600" },
  "🔴": { bar: "bg-red-500", text: "text-red-600" },
  "⚪": { bar: "bg-gray-300", text: "text-gray-400" },
};

function fmtCurrency(n: number): string {
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

function fmtValue(v: number | null, name: string): string {
  if (v == null) return "-";
  if (name.includes("만노출")) return v.toFixed(1);
  return v.toFixed(2) + "%";
}

function calcBarWidth(value: number | null, p75: number | null): number {
  if (value == null || p75 == null || p75 === 0) return 0;
  const pct = Math.min((value / p75) * 100, 150);
  return Math.max(pct, 5);
}

function buildDiagnosticText(
  grade: string,
  metrics: MetricData[],
): string | null {
  const good: string[] = [];
  const bad: string[] = [];

  for (const m of metrics) {
    if (m.status === "🟢") good.push(m.name);
    else if (m.status === "🔴") bad.push(m.name);
    // 🟡(보통), ⚪(데이터없음)는 진단 문구에서 제외
  }

  // 모든 지표가 ⚪이면 텍스트 미표시
  if (good.length === 0 && bad.length === 0) return null;

  if (bad.length === 0) {
    return `${grade}등급 — 모든 지표가 벤치마크 상위 수준입니다`;
  }
  if (good.length === 0) {
    return `${grade}등급 — 전체적인 개선이 필요합니다 (${bad.join("·")} 미달)`;
  }
  return `${grade}등급 — ${good.join("·")}은 우수하나, ${bad.join("·")}이 벤치마크 미달`;
}

export function TotalValueGauge({
  grade,
  gradeLabel,
  totalSpend,
  metrics,
  dateRange,
  isLoading,
}: TotalValueGaugeProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="ml-2 text-sm text-muted-foreground">총가치수준 계산 중...</span>
        </CardContent>
      </Card>
    );
  }

  if (!grade || !metrics) {
    return null;
  }

  const gradeColor = GRADE_COLORS[grade] ?? GRADE_COLORS.C;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
          {/* 좌측: 등급 */}
          <div className="flex flex-shrink-0 items-center gap-4 lg:flex-col lg:items-center lg:gap-2">
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-full border-4 ${gradeColor}`}
            >
              <span className="text-3xl font-black">{grade}</span>
            </div>
            <div className="lg:text-center">
              <p className="text-sm font-semibold">{gradeLabel}</p>
              {totalSpend != null && (
                <p className="text-xs text-muted-foreground">
                  광고비 {fmtCurrency(totalSpend)}
                </p>
              )}
              {dateRange && (
                <p className="text-[11px] text-muted-foreground">
                  {dateRange.start} ~ {dateRange.end}
                </p>
              )}
            </div>
          </div>

          {/* 우측: 6개 지표 */}
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
            {metrics.map((m) => {
              const sc = STATUS_COLORS[m.status] ?? STATUS_COLORS["⚪"];
              const barW = calcBarWidth(m.value, m.p75);

              return (
                <div
                  key={m.name}
                  className="rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{m.name}</span>
                    <span className="text-sm">{m.status}</span>
                  </div>
                  <div className={`mt-1 text-lg font-bold ${sc.text}`}>
                    {fmtValue(m.value, m.name)}
                  </div>
                  {/* 게이지 바 */}
                  <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`absolute left-0 top-0 h-full rounded-full transition-all ${sc.bar}`}
                      style={{ width: `${Math.min(barW, 100)}%` }}
                    />
                    {/* p75 기준선 마커 */}
                    {m.p75 != null && (
                      <div
                        className="absolute top-0 h-full w-px bg-gray-400"
                        style={{ left: `${Math.min((100 / 150) * 100, 100)}%` }}
                        title={`p75: ${m.p75}`}
                      />
                    )}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>p50: {m.p50 != null ? m.p50.toFixed(2) : "-"}</span>
                    <span>p75: {m.p75 != null ? m.p75.toFixed(2) : "-"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 하단: 한줄 진단 텍스트 */}
        {(() => {
          const diagText = buildDiagnosticText(grade, metrics);
          if (!diagText) return null;
          return (
            <div className="mt-4 rounded-lg bg-muted/50 px-4 py-3">
              <p className="text-sm text-muted-foreground">{diagText}</p>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
