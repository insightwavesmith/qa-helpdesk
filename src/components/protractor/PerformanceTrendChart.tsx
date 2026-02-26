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

const defaultData: ChartDataPoint[] = [
  { date: "1/10", revenue: 4612697, adSpend: 704750 },
  { date: "1/11", revenue: 5052663, adSpend: 692819 },
  { date: "1/12", revenue: 5369854, adSpend: 665277 },
  { date: "1/13", revenue: 5595746, adSpend: 678110 },
  { date: "1/14", revenue: 4384846, adSpend: 557775 },
  { date: "1/15", revenue: 4417977, adSpend: 576604 },
  { date: "1/16", revenue: 3842457, adSpend: 562662 },
  { date: "1/17", revenue: 3831132, adSpend: 585109 },
  { date: "1/18", revenue: 4706055, adSpend: 696522 },
  { date: "1/19", revenue: 4392257, adSpend: 591800 },
  { date: "1/20", revenue: 4362341, adSpend: 622785 },
  { date: "1/21", revenue: 3488529, adSpend: 561432 },
  { date: "1/22", revenue: 4252100, adSpend: 590744 },
  { date: "1/23", revenue: 5168887, adSpend: 675346 },
  { date: "1/24", revenue: 5250892, adSpend: 661037 },
  { date: "1/25", revenue: 4612448, adSpend: 720919 },
  { date: "1/26", revenue: 5421857, adSpend: 705883 },
  { date: "1/27", revenue: 3374418, adSpend: 603560 },
  { date: "1/28", revenue: 3996835, adSpend: 562968 },
  { date: "1/29", revenue: 4863445, adSpend: 663336 },
  { date: "1/30", revenue: 5142579, adSpend: 686230 },
  { date: "1/31", revenue: 4313062, adSpend: 686164 },
  { date: "2/1", revenue: 3467596, adSpend: 603165 },
  { date: "2/2", revenue: 3333584, adSpend: 588476 },
  { date: "2/3", revenue: 5241471, adSpend: 724340 },
  { date: "2/4", revenue: 3793727, adSpend: 584694 },
  { date: "2/5", revenue: 5504253, adSpend: 715567 },
  { date: "2/6", revenue: 4515870, adSpend: 636374 },
];

function formatKRW(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

export function PerformanceTrendChart({
  data = defaultData,
}: PerformanceTrendChartProps) {
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
