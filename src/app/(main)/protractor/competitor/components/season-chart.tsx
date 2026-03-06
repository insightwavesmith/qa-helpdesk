"use client";

interface SeasonData {
  month: number;
  adCount: number;
}

interface SeasonChartProps {
  seasonPattern: SeasonData[];
}

const MONTH_LABELS = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

export function SeasonChart({ seasonPattern }: SeasonChartProps) {
  if (!seasonPattern || seasonPattern.length === 0) return null;

  const maxCount = Math.max(...seasonPattern.map((s) => s.adCount), 1);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-900">월별 광고 패턴</h4>
      <div className="flex items-end gap-1 h-24">
        {MONTH_LABELS.map((label, i) => {
          const data = seasonPattern.find((s) => s.month === i + 1);
          const count = data?.adCount ?? 0;
          const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;

          return (
            <div
              key={label}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className="text-[10px] text-gray-400">{count > 0 ? count : ""}</span>
              <div
                className="w-full rounded-t transition-all duration-500"
                style={{
                  height: `${Math.max(heightPct, 4)}%`,
                  backgroundColor:
                    count === maxCount ? "#F75D5D" : "#e2e8f0",
                }}
              />
              <span className="text-[10px] text-gray-400">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
