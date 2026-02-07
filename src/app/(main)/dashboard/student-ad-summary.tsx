"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, TrendingUp } from "lucide-react";

interface MiniSummary {
  totalRevenue: number;
  totalSpend: number;
  roas: number;
  totalPurchases: number;
}

function fmtKRW(n: number): string {
  if (n >= 100_000_000) return `₩${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `₩${Math.round(n / 10_000).toLocaleString("ko-KR")}만`;
  return `₩${n.toLocaleString("ko-KR")}`;
}

export function StudentAdSummary() {
  const [summary, setSummary] = useState<MiniSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // 계정 목록 가져오기
        const accRes = await fetch("/api/protractor/accounts");
        const accJson = await accRes.json();
        const accounts = accJson.data ?? [];
        if (accounts.length === 0) {
          setLoading(false);
          return;
        }

        // 최근 7일
        const end = new Date();
        end.setDate(end.getDate() - 1);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        const startStr = start.toISOString().split("T")[0];
        const endStr = end.toISOString().split("T")[0];

        // 첫 번째 계정의 데이터
        const res = await fetch(
          `/api/protractor/insights?account_id=${accounts[0].account_id}&start=${startStr}&end=${endStr}`
        );
        const json = await res.json();
        const rows = json.data ?? [];

        if (rows.length === 0) {
          setLoading(false);
          return;
        }

        let totalSpend = 0;
        let totalRevenue = 0;
        let totalPurchases = 0;
        for (const row of rows) {
          totalSpend += row.spend || 0;
          totalRevenue += row.purchase_value || 0;
          totalPurchases += row.purchases || 0;
        }

        setSummary({
          totalRevenue: Math.round(totalRevenue),
          totalSpend: Math.round(totalSpend),
          roas: totalSpend > 0 ? +(totalRevenue / totalSpend).toFixed(2) : 0,
          totalPurchases,
        });
      } catch {
        // 실패 무시
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="bg-card-bg rounded-xl border border-border-color p-6 animate-pulse">
        <div className="h-24 bg-muted rounded" />
      </div>
    );
  }

  if (!summary) return null;

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
          <div className="text-2xl font-bold text-text-main">{fmtKRW(summary.totalRevenue)}</div>
          <div className="text-xs text-text-secondary mt-1">매출</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-text-main">{fmtKRW(summary.totalSpend)}</div>
          <div className="text-xs text-text-secondary mt-1">광고비</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">{(summary.roas * 100).toFixed(0)}%</div>
          <div className="text-xs text-text-secondary mt-1">ROAS</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-text-main">{summary.totalPurchases.toLocaleString("ko-KR")}</div>
          <div className="text-xs text-text-secondary mt-1">구매전환</div>
        </div>
      </div>
    </div>
  );
}
