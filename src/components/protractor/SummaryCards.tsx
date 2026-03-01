"use client";

interface SummaryCardData {
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
  changePercent: number;
  changeLabel: string;
}

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

        return (
          <div
            key={card.label}
            className={`flex flex-col items-center justify-center text-center rounded-lg border p-2.5 shadow-sm ${
              isRoas
                ? "bg-gradient-to-r from-[#F75D5D]/10 to-[#F75D5D]/5 border-[#F75D5D]/20"
                : "border-gray-200 bg-white"
            }`}
          >
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
            <span className="mt-1 text-xs font-medium text-gray-400">
              {card.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
