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

const defaultCards: SummaryCardData[] = [
  { label: "총 광고비", value: "834,500", prefix: "₩", changePercent: 8, changeLabel: "전기간 대비" },
  { label: "총 클릭", value: "4,280", changePercent: 12, changeLabel: "전기간 대비" },
  { label: "총 구매", value: "132", changePercent: 18, changeLabel: "전기간 대비" },
  { label: "ROAS", value: "2.85", changePercent: 5, changeLabel: "전기간 대비" },
];

export function SummaryCards({ cards = defaultCards }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => {
        const isRoas = card.label === "ROAS";

        return (
          <div
            key={card.label}
            className={`flex flex-col items-center justify-center text-center rounded-lg border p-4 shadow-sm ${
              isRoas
                ? "bg-gradient-to-r from-[#F75D5D]/10 to-[#F75D5D]/5 border-[#F75D5D]/20"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-baseline gap-0.5">
              {card.prefix && (
                <span className={`text-2xl font-extrabold ${isRoas ? "text-[#F75D5D]" : "text-gray-900"}`}>
                  {card.prefix}
                </span>
              )}
              <span className={`text-2xl font-extrabold tabular-nums ${isRoas ? "text-[#F75D5D]" : "text-gray-900"}`}>
                {card.value}
              </span>
              {card.suffix && (
                <span className={`text-2xl font-extrabold ${isRoas ? "text-[#F75D5D]" : "text-gray-900"}`}>
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
