"use client";

import type { SummaryCardData } from "@/lib/protractor/aggregate";

interface SummaryCardsProps {
  cards?: SummaryCardData[];
}

export function SummaryCards({ cards }: SummaryCardsProps) {
  if (!cards || cards.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm text-gray-400">광고 데이터가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
      {cards.map((card) => {
        const isRoas = card.label === "ROAS";
        const hasBenchmark = card.benchmarkText != null;

        // 벤치마크 텍스트 색상 (3단계: 초록/노란/빨강)
        const benchColor = hasBenchmark
          ? card.benchmarkGood === true
            ? "text-green-600"
            : card.benchmarkGood === false
              ? "text-red-500"
              : "text-yellow-600"
          : "text-gray-400";

        // ▲/▼ 화살표
        const arrow =
          card.benchmarkAbove === true ? "▲" : card.benchmarkAbove === false ? "▼" : "";

        return (
          <div
            key={card.label}
            className={`flex flex-col items-center justify-center text-center rounded-lg border p-2.5 shadow-sm ${
              isRoas
                ? "bg-gradient-to-r from-[#F75D5D]/10 to-[#F75D5D]/5 border-[#F75D5D]/20"
                : "border-gray-200 bg-white"
            }`}
          >
            {/* 지표 값 */}
            <div className="flex items-baseline gap-0.5">
              {card.prefix && (
                <span className={`text-lg font-bold ${isRoas ? "text-[#F75D5D]" : "text-gray-900"}`}>
                  {card.prefix}
                </span>
              )}
              <span className={`text-lg font-bold tabular-nums ${isRoas ? "text-[#F75D5D]" : "text-gray-900"}`}>
                {card.value}
              </span>
              {card.suffix && (
                <span className={`text-lg font-bold ${isRoas ? "text-[#F75D5D]" : "text-gray-900"}`}>
                  {card.suffix}
                </span>
              )}
            </div>

            {/* 지표 레이블 */}
            <span className="mt-1 text-xs font-medium text-gray-400">
              {card.label}
            </span>

            {/* 벤치마크 비교 (T2) */}
            {hasBenchmark ? (
              <span className={`mt-0.5 text-[10px] font-medium ${benchColor}`}>
                {arrow} {card.benchmarkText}
              </span>
            ) : (
              <span className="mt-0.5 text-[10px] text-transparent select-none" aria-hidden>-</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
