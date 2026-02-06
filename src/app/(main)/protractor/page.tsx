"use client";

import { useCallback, useEffect, useState } from "react";
import { type AdAccount } from "./components/account-selector";
import { type DateRange } from "./components/period-tabs";
import {
  type AdInsightRow,
  type BenchmarkRow,
} from "./components/ad-metrics-table";
import { type LpMetricRow } from "./components/lp-metrics-card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, BarChart3 } from "lucide-react";

import {
  ProtractorHeader,
  PeriodSelector,
  SummaryCards,
  DiagnosticPanel,
  PerformanceTrendChart,
  ConversionFunnel,
  DailyMetricsTable,
} from "@/components/protractor";

// 어제 날짜 (기본값)
function yesterday(): DateRange {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const s = d.toISOString().split("T")[0];
  return { start: s, end: s };
}

export default function ProtractorPage() {
  // 상태
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(yesterday());
  const [insights, setInsights] = useState<AdInsightRow[]>([]);
  const [lpMetrics, setLpMetrics] = useState<LpMetricRow[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkRow[]>([]);

  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1) 계정 목록 로드
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/protractor/accounts");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "계정 로드 실패");
        const data: AdAccount[] = json.data ?? [];
        setAccounts(data);
        if (data.length === 1) {
          setSelectedAccountId(data[0].account_id);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingAccounts(false);
      }
    })();
  }, []);

  // 2) 벤치마크 로드 (한 번만)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/protractor/benchmarks");
        const json = await res.json();
        if (res.ok && json.data) {
          setBenchmarks(json.data);
        }
      } catch {
        // 벤치마크 없어도 대시보드 표시 가능
      }
    })();
  }, []);

  // 3) 계정 + 기간 변경 시 데이터 로드
  const fetchData = useCallback(async () => {
    if (!selectedAccountId) return;

    setLoadingData(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        account_id: selectedAccountId,
        start: dateRange.start,
        end: dateRange.end,
      });

      const [insightsRes, lpRes] = await Promise.all([
        fetch(`/api/protractor/insights?${params}`),
        fetch(`/api/protractor/lp-metrics?${params}`),
      ]);

      const insightsJson = await insightsRes.json();
      const lpJson = await lpRes.json();

      if (!insightsRes.ok) throw new Error(insightsJson.error || "인사이트 조회 실패");

      setInsights(insightsJson.data ?? []);
      setLpMetrics(lpJson.data ?? []);
    } catch (e) {
      setError((e as Error).message);
      setInsights([]);
      setLpMetrics([]);
    } finally {
      setLoadingData(false);
    }
  }, [selectedAccountId, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePeriodChange = (range: DateRange) => {
    setDateRange(range);
  };

  const handleAccountSelect = (accountId: string) => {
    setSelectedAccountId(accountId);
  };

  // 실데이터 연결 전까지 unused 방지
  void lpMetrics;
  void benchmarks;
  void insights;

  return (
    <div className="flex flex-col gap-6">
      {/* Header: 제목 + 계정선택 + 기간선택 */}
      <header className="-m-6 mb-0 flex flex-col gap-4 border-b border-border bg-card px-6 py-4">
        <ProtractorHeader
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelect={handleAccountSelect}
          isLoading={loadingAccounts}
        />
        <PeriodSelector onPeriodChange={handlePeriodChange} />
      </header>

      {/* 에러 메시지 */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 로딩 */}
      {loadingData && (
        <div className="space-y-4">
          <Skeleton className="h-[120px] w-full rounded-lg" />
          <Skeleton className="h-[200px] w-full rounded-lg" />
          <Skeleton className="h-[300px] w-full rounded-lg" />
        </div>
      )}

      {/* 계정 미선택 */}
      {!selectedAccountId && !loadingAccounts && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <BarChart3 className="h-10 w-10" />
          <p className="mt-3 text-base font-medium">광고계정을 선택하세요</p>
          <p className="mt-1 text-sm">
            위 드롭다운에서 분석할 광고계정을 선택하면 데이터가 표시됩니다
          </p>
        </div>
      )}

      {/* 데이터 표시 — 더미 데이터 → 나중에 실데이터 연결 */}
      {selectedAccountId && !loadingData && (
        <>
          <SummaryCards />
          <DiagnosticPanel />
          <div className="grid gap-6 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <PerformanceTrendChart />
            </div>
            <div className="xl:col-span-2">
              <ConversionFunnel />
            </div>
          </div>
          <DailyMetricsTable />
        </>
      )}
    </div>
  );
}
