"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface PeriodTabsProps {
  onPeriodChange: (range: DateRange) => void;
}

// 기간 선택 탭
export function PeriodTabs({ onPeriodChange }: PeriodTabsProps) {
  const [activePeriod, setActivePeriod] = useState<PeriodKey>("yesterday");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const handleTabChange = (value: string) => {
    const period = value as PeriodKey;
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

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Tabs value={activePeriod} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="yesterday">어제</TabsTrigger>
          <TabsTrigger value="7d">7일</TabsTrigger>
          <TabsTrigger value="14d">14일</TabsTrigger>
          <TabsTrigger value="30d">30일</TabsTrigger>
          <TabsTrigger value="custom">직접선택</TabsTrigger>
        </TabsList>
      </Tabs>

      {activePeriod === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-[150px]"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
          />
          <span className="text-muted-foreground">~</span>
          <Input
            type="date"
            className="w-[150px]"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
          />
          <Button size="sm" onClick={handleCustomApply}>
            적용
          </Button>
        </div>
      )}
    </div>
  );
}
