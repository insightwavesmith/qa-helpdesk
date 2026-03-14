"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

// ─── 타입 ────────────────────────────────────────────────────

export interface UsageRow {
  consumer_type: string;
  total_tokens: number;
  duration_ms: number;
  created_at: string;
  model: string;
}

export interface ChunkStat {
  source_type: string;
  cnt: number;
}

// ─── 차트 색상 ──────────────────────────────────────────────

const PIE_COLORS = [
  "#F75D5D",
  "#60a5fa",
  "#4ade80",
  "#fbbf24",
  "#c084fc",
  "#fb923c",
];

const SOURCE_COLORS: Record<string, string> = {
  lecture: "#F75D5D",
  blueprint: "#60a5fa",
  papers: "#4ade80",
  crawl: "#fbbf24",
  marketing_theory: "#c084fc",
  meeting: "#fb923c",
  webinar: "#f472b6",
  file: "#94a3b8",
};

// ─── Props ────────────────────────────────────────────────────

interface DailyCostEntry {
  date: string;
  cost: number;
}

interface ConsumerPieEntry {
  name: string;
  value: number;
}

interface DurationEntry {
  date: string;
  avg: number;
}

interface MonitoringChartsProps {
  dailyCostChart: DailyCostEntry[];
  consumerPieChart: ConsumerPieEntry[];
  durationChart: DurationEntry[];
}

interface EmbeddingChartProps {
  chunkStats: ChunkStat[];
}

// ─── 모니터링 차트 컴포넌트 ───────────────────────────────────

export function MonitoringCharts({
  dailyCostChart,
  consumerPieChart,
  durationChart,
}: MonitoringChartsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-6">
        {/* 일별 비용 */}
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-[14px] font-semibold text-gray-700 mb-4">
              일별 AI 비용 ($)
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyCostChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="cost" fill="#F75D5D" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Consumer별 사용량 */}
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-[14px] font-semibold text-gray-700 mb-4">
              Consumer별 사용량
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={consumerPieChart}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={({ name, value }: { name?: string; value?: number }) =>
                    `${name ?? ""} (${value ?? 0})`
                  }
                >
                  {consumerPieChart.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 평균 응답시간 */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-[14px] font-semibold text-gray-700 mb-4">
            평균 응답시간 (초)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={durationChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="avg"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </>
  );
}

// ─── 임베딩 차트 컴포넌트 ─────────────────────────────────────

export function EmbeddingChart({ chunkStats }: EmbeddingChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chunkStats} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="source_type"
          tick={{ fontSize: 12 }}
          width={120}
        />
        <Tooltip />
        <Bar
          dataKey="cnt"
          fill="#94a3b8"
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
        >
          {chunkStats.map((entry, i) => (
            <Cell
              key={`cell-${i}`}
              fill={SOURCE_COLORS[entry.source_type] || "#94a3b8"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
