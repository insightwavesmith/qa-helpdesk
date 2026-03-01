"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

interface ChartDataPoint {
  date: string;
  revenue: number;
  adSpend: number;
}

interface PerformanceTrendChartProps {
  data?: ChartDataPoint[];
}

function formatKRW(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

export function PerformanceTrendChart({
  data,
}: PerformanceTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
        <div className="border-b border-border px-6 py-4">
          <h3 className="text-sm font-semibold text-card-foreground">
            광고매출 vs 광고비 추이
          </h3>
        </div>
        <div className="flex items-center justify-center px-4 py-16">
          <p className="text-sm text-muted-foreground">차트 데이터가 없습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-sm font-semibold text-card-foreground">
          광고매출 vs 광고비 추이
        </h3>
        <p className="text-xs text-muted-foreground">
          기간 내 일별 광고매출과 광고비 비교
        </p>
      </div>
      <div className="px-4 py-4">
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0.15}
                />
                <stop
                  offset="95%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0}
                />
              </linearGradient>
              <linearGradient id="colorAdSpend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={formatKRW}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: any, name: any) => [
                `₩${Number(value ?? 0).toLocaleString()}`,
                name === "revenue" ? "광고매출" : "광고비",
              ]) as never}
              labelStyle={{ fontSize: 12 }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
              }}
            />
            <Legend
              formatter={(value: string) =>
                value === "revenue" ? "광고매출" : "광고비"
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#colorRevenue)"
            />
            <Area
              type="monotone"
              dataKey="adSpend"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#colorAdSpend)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
