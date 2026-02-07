"use client";

import { useEffect, useState } from "react";
import {
  Target,
  DollarSign,
  ChartColumn,
  MousePointerClick,
  Users,
} from "lucide-react";
import { StatCards } from "@/components/dashboard/StatCards";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { ChannelBreakdown } from "@/components/dashboard/ChannelBreakdown";
import { CampaignTable } from "@/components/dashboard/CampaignTable";

interface AdminSummary {
  totalRevenue: number;
  totalSpend: number;
  roas: number;
  avgCtr: number;
  activeAccounts: number;
}

function fmtKRW(n: number): string {
  if (n >= 100_000_000) return `₩${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `₩${Math.round(n / 10_000).toLocaleString("ko-KR")}만`;
  return `₩${n.toLocaleString("ko-KR")}`;
}

export function V0Dashboard() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // 최근 7일 범위
        const end = new Date();
        end.setDate(end.getDate() - 1);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        const startStr = start.toISOString().split("T")[0];
        const endStr = end.toISOString().split("T")[0];

        // 전체 계정 목록
        const accountsRes = await fetch("/api/protractor/accounts");
        const accountsJson = await accountsRes.json();
        const accounts = accountsJson.data ?? [];
        if (accounts.length === 0) return;

        // 각 계정의 insights 조회 (병렬)
        const insightsPromises = accounts.map(
          (acc: { account_id: string }) =>
            fetch(
              `/api/protractor/insights?account_id=${acc.account_id}&start=${startStr}&end=${endStr}`
            ).then((r) => r.json())
        );
        const insightsResults = await Promise.all(insightsPromises);

        // 전체 집계 (원본 get_account_summary와 동일)
        let totalSpend = 0;
        let totalRevenue = 0;
        let totalClicks = 0;
        let totalImpressions = 0;
        let activeAccounts = 0;

        for (const result of insightsResults) {
          const rows = result.data ?? [];
          if (rows.length > 0) activeAccounts++;
          for (const row of rows) {
            totalSpend += row.spend || 0;
            totalRevenue += row.purchase_value || 0;
            totalClicks += row.clicks || 0;
            totalImpressions += row.impressions || 0;
          }
        }

        setSummary({
          totalRevenue: Math.round(totalRevenue),
          totalSpend: Math.round(totalSpend),
          roas: totalSpend > 0 ? +(totalRevenue / totalSpend).toFixed(2) : 0,
          avgCtr: totalImpressions > 0 ? +(totalClicks / totalImpressions * 100).toFixed(2) : 0,
          activeAccounts,
        });
      } catch {
        // 실패해도 기본 UI 표시
      }
    })();
  }, []);

  const stats = summary
    ? [
        { label: "ROAS", value: `${(summary.roas * 100).toFixed(0)}%`, change: 0, icon: Target },
        { label: "총 매출", value: fmtKRW(summary.totalRevenue), change: 0, icon: DollarSign },
        { label: "광고비", value: fmtKRW(summary.totalSpend), change: 0, icon: ChartColumn },
        { label: "CTR", value: `${summary.avgCtr}%`, change: 0, icon: MousePointerClick },
        { label: "활성 계정", value: `${summary.activeAccounts}개`, change: 0, icon: Users },
      ]
    : undefined;

  return (
    <div className="space-y-6">
      <StatCards stats={stats} />
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
