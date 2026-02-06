"use client";

import { StatCards } from "@/components/dashboard/StatCards";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { ChannelBreakdown } from "@/components/dashboard/ChannelBreakdown";
import { CampaignTable } from "@/components/dashboard/CampaignTable";

export function V0Dashboard() {
  return (
    <div className="space-y-6">
      <StatCards />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <PerformanceChart />
        </div>
        <ChannelBreakdown />
      </div>
      <CampaignTable />
    </div>
  );
}
