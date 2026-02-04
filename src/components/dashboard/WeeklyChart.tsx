"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface WeeklyChartProps {
  data: { date: string; label: string; 질문수: number }[];
}

export function WeeklyChart({ data }: WeeklyChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        데이터가 없습니다.
      </div>
    );
  }

  // Show every 7th label to avoid clutter
  const tickIndices = new Set<number>();
  for (let i = 0; i < data.length; i += 7) {
    tickIndices.add(i);
  }
  tickIndices.add(data.length - 1);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorQuestions" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          tickFormatter={(value, index) =>
            tickIndices.has(index) ? value : ""
          }
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
        />
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid hsl(var(--border))",
            backgroundColor: "hsl(var(--background))",
          }}
        />
        <Area
          type="monotone"
          dataKey="질문수"
          stroke="hsl(var(--primary))"
          fillOpacity={1}
          fill="url(#colorQuestions)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
