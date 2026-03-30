"use client";

// ── 타입 ──────────────────────────────────────────────────────────

interface IntelligenceScore {
  hook_type?: string | null;
  style?: string | null;
}

interface AxisDistributionProps {
  results: IntelligenceScore[];
}

// ── 축별 설정 ─────────────────────────────────────────────────────

interface AxisConfig {
  key: string;
  label: string;
  icon: string;
  extractValue: (item: IntelligenceScore) => string | null;
}

const AXIS_CONFIGS: AxisConfig[] = [
  {
    key: "hook",
    label: "훅",
    icon: "🪝",
    extractValue: (item) => (item.hook_type as string) ?? null,
  },
  {
    key: "style",
    label: "스타일",
    icon: "🎬",
    extractValue: (item) => (item.style as string) ?? null,
  },
];

// ── 바 색상 (상위 → 하위) ────────────────────────────────────────

const BAR_COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];

function getBarColor(rank: number): string {
  return BAR_COLORS[Math.min(rank, BAR_COLORS.length - 1)];
}

// ── 분포 계산 ─────────────────────────────────────────────────────

function computeDistribution(
  results: IntelligenceScore[],
  extract: (item: IntelligenceScore) => string | null
): Array<{ value: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const item of results) {
    const val = extract(item);
    if (val) {
      counts[val] = (counts[val] ?? 0) + 1;
    }
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
  const distributions = AXIS_CONFIGS.map((axis) => ({
    ...axis,
    items: computeDistribution(results, axis.extractValue),
  }));

  // 분포 데이터가 전혀 없으면 숨김
  if (distributions.every((d) => d.items.length === 0)) return null;

  return (
    <div
      className="rounded-xl bg-slate-50 border border-slate-200 p-4"
      style={{ borderLeftWidth: 4, borderLeftColor: "#8b5cf6" }}
    >
      <h3 className="flex items-center gap-2 text-sm font-bold mb-4" style={{ color: "#8b5cf6" }}>
        📊 5축별 소재 분포
      </h3>

      <div className="grid grid-cols-2 gap-4">
        {distributions.map((dist) => {
          if (dist.items.length === 0) return null;
          return (
            <div
              key={dist.key}
              className="bg-white rounded-lg p-3 text-center"
            >
              <div className="text-[11px] text-gray-500 mb-2">
                {dist.icon} {dist.label}
              </div>
              <div className="space-y-1.5">
                {dist.items.map((item, idx) => {
                  const pct = Math.round((item.count / totalCount) * 100);
                  const color = getBarColor(idx);
                  const isOverConcentrated = pct >= 60;

                  return (
                    <div key={item.value}>
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span className="text-gray-700">{item.value}</span>
                        <span className="font-bold">{item.count}</span>
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
          );
        })}
      </div>
    </div>
  );
}
