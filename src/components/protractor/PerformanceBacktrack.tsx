"use client";

import type { PrescriptionResponse } from "@/types/prescription";

interface PerformanceBacktrackProps {
  backtrack: PrescriptionResponse["performance_backtrack"];
}

const GROUP_LABELS: Record<string, string> = {
  foundation: "기반점수",
  engagement: "참여율",
  conversion: "전환율",
};

const GROUP_COLORS: Record<string, string> = {
  foundation: "bg-blue-400",
  engagement: "bg-purple-400",
  conversion: "bg-orange-400",
};

const JOURNEY_STAGE_ORDER = ["감각", "사고", "행동_클릭", "행동_구매"];
const JOURNEY_LABELS: Record<string, string> = {
  감각: "감각",
  사고: "사고",
  행동_클릭: "행동(클릭)",
  행동_구매: "행동(구매)",
};

function DeviationBar({ deviation }: { deviation: number }) {
  const absDev = Math.abs(deviation);
  const width = Math.min(100, absDev);
  const isNeg = deviation < 0;
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-2 rounded-full ${isNeg ? "bg-red-400" : "bg-emerald-400"} transition-all`} style={{ width: `${width}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${isNeg ? "text-red-600" : "text-emerald-600"} w-16 text-right`}>
        {isNeg ? "" : "+"}{deviation.toFixed(1)}%
      </span>
    </div>
  );
}

function statusStyle(status: string) {
  if (status.includes("양호")) return "bg-emerald-100 text-emerald-700";
  if (status.includes("보통")) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export function PerformanceBacktrack({ backtrack }: PerformanceBacktrackProps) {
  if (!backtrack) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center text-sm text-gray-400">
        성과 데이터가 없어 역추적을 건너뜁니다
      </div>
    );
  }
  const { worst_metrics, affected_attributes, focus_stage, journey_breakdown } = backtrack;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-900">성과 역추적</h3>
        <p className="text-xs text-gray-500">벤치마크 대비 약점 지표 및 여정 이탈 지점</p>
      </div>
      <div className="p-4 space-y-5">
        {worst_metrics && worst_metrics.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">최하위 지표 ({worst_metrics.length}건)</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {worst_metrics.map((m, i) => (
                <div key={i} className="rounded-xl border border-gray-100 bg-red-50/50 p-3">
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700">{m.label || m.metric}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${GROUP_COLORS[m.group] ?? "bg-gray-300"} text-white`}>
                      {GROUP_LABELS[m.group] ?? m.group}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-base font-bold text-red-600">{m.actual.toFixed(2)}</span>
                    <span className="text-[10px] text-gray-400">vs 기준 {m.benchmark.toFixed(2)}</span>
                  </div>
                  <DeviationBar deviation={m.deviation} />
                </div>
              ))}
            </div>
          </div>
        )}
        {affected_attributes && affected_attributes.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">영향 속성</p>
            <div className="flex flex-wrap gap-1.5">
              {affected_attributes.map((attr, i) => (
                <span key={i} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">{attr}</span>
              ))}
            </div>
          </div>
        )}
        {focus_stage && (
          <div className="flex items-center gap-2 rounded-xl bg-[#F75D5D]/10 px-3 py-2">
            <span className="text-xs text-[#F75D5D]">🎯</span>
            <p className="text-xs text-gray-700">
              <span className="font-semibold text-[#F75D5D]">집중 개선 단계:</span> {focus_stage}
            </p>
          </div>
        )}
        {journey_breakdown && (
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">여정 이탈 지도</p>
            <div className="space-y-2">
              {JOURNEY_STAGE_ORDER.map((key) => {
                const stage = journey_breakdown[key as keyof typeof journey_breakdown];
                if (!stage) return null;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs text-gray-600">{JOURNEY_LABELS[key]}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100">
                          <div
                            className={`h-1.5 rounded-full ${stage.deviation?.startsWith("-") ? "bg-red-400" : "bg-emerald-400"}`}
                            style={{ width: `${Math.min(100, Math.abs(parseFloat(stage.deviation ?? "0")))}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-medium w-12 text-right tabular-nums ${stage.deviation?.startsWith("-") ? "text-red-600" : "text-emerald-600"}`}>
                          {stage.deviation}
                        </span>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyle(stage.status)}`}>
                      {stage.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
