"use client";

import Link from "next/link";
import { BarChart3, TrendingUp } from "lucide-react";

export interface AdSummaryData {
  totalRevenue: number;
  totalSpend: number;
  roas: number;
  totalPurchases: number;
}

interface StudentAdSummaryProps {
  data: AdSummaryData | null;
}

function fmtKRW(n: number): string {
  if (n >= 100_000_000) return `\u20A9${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `\u20A9${Math.round(n / 10_000).toLocaleString("ko-KR")}만`;
  return `\u20A9${n.toLocaleString("ko-KR")}`;
}

export function StudentAdSummary({ data }: StudentAdSummaryProps) {
  if (!data) return null;

  return (
    <div className="bg-card-bg rounded-xl border border-border-color p-6 card-hover">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg flex items-center gap-2 text-text-main">
          <BarChart3 className="h-5 w-5 text-primary" />
          내 광고 성과 (최근 7일)
        </h3>
        <Link
          href="/protractor"
          className="text-primary text-sm font-medium hover:underline flex items-center gap-1"
        >
          상세보기 <TrendingUp className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-text-main">{fmtKRW(data.totalRevenue)}</div>
          <div className="text-xs text-text-secondary mt-1">매출</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-text-main">{fmtKRW(data.totalSpend)}</div>
          <div className="text-xs text-text-secondary mt-1">광고비</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">{(data.roas * 100).toFixed(0)}%</div>
          <div className="text-xs text-text-secondary mt-1">ROAS</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-text-main">{data.totalPurchases.toLocaleString("ko-KR")}</div>
          <div className="text-xs text-text-secondary mt-1">구매전환</div>
        </div>
      </div>
    </div>
  );
}
