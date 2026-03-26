"use client";

import type { PrescriptionResponse } from "@/types/prescription";

interface CustomerJourneyBreakdownProps {
  journey: PrescriptionResponse["customer_journey_summary"];
  backtrack?: Record<string, { status: string; deviation: string }> | null;
}

const STAGE_ICONS = ["👁", "💭", "🖱️", "💰"];
const STAGE_BT_KEYS = ["감각", "사고", "행동_클릭", "행동_구매"];
const STAGE_LABELS = ["감각", "사고", "행동(클릭)", "행동(구매)"];
const STAGE_DESCRIPTIONS = [
  "시각/청각 주의 포착",
  "메시지 인지 & 판단",
  "클릭 전환",
  "구매 완료",
];

function statusColor(status: string) {
  if (status.includes("양호") || status.includes("정상")) {
    return { border: "border-emerald-200", bg: "bg-emerald-50", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-400" };
  }
  if (status.includes("보통") || status.includes("중간")) {
    return { border: "border-amber-200", bg: "bg-amber-50", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-400" };
  }
  return { border: "border-red-200", bg: "bg-red-50", badge: "bg-red-100 text-red-700", dot: "bg-red-400" };
}

export function CustomerJourneyBreakdown({ journey, backtrack }: CustomerJourneyBreakdownProps) {
  const journeyValues = [journey.sensation, journey.thinking, journey.action_click, journey.action_purchase];

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-900">고객 여정 분석</h3>
        <p className="text-xs text-gray-500">감각 → 사고 → 행동 4단계 전환 흐름</p>
      </div>

      <div className="flex flex-col gap-3 p-4 md:flex-row md:items-stretch md:gap-0">
        {STAGE_LABELS.map((stageLabel, idx) => {
          const btKey = STAGE_BT_KEYS[idx];
          const bt = backtrack?.[btKey];
          const style = bt ? statusColor(bt.status) : { border: "border-gray-200", bg: "bg-gray-50", badge: "bg-gray-100 text-gray-600", dot: "bg-gray-300" };

          return (
            <div key={stageLabel} className="flex md:flex-1 md:flex-col">
              {idx > 0 && (
                <div className="flex items-center justify-center text-gray-300 md:hidden py-1">
                  <span className="text-lg">↓</span>
                </div>
              )}
              {idx > 0 && (
                <div className="hidden md:flex items-center justify-center px-1 text-gray-300">
                  <span className="text-xl">→</span>
                </div>
              )}
              <div className={`flex-1 rounded-xl border p-3 ${style.border} ${style.bg}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg">{STAGE_ICONS[idx]}</span>
                  <div>
                    <div className="text-xs font-semibold text-gray-800">{STAGE_LABELS[idx]}</div>
                    <div className="text-[10px] text-gray-400">{STAGE_DESCRIPTIONS[idx]}</div>
                  </div>
                </div>
                {bt && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.badge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      {bt.status}
                    </span>
                    {bt.deviation && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${bt.deviation.startsWith("-") ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {bt.deviation}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-600 leading-relaxed">{journeyValues[idx]}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
