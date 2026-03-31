"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr/config";

// ── CSS 변수 (목업 동일) ────────────────────────────────────────
const V = {
  bg: "#ffffff", bg2: "#f8fafc", bg3: "#e2e8f0", bd: "#e2e8f0",
  ac: "#F75D5D", t3: "#64748b", p: "#8b5cf6",
  r: "#ef4444", b: "#3b82f6", g: "#10b981", a: "#f59e0b",
};

// ── 타입 ──────────────────────────────────────────────────────────

interface AxisDistributionProps { accountId: string; }

interface AxisItem { label: string; count: number; }
interface AxisDistributionData {
  format: AxisItem[]; hook: AxisItem[]; messaging: AxisItem[]; target: AxisItem[]; category: AxisItem[];
}

const AXIS_CONFIGS = [
  { key: "format" as const, label: "포맷", icon: "🎬" },
  { key: "hook" as const, label: "훅", icon: "🪝" },
  { key: "messaging" as const, label: "메시징", icon: "💬" },
  { key: "target" as const, label: "타겟", icon: "👤" },
  { key: "category" as const, label: "카테고리", icon: "🏷️" },
];

const BAR_COLORS = [V.r, V.b, V.g, V.a, V.p];

// ── 컴포넌트 ──────────────────────────────────────────────────────

export function AxisDistribution({ accountId }: AxisDistributionProps) {
  const { data, isLoading } = useSWR<AxisDistributionData>(
    accountId ? `/api/protractor/axis-distribution?account_id=${accountId}` : null,
    jsonFetcher
  );

  if (isLoading) return <div style={{ height: 160, borderRadius: 12, background: V.bg3, animation: "pulse 2s infinite" }} />;

  const axisData = data ?? { format: [], hook: [], messaging: [], target: [], category: [] };

  return (
    <div style={{
      background: V.bg2, borderRadius: 12, padding: "1.5rem", marginBottom: "1.2rem",
      border: `1px solid ${V.bd}`, borderLeft: `4px solid ${V.p}`,
    }}>
      <h2 style={{ color: V.p, fontSize: "1.15rem", fontWeight: 700, marginBottom: ".8rem", display: "flex", alignItems: "center", gap: 8 }}>
        📊 5축별 소재 분포
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
        {AXIS_CONFIGS.map((axis) => {
          const items = axisData[axis.key] ?? [];
          const maxCount = Math.max(...items.map((i) => i.count), 1);

          return (
            <div key={axis.key} style={{ background: V.bg, borderRadius: 8, padding: "1rem", textAlign: "center" }}>
              <div style={{ fontSize: ".7rem", color: V.t3, marginBottom: 6 }}>
                {axis.icon} {axis.label}
              </div>

              {items.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: ".7rem" }}>
                  {items.slice(0, 3).map((item, idx) => {
                    const pct = Math.round((item.count / maxCount) * 100);
                    const isOver = pct >= 65;
                    const color = isOver ? V.r : BAR_COLORS[Math.min(idx, BAR_COLORS.length - 1)];

                    return (
                      <div key={item.label}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>{item.label}</span>
                          <span style={{ fontWeight: 700 }}>{item.count}</span>
                        </div>
                        <div style={{ height: 4, background: V.bg3, borderRadius: 2 }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: ".7rem", color: V.t3, padding: "8px 0" }}>데이터 없음</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
