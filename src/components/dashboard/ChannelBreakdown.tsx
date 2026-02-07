"use client";

import { PieChart } from "lucide-react";

interface ChannelData {
  name: string;
  roas: number;
  roasColor: string;
  share: number;
  barColor: string;
  adSpend: string;
  revenue: string;
}

interface ChannelBreakdownProps {
  channels?: ChannelData[];
}

export function ChannelBreakdown({ channels = [] }: ChannelBreakdownProps) {
  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm h-full">
      <div className="flex flex-col space-y-1.5 p-6">
        <div className="tracking-tight text-base font-semibold text-card-foreground">
          채널별 성과
        </div>
      </div>
      <div className="p-6 pt-0">
        {channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 mb-4">
              <PieChart className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1">데이터가 없습니다</p>
            <p className="text-xs text-gray-500">채널별 성과가 여기에 표시됩니다</p>
          </div>
        ) : (
          <div className="space-y-5">
            {channels.map((ch) => (
              <div key={ch.name} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-card-foreground">
                    {ch.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-semibold tabular-nums ${ch.roasColor}`}
                    >
                      {ch.roas}x
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {ch.share}%
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full transition-all ${ch.barColor}`}
                    style={{ width: `${ch.share}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>광고비: {ch.adSpend}</span>
                  <span>매출: {ch.revenue}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
