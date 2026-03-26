"use client";

import type { PrescriptionResponse } from "@/types/prescription";

interface BenchmarkComparisonProps {
  scores: PrescriptionResponse["scores"];
  percentiles: Record<string, number>;
  earAnalysis: PrescriptionResponse["ear_analysis"];
}

const SCORE_METRICS = [
  { key: "visual_impact", label: "시각 임팩트", axis: "visual" },
  { key: "message_clarity", label: "메시지 명확성", axis: "text" },
  { key: "cta_effectiveness", label: "CTA 효과성", axis: "hook" },
  { key: "social_proof_score", label: "사회적 증거", axis: "psychology" },
  { key: "overall", label: "종합", axis: "overall" },
];

const BOTTLENECK_LABELS: Record<string, string> = {
  foundation: "기반점수",
  engagement: "참여율",
  conversion: "전환율",
};

export function BenchmarkComparison({ scores, percentiles, earAnalysis }: BenchmarkComparisonProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-900">글로벌 벤치마크 비교</h3>
        <p className="text-xs text-gray-500">Motion 글로벌 데이터 대비 백분위 순위</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">지표</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide">점수</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide">글로벌 백분위</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {SCORE_METRICS.map(({ key, label, axis }) => {
              const score = scores[key as keyof typeof scores] as number;
              const pct = percentiles[axis];
              const status = pct == null ? "데이터 없음" : pct >= 70 ? "우수" : pct >= 40 ? "보통" : "미달";
              const statusColor = pct == null ? "bg-gray-100 text-gray-500" : pct >= 70 ? "bg-emerald-100 text-emerald-700" : pct >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
              const pctColor = pct == null ? "text-gray-400" : pct >= 70 ? "text-emerald-600 font-semibold" : pct >= 40 ? "text-amber-600 font-semibold" : "text-red-600 font-semibold";
              return (
                <tr key={key} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2 text-xs font-medium text-gray-700">{label}</td>
                  <td className="px-3 py-2 text-xs text-center font-bold text-gray-900">{score.toFixed(1)}</td>
                  <td className={`px-3 py-2 text-xs text-center ${pctColor}`}>{pct != null ? `${Math.round(pct)}점` : "-"}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor}`}>{status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {earAnalysis && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          <p className="text-xs font-semibold text-gray-700 mb-2">EAR 병목 분석</p>
          <div className="rounded-xl bg-white border border-gray-100 p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-gray-500 w-20 shrink-0">주요 병목</span>
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                {BOTTLENECK_LABELS[earAnalysis.primary_bottleneck] ?? earAnalysis.primary_bottleneck}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-semibold text-gray-500 w-20 shrink-0 mt-0.5">상세</span>
              <p className="text-xs text-gray-600">{earAnalysis.bottleneck_detail}</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-semibold text-gray-500 w-20 shrink-0 mt-0.5">개선 우선순위</span>
              <p className="text-xs text-gray-700 font-medium">{earAnalysis.improvement_priority}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
