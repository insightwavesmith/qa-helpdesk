"use client";

import {
  Target,
  DollarSign,
  ChartColumn,
  MousePointerClick,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

interface StatCardData {
  label: string;
  value: string;
  change: number;
  icon: React.ComponentType<{ className?: string }>;
}

const defaultStats: StatCardData[] = [
  { label: "ROAS", value: "—", change: 0, icon: Target },
  { label: "총 매출", value: "—", change: 0, icon: DollarSign },
  { label: "광고비", value: "—", change: 0, icon: ChartColumn },
  { label: "CTR", value: "—", change: 0, icon: MousePointerClick },
  { label: "CPC", value: "—", change: 0, icon: DollarSign },
];

interface StatCardsProps {
  stats?: StatCardData[];
}

export function StatCards({ stats = defaultStats }: StatCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {stats.map((stat) => {
        const Icon = stat.icon;
        const isPositive = stat.change > 0;
        // For CPC and 광고비, negative change is actually good
        const isGoodChange =
          stat.label === "CPC" || stat.label === "광고비"
            ? stat.change < 0
            : stat.change > 0;

        return (
          <div
            key={stat.label}
            className="rounded-lg border bg-card text-card-foreground shadow-sm relative overflow-hidden"
          >
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-bold text-card-foreground">
                    {stat.value}
                  </p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
              </div>
              {stat.value !== "\u2014" && stat.change !== 0 && (
                <div className="mt-3 flex items-center gap-1.5">
                  {isPositive ? (
                    <TrendingUp
                      className={`h-3.5 w-3.5 ${
                        isGoodChange ? "text-emerald-500" : "text-red-500"
                      }`}
                    />
                  ) : (
                    <TrendingDown
                      className={`h-3.5 w-3.5 ${
                        isGoodChange ? "text-emerald-500" : "text-red-500"
                      }`}
                    />
                  )}
                  <span
                    className={`text-xs font-semibold ${
                      isGoodChange ? "text-emerald-500" : "text-red-500"
                    }`}
                  >
                    {isPositive ? "+" : ""}
                    {stat.change}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    vs last period
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
