"use client";

import { TrendingUp, TrendingDown } from "lucide-react";

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
  {
    label: "총 매출",
    value: "127,450,000",
    prefix: "₩",
    changePercent: 12.5,
    changeLabel: "전주 대비",
  },
  {
    label: "광고비",
    value: "18,320,000",
    prefix: "₩",
    changePercent: -3.2,
    changeLabel: "전주 대비",
  },
  {
    label: "ROAS",
    value: "695",
    suffix: "%",
    changePercent: 18.7,
    changeLabel: "전주 대비",
  },
  {
    label: "구매전환수",
    value: "1,847",
    changePercent: 8.3,
    changeLabel: "전주 대비",
  },
  {
    label: "CPA",
    value: "9,920",
    prefix: "₩",
    changePercent: -11.4,
    changeLabel: "전주 대비",
  },
  {
    label: "CTR",
    value: "2.34",
    suffix: "%",
    changePercent: 5.1,
    changeLabel: "전주 대비",
  },
];

export function SummaryCards({ cards = defaultCards }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => {
        const isPositive = card.changePercent >= 0;
        // For CPA, decrease is good; for others, increase is good
        const isCpaLike = card.label === "CPA" || card.label === "광고비";
        const isGood = isCpaLike ? !isPositive : isPositive;

        return (
          <div
            key={card.label}
            className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <span className="text-xs font-medium text-muted-foreground">
              {card.label}
            </span>
            <div className="flex items-baseline gap-1">
              {card.prefix && (
                <span className="text-sm font-medium text-muted-foreground">
                  {card.prefix}
                </span>
              )}
              <span className="text-xl font-bold tabular-nums text-card-foreground">
                {card.value}
              </span>
              {card.suffix && (
                <span className="text-sm font-medium text-muted-foreground">
                  {card.suffix}
                </span>
              )}
            </div>
            <div
              className={`flex items-center gap-1 text-xs font-medium ${
                isGood ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span>
                {isPositive ? "+" : ""}
                {card.changePercent}%
              </span>
              <span className="text-muted-foreground">{card.changeLabel}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
