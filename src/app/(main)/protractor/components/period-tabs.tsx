"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type PeriodKey = "yesterday" | "7d" | "14d" | "30d" | "custom";

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;
}

// 기간으로부터 날짜 범위를 계산
function getDateRange(period: PeriodKey): DateRange {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() - 1); // 어제까지

  const endStr = end.toISOString().split("T")[0];

  if (period === "yesterday") {
    return { start: endStr, end: endStr };
  }

  const days = period === "7d" ? 7 : period === "14d" ? 14 : 30;
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { start: start.toISOString().split("T")[0], end: endStr };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "yesterday", label: "어제" },
  { key: "7d", label: "7일" },
  { key: "14d", label: "14일" },
  { key: "30d", label: "30일" },
  { key: "custom", label: "직접선택" },
];

interface PeriodTabsProps {
  onPeriodChange: (range: DateRange) => void;
}

// 기간 선택 탭
export function PeriodTabs({ onPeriodChange }: PeriodTabsProps) {
  const [activePeriod, setActivePeriod] = useState<PeriodKey>("yesterday");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const handleTabClick = (period: PeriodKey) => {
    setActivePeriod(period);

    if (period !== "custom") {
      onPeriodChange(getDateRange(period));
    }
  };

  const handleCustomApply = () => {
    if (!customStart || !customEnd) return;
    if (customStart > customEnd) return;
    onPeriodChange({ start: customStart, end: customEnd });
  };

  // 현재 활성 기간의 날짜 범위 라벨
  const currentRange = activePeriod !== "custom"
    ? getDateRange(activePeriod)
    : customStart && customEnd
    ? { start: customStart, end: customEnd }
    : null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => handleTabClick(opt.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activePeriod === opt.key
                ? "bg-gradient-to-r from-[#F75D5D] to-[#E54949] text-white shadow-sm"
                : "border border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 우측: 날짜범위 라벨 (custom이 아닐 때) */}
      {activePeriod !== "custom" && currentRange && (
        <span className="text-sm text-gray-400">
          {formatDate(currentRange.start)} ~ {formatDate(currentRange.end)}
        </span>
      )}

      {/* 직접선택 모드 */}
      {activePeriod === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-[150px] border-gray-200"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
          />
          <span className="text-gray-400">~</span>
          <Input
            type="date"
            className="w-[150px] border-gray-200"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
          />
          <Button
            size="sm"
            onClick={handleCustomApply}
            className="bg-[#F75D5D] hover:bg-[#E54949]"
          >
            적용
          </Button>
        </div>
      )}
    </div>
  );
}
