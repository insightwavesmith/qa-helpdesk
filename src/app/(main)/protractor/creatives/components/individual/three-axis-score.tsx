"use client";

import { useState } from "react";

// ── 타입 ──────────────────────────────────────────────────────────

interface PerformanceData {
  impressions: number;
  reach: number;
  spend: number;
  ctr: number;
  cpc: number;
  roas: number;
  video_p3s_rate: number | null;
  video_thruplay_rate: number | null;
  video_p25_rate: number | null;
  video_p50_rate: number | null;
  video_p75_rate: number | null;
  video_p100_rate: number | null;
  shares_per_10k: number | null;
  saves_per_10k: number | null;
  purchase_count: number;
  reach_to_purchase_rate: number;
}

interface BenchmarkMetrics {
  [metric: string]: { p25: number; p50: number; p75: number };
}

interface BenchmarksData {
  category: string;
  metrics: BenchmarkMetrics;
}

interface ThreeAxisScoreProps {
  performance: PerformanceData | null;
  benchmarks: BenchmarksData | null;
}

// ── 축 정의 ──────────────────────────────────────────────────────

interface AxisConfig {
  key: string;
  label: string;
  subLabel: string;
  color: string;
  bgColor: string;
  borderColor: string;
  emoji: string;
  primaryMetric: string;
  primaryLabel: string;
  detailMetrics: Array<{
    key: string;
    label: string;
    format: (v: number) => string;
  }>;
  getScore: (perf: PerformanceData, bm: BenchmarkMetrics) => number;
  getPrimaryValue: (perf: PerformanceData) => number | null;
  getPrimaryFormatted: (perf: PerformanceData) => string;
}

function pctFormat(v: number): string {
  return `${v.toFixed(2)}%`;
}

function per10kFormat(v: number): string {
  return v.toFixed(1);
}

const AXES: AxisConfig[] = [
  {
    key: "foundation",
    label: "기반",
    subLabel: "보긴 하나?",
    color: "#10b981",
    bgColor: "rgba(16,185,129,0.15)",
    borderColor: "rgba(16,185,129,0.2)",
    emoji: "🟢",
    primaryMetric: "video_p3s_rate",
    primaryLabel: "3초시청률",
    detailMetrics: [
      { key: "video_p3s_rate", label: "3초시청률", format: pctFormat },
      { key: "video_p25_rate", label: "25%재생률", format: pctFormat },
      { key: "video_p50_rate", label: "50%재생률", format: pctFormat },
      { key: "video_p75_rate", label: "75%재생률", format: pctFormat },
      { key: "video_p100_rate", label: "100%재생률", format: pctFormat },
    ],
    getScore: (perf, bm) => {
      const val = perf.video_p3s_rate ?? perf.ctr;
      const bench = bm?.video_p3s_rate?.p50 ?? bm?.ctr?.p50;
      if (!val || !bench || bench === 0) return 0;
      return Math.min(100, Math.max(0, (val / bench) * 50));
    },
    getPrimaryValue: (perf) => perf.video_p3s_rate,
    getPrimaryFormatted: (perf) =>
      perf.video_p3s_rate != null
        ? `3초시청률 ${perf.video_p3s_rate.toFixed(2)}%`
        : "데이터 수집 중",
  },
  {
    key: "engagement",
    label: "참여",
    subLabel: "관심 갖나?",
    color: "#f59e0b",
    bgColor: "rgba(245,158,11,0.15)",
    borderColor: "rgba(245,158,11,0.2)",
    emoji: "🟡",
    primaryMetric: "shares_per_10k",
    primaryLabel: "참여지표",
    detailMetrics: [
      { key: "shares_per_10k", label: "공유/만노출", format: per10kFormat },
      { key: "saves_per_10k", label: "저장/만노출", format: per10kFormat },
    ],
    getScore: (perf, bm) => {
      const val = perf.shares_per_10k ?? 0;
      const bench = bm?.shares_per_10k?.p50;
      if (!val || !bench || bench === 0) return 0;
      return Math.min(100, Math.max(0, (val / bench) * 50));
    },
    getPrimaryValue: (perf) => perf.shares_per_10k,
    getPrimaryFormatted: (perf) =>
      perf.shares_per_10k != null
        ? `공유 ${perf.shares_per_10k.toFixed(1)}/만노출`
        : "데이터 수집 중",
  },
  {
    key: "conversion",
    label: "전환",
    subLabel: "클릭하나?",
    color: "#ef4444",
    bgColor: "rgba(239,68,68,0.15)",
    borderColor: "rgba(239,68,68,0.2)",
    emoji: "🔴",
    primaryMetric: "ctr",
    primaryLabel: "전환지표",
    detailMetrics: [
      { key: "ctr", label: "CTR", format: pctFormat },
    ],
    getScore: (perf, bm) => {
      const val = perf.ctr;
      const bench = bm?.ctr?.p50;
      if (!val || !bench || bench === 0) return 0;
      return Math.min(100, Math.max(0, (val / bench) * 50));
    },
    getPrimaryValue: (perf) => perf.ctr,
    getPrimaryFormatted: (perf) =>
      `CTR ${perf.ctr.toFixed(2)}%`,
  },
];

// ── 벤치마크 상태 이모지 ──────────────────────────────────────────

function getStatusEmoji(
  actual: number,
  p50: number,
  p75: number
): { emoji: string; color: string } {
  if (actual >= p75) return { emoji: "🟢", color: "#10b981" };
  if (actual >= p50 * 0.75) return { emoji: "🟡", color: "#f59e0b" };
  return { emoji: "🔴", color: "#ef4444" };
}

function getScoreColor(score: number, axisColor: string): string {
  if (score >= 50) return axisColor;
  return "#ef4444";
}

// ── 컴포넌트 ──────────────────────────────────────────────────────

export function ThreeAxisScore({ performance, benchmarks }: ThreeAxisScoreProps) {
  const [showDetails, setShowDetails] = useState(false);

  if (!performance) {
    return (
      <div
        className="rounded-xl border p-4"
        style={{ background: "#f8fafc", borderColor: "#e2e8f0", borderLeftWidth: 4, borderLeftColor: "#ef4444" }}
      >
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-base"
            style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}
          >
            📊
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: "#ef4444" }}>
              성과 — 이 광고는 지금 이 정도야
            </div>
            <div className="text-xs" style={{ color: "#64748b" }}>성과 데이터 수집 중</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {AXES.map((axis) => (
            <div
              key={axis.key}
              className="bg-white rounded-lg p-3 text-center"
              style={{ borderTop: `3px solid ${axis.color}` }}
            >
              <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                {axis.emoji} {axis.label} ({axis.subLabel})
              </div>
              <div
                className="text-3xl font-extrabold my-1"
                style={{ color: "#e2e8f0" }}
              >
                —
              </div>
              <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>데이터 수집 중</div>
              <div className="h-1.5 rounded-full mt-1.5" style={{ background: "#e2e8f0" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const bm = benchmarks?.metrics ?? {};

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: "#f8fafc", borderColor: "#e2e8f0", borderLeftWidth: 4, borderLeftColor: "#ef4444" }}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-base"
          style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}
        >
          📊
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: "#ef4444" }}>
            성과 — 이 광고는 지금 이 정도야
          </div>
          <div className="text-xs" style={{ color: "#64748b" }}>벤치마크 대비 어디가 부족한지</div>
        </div>
      </div>

      {/* 3축 카드 */}
      <div className="grid grid-cols-3 gap-2.5 mb-3">
        {AXES.map((axis) => {
          const score = Math.round(axis.getScore(performance, bm));
          const scoreColor = getScoreColor(score, axis.color);
          const primaryFormatted = axis.getPrimaryFormatted(performance);

          return (
            <div
              key={axis.key}
              className="bg-white rounded-lg p-3 text-center"
              style={{ borderTop: `3px solid ${axis.color}` }}
            >
              <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                {axis.emoji} {axis.label} ({axis.subLabel})
              </div>
              <div
                className="text-3xl font-extrabold my-1"
                style={{ color: scoreColor }}
              >
                {score}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#475569" }}>{primaryFormatted}</div>
              {/* 스코어 바 */}
              <div className="h-1.5 rounded-full mt-1.5" style={{ background: "#e2e8f0" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${score}%`,
                    background: scoreColor,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 세부항목 토글 */}
      <div className="text-center mb-2">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="bg-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors hover:bg-gray-50"
          style={{ border: "1px solid #e2e8f0", color: "#64748b" }}
        >
          {showDetails ? "▴ 세부항목 접기" : "▾ 세부항목 보기"}
        </button>
      </div>

      {/* 세부항목 */}
      {showDetails && (
        <div className="grid grid-cols-3 gap-2.5">
          {AXES.map((axis) => (
            <div
              key={axis.key}
              className="bg-white rounded-lg p-2.5"
              style={{ border: `1px solid ${axis.borderColor}` }}
            >
              <div
                className="font-bold mb-1.5"
                style={{ fontSize: "0.72rem", color: axis.color }}
              >
                {axis.emoji} {axis.label}
              </div>
              <div className="space-y-1">
                {axis.detailMetrics.map((dm) => {
                  const actual =
                    performance[dm.key as keyof PerformanceData] as number | null;
                  const bench = bm[dm.key];
                  if (actual == null) return (
                    <div
                      key={dm.key}
                      className="flex items-center justify-between"
                      style={{ fontSize: "0.7rem", color: "#94a3b8" }}
                    >
                      <span>{dm.label}</span>
                      <span>수집 중</span>
                    </div>
                  );
                  const p50 = bench?.p50;
                  const p75 = bench?.p75;
                  const status =
                    p50 != null && p75 != null
                      ? getStatusEmoji(actual, p50, p75)
                      : null;

                  return (
                    <div
                      key={dm.key}
                      className="flex items-center justify-between"
                      style={{ fontSize: "0.7rem", color: "#475569" }}
                    >
                      <span>{dm.label}</span>
                      <span>
                        {dm.format(actual)}
                        {p50 != null && ` / ${dm.format(p50)}`}
                        {status && (
                          <span className="ml-1">{status.emoji}</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
