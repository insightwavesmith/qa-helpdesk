"use client";

import { useCallback, useEffect, useState } from "react";
import { AccountSelector, type AdAccount } from "./components/account-selector";
import { PeriodTabs, type DateRange } from "./components/period-tabs";
import {
  AdMetricsTable,
  type AdInsightRow,
  type BenchmarkRow,
} from "./components/ad-metrics-table";
import { LpMetricsCard, type LpMetricRow } from "./components/lp-metrics-card";
import { BenchmarkCompare } from "./components/benchmark-compare";
import { Skeleton } from "@/components/ui/skeleton";

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
        // 계정이 1개이면 자동 선택
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

  // 기간 변경 핸들러
  const handlePeriodChange = (range: DateRange) => {
    setDateRange(range);
  };

  // 계정 변경 핸들러
  const handleAccountSelect = (accountId: string) => {
    setSelectedAccountId(accountId);
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-6 px-4 py-6 sm:px-6">
      {/* 페이지 제목 */}
      <div>
        <h1 className="text-2xl font-bold">📐 총가치각도기</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Meta 광고 성과를 벤치마크와 비교하여 진단합니다
        </p>
      </div>

      {/* 계정 선택 + 기간 선택 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <AccountSelector
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelect={handleAccountSelect}
          isLoading={loadingAccounts}
        />
        <PeriodTabs onPeriodChange={handlePeriodChange} />
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}

      {/* 로딩 */}
      {loadingData && (
        <div className="space-y-4">
          <Skeleton className="h-[200px] w-full rounded-lg" />
          <Skeleton className="h-[300px] w-full rounded-lg" />
          <Skeleton className="h-[200px] w-full rounded-lg" />
        </div>
      )}

      {/* 계정 미선택 */}
      {!selectedAccountId && !loadingAccounts && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p className="text-4xl">📊</p>
          <p className="mt-3 text-base font-medium">광고계정을 선택하세요</p>
          <p className="mt-1 text-sm">
            위 드롭다운에서 분석할 광고계정을 선택하면 데이터가 표시됩니다
          </p>
        </div>
      )}

      {/* 데이터 표시 */}
      {selectedAccountId && !loadingData && (
        <div className="space-y-6">
          {/* 광고 성과 테이블 */}
          <AdMetricsTable insights={insights} benchmarks={benchmarks} />

          {/* LP 지표 */}
          <LpMetricsCard lpMetrics={lpMetrics} />

          {/* 벤치마크 비교 */}
          <BenchmarkCompare insights={insights} benchmarks={benchmarks} />
        </div>
      )}
    </div>
  );
}
