"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { AxisDistribution } from "./axis-distribution";
import { DiversityAlert } from "./diversity-alert";

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
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`text-2xl font-extrabold mt-1 ${highlight ? "text-[#F75D5D]" : "text-gray-900"}`}
      >
        {value}
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
  const hookBenchmarks: BenchmarkRow[] = benchmarkData?.benchmarks?.hook_type ?? [];
  const styleBenchmarks: BenchmarkRow[] = benchmarkData?.benchmarks?.style ?? [];
  const maxHookRoas = Math.max(...hookBenchmarks.map((b) => b.avg_roas ?? 0), 1);
  const maxStyleRoas = Math.max(...styleBenchmarks.map((b) => b.avg_roas ?? 0), 1);
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

  return (
    <div className="space-y-6">
      {/* 요약 카드 4개 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard
          label="평균 L4 점수"
          value={avgScore != null ? `${avgScore}점` : "-"}
        />
        <SummaryCard label="총 소재 수" value={`${totalCount}개`} />
        <SummaryCard
          label="평균 ROAS"
          value={avgRoas != null ? avgRoas.toFixed(2) : "-"}
        />
        <SummaryCard
          label="80점 이상 소재"
          value={`${highScoreCount}개`}
          highlight={highScoreCount > 0}
        />
      </div>

      {/* Andromeda 다양성 경고 + 클러스터 */}
      <DiversityAlert accountId={accountId} />

      {/* 5축별 분포 */}
      <AxisDistribution results={results} />

      {/* L4 점수 분포 히스토그램 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4">L4 점수 분포</h3>
        <div className="flex items-end gap-2 h-32">
          {scoreBuckets.map((b) => (
            <div
              key={b.label}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className="text-xs text-gray-500">{b.count}</span>
              <div
                className="w-full rounded-t-md bg-[#F75D5D] opacity-80 min-h-[4px] transition-all"
                style={{
                  height: `${Math.max(4, (b.count / maxBucketCount) * 100)}px`,
                }}
              />
              <span className="text-[10px] text-gray-400">{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 훅 유형별 ROAS */}
      {hookBenchmarks.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">
            훅 유형별 평균 ROAS
          </h3>
          <div className="space-y-2.5">
            {hookBenchmarks.slice(0, 8).map((b) => (
              <div key={b.element_value}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-gray-700">{b.element_value}</span>
                  <span className="text-gray-500">
                    ROAS {b.avg_roas?.toFixed(1) ?? "-"} (n={b.sample_count})
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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

      {/* 스타일별 ROAS */}
      {styleBenchmarks.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">
            스타일별 평균 ROAS
          </h3>
          <div className="space-y-2.5">
            {styleBenchmarks.slice(0, 8).map((b) => (
              <div key={b.element_value}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-gray-700">{b.element_value}</span>
                  <span className="text-gray-500">
                    ROAS {b.avg_roas?.toFixed(1) ?? "-"} (n={b.sample_count})
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
  );
}
