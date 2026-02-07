"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ChartDataPoint {
  date: string;
  revenue: number;
  adSpend: number;
  roas: number;
}

interface PerformanceChartProps {
  data?: ChartDataPoint[];
}

type MetricKey = "revenue" | "adSpend" | "roas";

interface MetricConfig {
  key: MetricKey;
  label: string;
  color: string;
}

const metrics: MetricConfig[] = [
  { key: "revenue", label: "매출", color: "#F75D5D" },
  { key: "adSpend", label: "광고비", color: "#3B82F6" },
  { key: "roas", label: "ROAS", color: "#10B981" },
];

export function PerformanceChart({ data = [] }: PerformanceChartProps) {
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

  if (data.length === 0) {
    return (
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="space-y-1.5 p-6 pb-2">
          <div className="tracking-tight text-base font-semibold text-card-foreground">
            광고 성과 추이
          </div>
        </div>
        <div className="p-6 pt-0">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 mb-4">
              <BarChart3 className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1">데이터가 없습니다</p>
            <p className="text-xs text-gray-500">광고 데이터가 연동되면 추이를 확인할 수 있습니다</p>
          </div>
        </div>
      </div>
    );
  }

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
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F75D5D" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#F75D5D" stopOpacity={0} />
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
                  stroke="#F75D5D"
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
