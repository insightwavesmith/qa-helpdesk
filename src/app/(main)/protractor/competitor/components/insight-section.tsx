"use client";

import type { CompetitorInsight } from "@/types/competitor";
import { InsightStatCard } from "./insight-stat-card";
import { HookTypeChart } from "./hook-type-chart";
import { SeasonChart } from "./season-chart";
import { Sparkles } from "lucide-react";

interface InsightSectionProps {
  insight: CompetitorInsight | null;
  loading: boolean;
  onAnalyze: () => void;
  adCount: number;
}

export function InsightSection({
  insight,
  loading,
  onAnalyze,
  adCount,
}: InsightSectionProps) {
  // 분석 전 상태
  if (!insight && !loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#F75D5D]" />
            <h3 className="text-base font-semibold text-gray-900">
              AI 인사이트
            </h3>
          </div>
          <button
            type="button"
            onClick={onAnalyze}
            disabled={adCount === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#F75D5D] hover:bg-[#E54949] rounded-xl transition disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {adCount}개 광고 AI 분석
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          검색 결과를 AI가 분석하여 브랜드의 광고 전략과 패턴을 파악합니다
        </p>
      </div>
    );
  }

  // 로딩 상태
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#F75D5D]" />
          <div>
            <p className="text-sm font-medium text-gray-900">
              AI가 광고 패턴을 분석하고 있습니다...
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              약 10~30초 정도 소요됩니다
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 분석 결과
  if (!insight) return null;

  const topHook = insight.hookTypes?.[0];
  const monthlyAvg =
    insight.seasonPattern && insight.seasonPattern.length > 0
      ? Math.round(
          insight.seasonPattern.reduce((sum, s) => sum + s.adCount, 0) /
            insight.seasonPattern.length,
        )
      : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[#F75D5D]" />
        <h3 className="text-base font-semibold text-gray-900">AI 인사이트</h3>
      </div>

      {/* 통계 카드 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <InsightStatCard
          label="장기 광고 비율"
          value={`${insight.totalAdCount > 0 ? Math.round((insight.longRunningAdCount / insight.totalAdCount) * 100) : 0}%`}
          subLabel={`30일+ ${insight.longRunningAdCount}건 / 전체 ${insight.totalAdCount}건`}
        />
        <InsightStatCard
          label="영상 비율"
          value={`${Math.round(insight.videoRatio * 100)}%`}
          subLabel={`이미지 ${Math.round(insight.imageRatio * 100)}%`}
        />
        <InsightStatCard
          label="주력 훅 유형"
          value={topHook?.type ?? "-"}
          subLabel={topHook ? `${topHook.percentage}% (${topHook.count}건)` : undefined}
        />
        <InsightStatCard
          label="월평균 광고 수"
          value={`${monthlyAvg}건`}
        />
      </div>

      {/* 차트 영역 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <HookTypeChart hookTypes={insight.hookTypes} />
        <SeasonChart seasonPattern={insight.seasonPattern} />
      </div>

      {/* 핵심 제품/프로모션 */}
      {insight.keyProducts && insight.keyProducts.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-2">
            핵심 제품/프로모션
          </h4>
          <div className="flex flex-wrap gap-2">
            {insight.keyProducts.map((product) => (
              <span
                key={product}
                className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full"
              >
                {product}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 텍스트 인사이트 요약 */}
      {insight.summary && (
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {insight.summary}
          </p>
        </div>
      )}
    </div>
  );
}
