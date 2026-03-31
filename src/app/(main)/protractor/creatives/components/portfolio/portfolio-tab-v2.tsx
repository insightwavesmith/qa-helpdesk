"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { AxisDistribution } from "./axis-distribution";
import { DiversityAlert } from "./diversity-alert";
import { BenchmarkInsight } from "./benchmark-insight";
import { AccountPrescription } from "./account-prescription";

// ── 타입 ──────────────────────────────────────────────────────────

/** 부모에서 analysis_json 기반으로 추출된 flat 데이터 */
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

// ── 유틸 ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  unit,
  highlight = false,
}: {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-200 text-center">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div
        className={`text-3xl font-extrabold mt-0.5 ${highlight ? "text-[#F75D5D]" : "text-gray-900"}`}
      >
        {value}
        {unit && (
          <span className="text-sm font-semibold">{unit}</span>
        )}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

export function PortfolioTabV2({
  portfolioItems,
  intelligenceLoading,
  benchmarkData,
  accountId,
}: PortfolioTabV2Props) {
  const results = portfolioItems;

  // 집계
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

  // 점수 분포
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

  // 벤치마크
  const hookBenchmarks: BenchmarkRow[] =
    benchmarkData?.benchmarks?.hook_type ?? [];
  const styleBenchmarks: BenchmarkRow[] =
    benchmarkData?.benchmarks?.style ?? [];
  const maxHookRoas = Math.max(...hookBenchmarks.map((b) => b.avg_roas ?? 0), 1);
  const maxStyleRoas = Math.max(
    ...styleBenchmarks.map((b) => b.avg_roas ?? 0),
    1
  );
  const highScoreCount = scoreBuckets[4].count;

  if (intelligenceLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  // 벤치마크 인사이트 계산
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
    <div className="space-y-5">
      {/* 요약 카드 4개 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="평균 L4 점수"
          value={avgScore != null ? `${avgScore}` : "-"}
          unit="점"
        />
        <SummaryCard label="총 소재 수" value={`${totalCount}`} unit="개" />
        <SummaryCard
          label="평균 ROAS"
          value={avgRoas != null ? avgRoas.toFixed(2) : "-"}
        />
        <SummaryCard
          label="80점 이상 소재"
          value={`${highScoreCount}`}
          unit="개"
          highlight={highScoreCount > 0}
        />
      </div>

      {/* Andromeda 다양성 경고 + 클러스터 */}
      <DiversityAlert accountId={accountId} />

      {/* 5축별 분포 */}
      <AxisDistribution accountId={accountId} />

      {/* 📈 L4 점수 분포 히스토그램 */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-5">
        <h3 className="flex items-center gap-2 text-[1.15rem] font-bold text-[#F75D5D] mb-3">
          📈 L4 점수 분포
        </h3>
        <div className="flex items-end gap-2 h-32 px-4">
          {scoreBuckets.map((b, idx) => {
            const isHighBucket = idx === 4; // 80-100
            return (
              <div
                key={b.label}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <span className="text-[11px] text-gray-500">{b.count}</span>
                <div
                  className="w-full rounded-t-md min-h-[4px] transition-all"
                  style={{
                    height: `${Math.max(4, (b.count / maxBucketCount) * 100)}px`,
                    background: isHighBucket ? "#10b981" : "#F75D5D",
                    opacity: 0.8,
                  }}
                />
                <span className="text-[10px] text-gray-400">{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 🪝 훅 유형별 / 🎨 스타일별 ROAS (2열) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {hookBenchmarks.length > 0 && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-5">
            <h3 className="flex items-center gap-2 text-[1.15rem] font-bold text-[#F75D5D] mb-3">
              🪝 훅 유형별 평균 ROAS
            </h3>
            <div className="space-y-3">
              {hookBenchmarks.slice(0, 8).map((b) => (
                <div key={b.element_value}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-gray-700">{b.element_value}</span>
                    <span className="text-gray-500">
                      ROAS {b.avg_roas?.toFixed(2) ?? "-"} (n={b.sample_count})
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#F75D5D] rounded-full"
                      style={{
                        width: `${((b.avg_roas ?? 0) / maxHookRoas) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {styleBenchmarks.length > 0 && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-5">
            <h3 className="flex items-center gap-2 text-[1.15rem] font-bold text-[#F75D5D] mb-3">
              🎨 스타일별 평균 ROAS
            </h3>
            <div className="space-y-3">
              {styleBenchmarks.slice(0, 8).map((b) => (
                <div key={b.element_value}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-gray-700">{b.element_value}</span>
                    <span className="text-gray-500">
                      ROAS {b.avg_roas?.toFixed(2) ?? "-"} (n={b.sample_count})
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#F75D5D] rounded-full"
                      style={{
                        width: `${((b.avg_roas ?? 0) / maxStyleRoas) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 💡 벤치마크 인사이트 */}
      <BenchmarkInsight
        topHook={topHook}
        topStyle={topStyle}
        worstHook={worstHook}
      />

      {/* 🏆 계정 처방 요약 */}
      <AccountPrescription accountId={accountId} />

      {/* 하단 푸터 */}
      <div className="text-center py-5 text-gray-500 text-xs">
        🍡 Andromeda 다양성 분석 (768차원 임베딩 + 4축 가중 Jaccard + PDA 프레임)
        <br />
        2026-03-31 · &quot;같은 광고만 반복하면 고객이 먼저 지친다&quot;
      </div>
    </div>
  );
}
