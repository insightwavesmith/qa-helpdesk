"use client";

import type { PortfolioCreativeItem } from "./portfolio-tab-v2";

// ── 타입 ──────────────────────────────────────────────────────────

interface AxisDistributionProps {
  results: PortfolioCreativeItem[];
}

// ── 5축 설정 ─────────────────────────────────────────────────────

interface AxisConfig {
  key: string;
  label: string;
  icon: string;
  color: string;
  extractScore: (item: PortfolioCreativeItem) => number | null;
  extractCategory?: (item: PortfolioCreativeItem) => string | null;
}

const AXIS_CONFIGS: AxisConfig[] = [
  {
    key: "visual",
    label: "비주얼 임팩트",
    icon: "👁",
    color: "#ef4444",
    extractScore: (item) => item.visual_impact ?? null,
  },
  {
    key: "message",
    label: "메시지 명확도",
    icon: "💬",
    color: "#3b82f6",
    extractScore: (item) => item.message_clarity ?? null,
  },
  {
    key: "cta",
    label: "CTA 효과",
    icon: "🎯",
    color: "#10b981",
    extractScore: (item) => item.cta_effectiveness ?? null,
  },
  {
    key: "social",
    label: "사회적 증거",
    icon: "👥",
    color: "#f59e0b",
    extractScore: (item) => item.social_proof ?? null,
  },
  {
    key: "hook",
    label: "훅 유형",
    icon: "🪝",
    color: "#8b5cf6",
    extractScore: () => null,
    extractCategory: (item) => item.hook_type ?? null,
  },
];

// ── 바 색상 ─────────────────────────────────────────────────────

const CATEGORY_COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];

// ── 점수 분포 계산 ───────────────────────────────────────────────

function computeScoreDist(
  results: PortfolioCreativeItem[],
  extract: (item: PortfolioCreativeItem) => number | null
): { avg: number; min: number; max: number; count: number } {
  const scores = results.map(extract).filter((s): s is number => s != null);
  if (scores.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
  return {
    avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    min: Math.min(...scores),
    max: Math.max(...scores),
    count: scores.length,
  };
}

function computeCategoryDist(
  results: PortfolioCreativeItem[],
  extract: (item: PortfolioCreativeItem) => string | null
): Array<{ value: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const item of results) {
    const val = extract(item);
    if (val) counts[val] = (counts[val] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

// ── 컴포넌트 ──────────────────────────────────────────────────────

export function AxisDistribution({ results }: AxisDistributionProps) {
  if (results.length === 0) return null;

  const totalCount = results.length;

  // 점수 기반 축 (상위 4개)
  const scoreAxes = AXIS_CONFIGS.filter((a) => a.key !== "hook");
  const scoreDists = scoreAxes.map((axis) => ({
    ...axis,
    dist: computeScoreDist(results, axis.extractScore),
  }));

  // 카테고리 기반 축 (hook)
  const hookAxis = AXIS_CONFIGS.find((a) => a.key === "hook")!;
  const hookDist = computeCategoryDist(
    results,
    hookAxis.extractCategory ?? (() => null)
  );

  // 전체 데이터 없으면 숨김
  const hasScoreData = scoreDists.some((d) => d.dist.count > 0);
  const hasCategoryData = hookDist.length > 0;
  if (!hasScoreData && !hasCategoryData) return null;

  return (
    <div
      className="rounded-xl bg-slate-50 border border-slate-200 p-4"
      style={{ borderLeftWidth: 4, borderLeftColor: "#8b5cf6" }}
    >
      <h3 className="flex items-center gap-2 text-sm font-bold mb-4" style={{ color: "#8b5cf6" }}>
        📊 5축별 소재 분석
      </h3>

      {/* 점수 기반 4축 — 평균 점수 바 */}
      {hasScoreData && (
        <div className="space-y-3 mb-4">
          {scoreDists.map((axis) => {
            if (axis.dist.count === 0) return null;
            const pct = axis.dist.avg;
            return (
              <div key={axis.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-700 font-medium">
                    {axis.icon} {axis.label}
                  </span>
                  <span className="font-bold" style={{ color: axis.color }}>
                    {axis.dist.avg}점
                    <span className="text-gray-400 font-normal ml-1">
                      ({axis.dist.min}-{axis.dist.max})
                    </span>
                  </span>
                </div>
                <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: pct >= 70
                        ? axis.color
                        : pct >= 40
                          ? "#f59e0b"
                          : "#ef4444",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 카테고리 기반 — 훅 유형 분포 */}
      {hasCategoryData && (
        <div className="bg-white rounded-lg p-3">
          <div className="text-[11px] text-gray-500 mb-2">
            {hookAxis.icon} {hookAxis.label} 분포
          </div>
          <div className="space-y-1.5">
            {hookDist.map((item, idx) => {
              const pct = Math.round((item.count / totalCount) * 100);
              const color = CATEGORY_COLORS[Math.min(idx, CATEGORY_COLORS.length - 1)];
              const isOverConcentrated = pct >= 60;

              return (
                <div key={item.value}>
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span className="text-gray-700">{item.value}</span>
                    <span className="font-bold">{item.count}개 ({pct}%)</span>
                  </div>
                  <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: isOverConcentrated ? "#ef4444" : color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
