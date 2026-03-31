"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr/config";
import { Skeleton } from "@/components/ui/skeleton";

// ── 타입 ──────────────────────────────────────────────────────────

interface AxisDistributionProps {
  accountId: string;
}

interface AxisItem {
  label: string;
  count: number;
}

interface AxisDistributionData {
  format: AxisItem[];
  hook: AxisItem[];
  messaging: AxisItem[];
  target: AxisItem[];
  category: AxisItem[];
}

// ── 5축 설정 ─────────────────────────────────────────────────────

const AXIS_CONFIGS = [
  { key: "format" as const, label: "포맷", icon: "🎬" },
  { key: "hook" as const, label: "훅", icon: "🪝" },
  { key: "messaging" as const, label: "메시징", icon: "💬" },
  { key: "target" as const, label: "타겟", icon: "👤" },
  { key: "category" as const, label: "카테고리", icon: "🏷️" },
];

const BAR_COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];

// ── 컴포넌트 ──────────────────────────────────────────────────────

export function AxisDistribution({ accountId }: AxisDistributionProps) {
  const { data, isLoading } = useSWR<AxisDistributionData>(
    accountId ? `/api/protractor/axis-distribution?account_id=${accountId}` : null,
    jsonFetcher
  );

  if (isLoading) {
    return <Skeleton className="h-40 rounded-xl" />;
  }

  // 데이터 없어도 UI 구조 유지 (목업 규칙)
  const axisData = data ?? {
    format: [],
    hook: [],
    messaging: [],
    target: [],
    category: [],
  };

  return (
    <div
      className="rounded-xl bg-slate-50 border border-slate-200 p-5"
      style={{ borderLeftWidth: 4, borderLeftColor: "#8b5cf6" }}
    >
      <h3
        className="flex items-center gap-2 text-[1.15rem] font-bold mb-1"
        style={{ color: "#8b5cf6" }}
      >
        📊 5축별 소재 분포
      </h3>

      <div className="grid grid-cols-5 gap-3">
        {AXIS_CONFIGS.map((axis) => {
          const items = axisData[axis.key] ?? [];
          const maxCount = Math.max(...items.map((i) => i.count), 1);

          return (
            <div
              key={axis.key}
              className="bg-white rounded-lg p-3 text-center"
            >
              <div className="text-[11px] text-gray-500 mb-2">
                {axis.icon} {axis.label}
              </div>

              {items.length > 0 ? (
                <div className="flex flex-col gap-1.5 text-[11px]">
                  {items.slice(0, 3).map((item, idx) => {
                    const pct = Math.round((item.count / maxCount) * 100);
                    const isOverConcentrated = pct >= 65;
                    const color = isOverConcentrated
                      ? "#ef4444"
                      : BAR_COLORS[Math.min(idx, BAR_COLORS.length - 1)];

                    return (
                      <div key={item.label}>
                        <div className="flex justify-between">
                          <span className="text-gray-700">{item.label}</span>
                          <span className="font-bold">{item.count}</span>
                        </div>
                        <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-gray-400 py-2">
                  데이터 없음
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
