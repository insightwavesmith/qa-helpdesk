"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { DateRange } from "@/app/(main)/protractor/components/period-tabs";

type PeriodKey = "7" | "14" | "30" | "90";

function getDateRange(days: number): DateRange {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() - 1);
  const endStr = end.toISOString().split("T")[0];

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { start: start.toISOString().split("T")[0], end: endStr };
}

interface PeriodSelectorProps {
  onPeriodChange: (range: DateRange) => void;
}

export function PeriodSelector({ onPeriodChange }: PeriodSelectorProps) {
  const [activePeriod, setActivePeriod] = useState<PeriodKey>("30");

  const handleTabChange = (value: string) => {
    const period = value as PeriodKey;
    setActivePeriod(period);
    onPeriodChange(getDateRange(Number(period)));
  };

  return (
    <div className="flex items-center gap-3">
      <Tabs value={activePeriod} onValueChange={handleTabChange}>
        <TabsList className="h-9 bg-secondary">
          <TabsTrigger value="7" className="text-xs">
            7일
          </TabsTrigger>
          <TabsTrigger value="14" className="text-xs">
            14일
          </TabsTrigger>
          <TabsTrigger value="30" className="text-xs">
            30일
          </TabsTrigger>
          <TabsTrigger value="90" className="text-xs">
            90일
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-xs bg-card text-card-foreground"
      >
        <CalendarDays className="h-3.5 w-3.5" />
        기간 직접 선택
      </Button>
    </div>
  );
}
