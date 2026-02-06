"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const chartData = [
  { date: "01/01", revenue: 3200, adSpend: 680, roas: 4.7 },
  { date: "01/03", revenue: 3800, adSpend: 750, roas: 5.1 },
  { date: "01/05", revenue: 4100, adSpend: 820, roas: 5.0 },
  { date: "01/07", revenue: 3600, adSpend: 700, roas: 5.1 },
  { date: "01/09", revenue: 4500, adSpend: 900, roas: 5.0 },
  { date: "01/11", revenue: 4200, adSpend: 850, roas: 4.9 },
  { date: "01/12", revenue: 3900, adSpend: 800, roas: 4.9 },
  { date: "01/13", revenue: 4800, adSpend: 950, roas: 5.1 },
  { date: "01/14", revenue: 5100, adSpend: 1000, roas: 5.1 },
  { date: "01/15", revenue: 4600, adSpend: 920, roas: 5.0 },
  { date: "01/16", revenue: 5300, adSpend: 1050, roas: 5.0 },
  { date: "01/17", revenue: 4900, adSpend: 980, roas: 5.0 },
  { date: "01/18", revenue: 5500, adSpend: 1100, roas: 5.0 },
  { date: "01/19", revenue: 5200, adSpend: 1020, roas: 5.1 },
  { date: "01/21", revenue: 4700, adSpend: 940, roas: 5.0 },
  { date: "01/22", revenue: 5800, adSpend: 1150, roas: 5.0 },
  { date: "01/24", revenue: 6200, adSpend: 1200, roas: 5.2 },
  { date: "01/26", revenue: 5900, adSpend: 1100, roas: 5.4 },
  { date: "01/28", revenue: 6500, adSpend: 1250, roas: 5.2 },
  { date: "01/31", revenue: 7200, adSpend: 1400, roas: 5.1 },
];

type MetricKey = "revenue" | "adSpend" | "roas";

interface MetricConfig {
  key: MetricKey;
  label: string;
  color: string;
}

const metrics: MetricConfig[] = [
  { key: "revenue", label: "매출", color: "#E85A2A" },
  { key: "adSpend", label: "광고비", color: "#3B82F6" },
  { key: "roas", label: "ROAS", color: "#10B981" },
];

export function PerformanceChart() {
  const [activeMetrics, setActiveMetrics] = useState<Set<MetricKey>>(
    new Set(["revenue", "adSpend"])
  );

  const toggleMetric = (key: MetricKey) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="space-y-1.5 p-6 flex flex-row items-center justify-between pb-2">
        <div className="tracking-tight text-base font-semibold text-card-foreground">
          광고 성과 추이
        </div>
        <div className="flex items-center gap-2">
          {metrics.map((m) => (
            <button
              key={m.key}
              onClick={() => toggleMetric(m.key)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                activeMetrics.has(m.key)
                  ? "bg-secondary text-card-foreground"
                  : "text-muted-foreground hover:text-card-foreground"
              }`}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: m.color }}
              />
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-6 pt-0">
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E85A2A" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#E85A2A" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradAdSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradRoas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e2e8f0"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`
                }
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                domain={[0, 8]}
                tickFormatter={(v) => `${v}x`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              {activeMetrics.has("revenue") && (
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#E85A2A"
                  strokeWidth={2}
                  fill="url(#gradRevenue)"
                  name="매출"
                  yAxisId="left"
                />
              )}
              {activeMetrics.has("adSpend") && (
                <Area
                  type="monotone"
                  dataKey="adSpend"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="url(#gradAdSpend)"
                  name="광고비"
                  yAxisId="left"
                />
              )}
              {activeMetrics.has("roas") && (
                <Area
                  type="monotone"
                  dataKey="roas"
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="url(#gradRoas)"
                  name="ROAS"
                  yAxisId="right"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
