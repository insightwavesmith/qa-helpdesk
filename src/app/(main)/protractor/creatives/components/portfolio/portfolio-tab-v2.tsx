"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { AxisDistribution } from "./axis-distribution";
import { DiversityAlert } from "./diversity-alert";
import { BenchmarkInsight } from "./benchmark-insight";
import { AccountPrescription } from "./account-prescription";

// ── CSS 변수 (목업 :root 동일) ──────────────────────────────────
const V = {
  bg: "#ffffff",
  bg2: "#f8fafc",
  bg3: "#e2e8f0",
  bd: "#e2e8f0",
  ac: "#F75D5D",
  ac2: "#E54949",
  t: "#1e293b",
  t2: "#475569",
  t3: "#64748b",
  g: "#10b981",
  a: "#f59e0b",
  r: "#ef4444",
  p: "#8b5cf6",
  cy: "#06b6d4",
  b: "#3b82f6",
};

// ── 타입 ──────────────────────────────────────────────────────────

export interface PortfolioCreativeItem {
  id: string;
  overall_score: number | null;
  roas: number | null;
  hook_type: string | null;
  style: string | null;
  visual_impact: number | null;
  message_clarity: number | null;
  cta_effectiveness: number | null;
  social_proof: number | null;
}

interface BenchmarkRow {
  element_type: string;
  element_value: string;
  avg_roas: number | null;
  sample_count: number;
}

interface PortfolioTabV2Props {
  portfolioItems: PortfolioCreativeItem[];
  intelligenceLoading: boolean;
  benchmarkData: { benchmarks: Record<string, BenchmarkRow[]> } | undefined;
  accountId: string;
}

// ── 섹션 카드 스타일 (목업 .s 클래스 동일) ────────────────────────
const sectionStyle: React.CSSProperties = {
  background: V.bg2,
  borderRadius: 12,
  padding: "1.5rem",
  marginBottom: "1.2rem",
  border: `1px solid ${V.bd}`,
};

const h2Style: React.CSSProperties = {
  color: V.ac,
  fontSize: "1.15rem",
  fontWeight: 700,
  marginBottom: ".8rem",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

export function PortfolioTabV2({
  portfolioItems,
  intelligenceLoading,
  benchmarkData,
  accountId,
}: PortfolioTabV2Props) {
  const results = portfolioItems;

  const totalCount = results.length;
  const avgScore =
    totalCount > 0
      ? Math.round(
          results.reduce((s, r) => s + (r.overall_score ?? 0), 0) / totalCount
        )
      : null;
  const avgRoas =
    totalCount > 0
      ? results.reduce((s, r) => s + (r.roas ?? 0), 0) / totalCount
      : null;

  const scoreBuckets = [
    { label: "0-20", min: 0, max: 20, count: 0 },
    { label: "20-40", min: 20, max: 40, count: 0 },
    { label: "40-60", min: 40, max: 60, count: 0 },
    { label: "60-80", min: 60, max: 80, count: 0 },
    { label: "80-100", min: 80, max: 100, count: 0 },
  ];
  for (const r of results) {
    const score = r.overall_score ?? 0;
    const bucket = scoreBuckets.find(
      (b) => score >= b.min && score < b.max + (b.max === 100 ? 1 : 0)
    );
    if (bucket) bucket.count++;
  }
  const maxBucketCount = Math.max(...scoreBuckets.map((b) => b.count), 1);

  const hookBenchmarks: BenchmarkRow[] = benchmarkData?.benchmarks?.hook_type ?? [];
  const styleBenchmarks: BenchmarkRow[] = benchmarkData?.benchmarks?.style ?? [];
  const maxHookRoas = Math.max(...hookBenchmarks.map((b) => b.avg_roas ?? 0), 1);
  const maxStyleRoas = Math.max(...styleBenchmarks.map((b) => b.avg_roas ?? 0), 1);
  const highScoreCount = scoreBuckets[4].count;

  if (intelligenceLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const topHook = hookBenchmarks.length > 0
    ? hookBenchmarks.reduce((a, b) => ((a.avg_roas ?? 0) > (b.avg_roas ?? 0) ? a : b))
    : null;
  const topStyle = styleBenchmarks.length > 0
    ? styleBenchmarks.reduce((a, b) => ((a.avg_roas ?? 0) > (b.avg_roas ?? 0) ? a : b))
    : null;
  const worstHook = hookBenchmarks.length > 0
    ? hookBenchmarks.reduce((a, b) => ((a.avg_roas ?? 0) < (b.avg_roas ?? 0) ? a : b))
    : null;

  return (
    <div>
      {/* ═══ 요약 카드 4개 ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: "1.2rem" }}>
        {[
          { label: "평균 L4 점수", value: avgScore != null ? String(avgScore) : "-", unit: "점", highlight: false },
          { label: "총 소재 수", value: String(totalCount), unit: "개", highlight: false },
          { label: "평균 ROAS", value: avgRoas != null ? avgRoas.toFixed(2) : "-", unit: "", highlight: false },
          { label: "80점 이상 소재", value: String(highScoreCount), unit: "개", highlight: highScoreCount > 0 },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: V.bg2,
              borderRadius: 12,
              padding: "1.2rem",
              border: `1px solid ${V.bd}`,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: ".72rem", color: V.t3 }}>{card.label}</div>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: 800,
                color: card.highlight ? V.ac : V.t,
              }}
            >
              {card.value}
              {card.unit && (
                <span style={{ fontSize: ".9rem", fontWeight: 600 }}>{card.unit}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Andromeda 다양성 경고 + 클러스터 ═══ */}
      <DiversityAlert accountId={accountId} />

      {/* ═══ 5축별 분포 ═══ */}
      <AxisDistribution accountId={accountId} />

      {/* ═══ L4 점수 분포 히스토그램 ═══ */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>📈 L4 점수 분포</h2>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, padding: "0 1rem" }}>
          {scoreBuckets.map((b, idx) => {
            const isHigh = idx === 4;
            return (
              <div key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: ".7rem", color: V.t3 }}>{b.count}</span>
                <div
                  style={{
                    width: "100%",
                    background: isHigh ? V.g : V.ac,
                    opacity: 0.8,
                    borderRadius: "4px 4px 0 0",
                    height: `${Math.max(4, (b.count / maxBucketCount) * 90)}px`,
                  }}
                />
                <span style={{ fontSize: ".65rem", color: V.t3 }}>{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ 훅 유형별 / 스타일별 ROAS (2열) ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {hookBenchmarks.length > 0 && (
          <div style={sectionStyle}>
            <h2 style={h2Style}>🪝 훅 유형별 평균 ROAS</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {hookBenchmarks.slice(0, 8).map((b) => (
                <div key={b.element_value}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", marginBottom: 2 }}>
                    <span>{b.element_value}</span>
                    <span style={{ color: V.t3 }}>ROAS {b.avg_roas?.toFixed(2) ?? "-"} (n={b.sample_count})</span>
                  </div>
                  <div style={{ height: 6, background: V.bg3, borderRadius: 3 }}>
                    <div
                      style={{
                        width: `${((b.avg_roas ?? 0) / maxHookRoas) * 100}%`,
                        height: "100%",
                        background: V.ac,
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {styleBenchmarks.length > 0 && (
          <div style={sectionStyle}>
            <h2 style={h2Style}>🎨 스타일별 평균 ROAS</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {styleBenchmarks.slice(0, 8).map((b) => (
                <div key={b.element_value}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", marginBottom: 2 }}>
                    <span>{b.element_value}</span>
                    <span style={{ color: V.t3 }}>ROAS {b.avg_roas?.toFixed(2) ?? "-"} (n={b.sample_count})</span>
                  </div>
                  <div style={{ height: 6, background: V.bg3, borderRadius: 3 }}>
                    <div
                      style={{
                        width: `${((b.avg_roas ?? 0) / maxStyleRoas) * 100}%`,
                        height: "100%",
                        background: V.ac,
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══ 벤치마크 인사이트 ═══ */}
      <BenchmarkInsight topHook={topHook} topStyle={topStyle} worstHook={worstHook} />

      {/* ═══ 계정 처방 요약 ═══ */}
      <AccountPrescription accountId={accountId} />

      {/* ═══ 하단 푸터 ═══ */}
      <div style={{ textAlign: "center", padding: "1.5rem", color: V.t3, fontSize: ".75rem", marginTop: "1rem" }}>
        🍡 Andromeda 다양성 분석 (768차원 임베딩 + 4축 가중 Jaccard + PDA 프레임)
        <br />
        2026-03-31 · &quot;같은 광고만 반복하면 고객이 먼저 지친다&quot;
      </div>
    </div>
  );
}
