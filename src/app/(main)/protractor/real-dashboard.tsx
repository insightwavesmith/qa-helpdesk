"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { type AdAccount } from "./components/account-selector";
import { type AdInsightRow, type BenchmarkRow } from "./components/ad-metrics-table";
import { PeriodTabs, type DateRange as PeriodDateRange } from "./components/period-tabs";
import { Top5AdCards } from "./components/top5-ad-cards";
import { BenchmarkCompare } from "./components/benchmark-compare";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, ArrowRight, BarChart3, LinkIcon } from "lucide-react";
import Link from "next/link";

import {
  ProtractorHeader,
  SummaryCards,
  TotalValueGauge,
  DiagnosticPanel,
  DailyMetricsTable,
  PerformanceTrendChart,
  ConversionFunnel,
  OverlapAnalysis,
  type OverlapData,
} from "@/components/protractor";

import {
  aggregateSummary,
  toSummaryCards,
  toDailyMetrics,
  toDailyTrend,
  toFunnelData,
} from "@/lib/protractor/aggregate";

// 어제 날짜 (기본값)
function yesterday(): PeriodDateRange {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const s = d.toISOString().split("T")[0];
  return { start: s, end: s };
}

// ── T3 API 응답 타입 ──

interface T3MetricResult {
  name: string;
  key: string;
  value: number | null;
  score: number | null;
  aboveAvg: number | null; // ABOVE_AVERAGE 단일 값 (T8: p25/p50/p75/p90 제거)
  status: string;
  unit: string;
}

interface T3DiagnosticPart {
  label: string;
  score: number;
  metrics: T3MetricResult[];
}

interface T3Response {
  score: number | null;
  period: number;
  dataAvailableDays: number;
  grade: { grade: "A" | "B" | "C" | "D" | "F"; label: string } | null;
  diagnostics: Record<string, T3DiagnosticPart> | null;
  metrics: T3MetricResult[];
  summary: {
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    purchases: number;
    purchaseValue: number;
    roas: number;
    adCount: number;
  } | null;
  message?: string;
}

// 진단 결과 원본 타입 (diagnose API 응답)
interface RawDiagnosisMetric {
  name: string;
  my_value: number | null;
  above_avg: number | null;
  average_avg: number | null;
  verdict: string;
}

interface RawDiagnosisPart {
  part_num: number;
  part_name: string;
  verdict: string;
  metrics: RawDiagnosisMetric[];
}

interface RawDiagnosis {
  ad_id: string;
  ad_name: string;
  overall_verdict: string;
  one_line_diagnosis: string;
  parts: RawDiagnosisPart[];
}

export default function RealDashboard() {
  const searchParams = useSearchParams();
  const accountParam = searchParams.get("account");

  // 상태
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<PeriodDateRange>(yesterday());
  const [periodNum, setPeriodNum] = useState(1); // 기간 (일수)
  const [insights, setInsights] = useState<AdInsightRow[]>([]);
  const [rawDiagnoses, setRawDiagnoses] = useState<RawDiagnosis[] | null>(null);
  const [totalValue, setTotalValue] = useState<T3Response | null>(null);

  const [benchmarks, setBenchmarks] = useState<BenchmarkRow[]>([]);

  const [activeTab, setActiveTab] = useState<"summary" | "overlap" | "content">("summary");
  const [overlapData, setOverlapData] = useState<OverlapData | null>(null);
  const [loadingOverlap, setLoadingOverlap] = useState(false);
  const [overlapError, setOverlapError] = useState<string | null>(null);

  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingDiagnosis, setLoadingDiagnosis] = useState(false);
  const [loadingTotalValue, setLoadingTotalValue] = useState(false);
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
        // URL 파라미터로 계정 지정된 경우 우선 선택, 아니면 첫 번째 자동 선택
        if (accountParam && data.some((a) => a.account_id === accountParam)) {
          setSelectedAccountId(accountParam);
        } else if (data.length >= 1) {
          setSelectedAccountId(data[0].account_id);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingAccounts(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1-a) 선택된 계정이 목록에 없으면 첫 번째 활성 계정으로 자동 전환
  useEffect(() => {
    if (!selectedAccountId || accounts.length === 0) return;
    const exists = accounts.some((a) => a.account_id === selectedAccountId);
    if (!exists) {
      setSelectedAccountId(accounts[0].account_id);
    }
  }, [accounts, selectedAccountId]);

  // 1-b) 벤치마크 로드 (한 번만)
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

  // 2) 계정 + 기간 변경 시 데이터 로드
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

      const insightsRes = await fetch(`/api/protractor/insights?${params}`);
      const insightsJson = await insightsRes.json();
      if (!insightsRes.ok) throw new Error(insightsJson.error || "인사이트 조회 실패");
      setInsights(insightsJson.data ?? []);
    } catch (e) {
      setError((e as Error).message);
      setInsights([]);
    } finally {
      setLoadingData(false);
    }
  }, [selectedAccountId, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 3) 진단 호출 (insights 로드 완료 후)
  useEffect(() => {
    if (!selectedAccountId || insights.length === 0) {
      setRawDiagnoses(null);
      return;
    }

    (async () => {
      setLoadingDiagnosis(true);
      try {
        const res = await fetch("/api/diagnose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: selectedAccountId,
            startDate: dateRange.start,
            endDate: dateRange.end,
          }),
        });
        const json = await res.json();
        if (res.ok && json.diagnoses) {
          setRawDiagnoses(json.diagnoses as RawDiagnosis[]);
        }
      } catch {
        // 진단 실패해도 대시보드는 표시
      } finally {
        setLoadingDiagnosis(false);
      }
    })();
  }, [selectedAccountId, insights, dateRange]);

  // 4) 총가치수준 T3 호출 (period 포함)
  useEffect(() => {
    if (!selectedAccountId) {
      setTotalValue(null);
      return;
    }

    (async () => {
      setLoadingTotalValue(true);
      try {
        const params = new URLSearchParams({
          account_id: selectedAccountId,
          period: String(periodNum),
          date_start: dateRange.start,
          date_end: dateRange.end,
        });
        const res = await fetch(`/api/protractor/total-value?${params}`);
        const json: T3Response = await res.json();
        if (res.ok) {
          setTotalValue(json);
        } else {
          setTotalValue(null);
        }
      } catch {
        setTotalValue(null);
      } finally {
        setLoadingTotalValue(false);
      }
    })();
  }, [selectedAccountId, dateRange, periodNum]);

  // 5) 타겟중복 분석 (overlap 탭 활성 + 7일 이상일 때)
  const fetchOverlap = useCallback(
    async (force = false) => {
      if (!selectedAccountId) return;
      const days =
        Math.round(
          (new Date(dateRange.end).getTime() -
            new Date(dateRange.start).getTime()) /
            (1000 * 60 * 60 * 24)
        ) + 1;
      if (days < 7) return;

      setLoadingOverlap(true);
      setOverlapError(null);
      try {
        const params = new URLSearchParams({
          account_id: selectedAccountId,
          date_start: dateRange.start,
          date_end: dateRange.end,
        });
        if (force) params.set("force", "true");
        const res = await fetch(`/api/protractor/overlap?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "타겟중복 분석 실패");
        setOverlapData(json);
      } catch (e) {
        setOverlapError((e as Error).message);
        setOverlapData(null);
      } finally {
        setLoadingOverlap(false);
      }
    },
    [selectedAccountId, dateRange]
  );

  useEffect(() => {
    if (activeTab === "overlap") {
      fetchOverlap();
    }
  }, [activeTab, fetchOverlap]);

  const handlePeriodChange = (range: PeriodDateRange, days: number) => {
    setDateRange(range);
    setPeriodNum(days);
  };

  const handleAccountSelect = (accountId: string) => {
    setSelectedAccountId(accountId);
    const url = new URL(window.location.href);
    url.searchParams.set("account", accountId);
    window.history.replaceState({}, "", url.toString());
  };

  // 실데이터 집계
  const summary = insights.length > 0 ? aggregateSummary(insights) : null;
  const summaryCards = summary ? toSummaryCards(summary) : undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. ProtractorHeader (카드형) */}
      <ProtractorHeader
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelect={handleAccountSelect}
        isLoading={loadingAccounts}
        dateRange={dateRange}
      />

      {/* 2. PeriodTabs (카드형) */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <PeriodTabs onPeriodChange={handlePeriodChange} />
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 광고계정 연결 배너 */}
      {accounts.length === 0 && !loadingAccounts && !error && (
        <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
              <LinkIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                광고계정을 연결하면 내 데이터를 볼 수 있습니다
              </p>
              <p className="text-xs text-white/80">
                Meta 광고계정을 연결하고 실제 성과 데이터로 진단 받으세요
              </p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-white/90"
          >
            광고계정 연결
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* 3. 탭 구조: 성과 요약 / 타겟중복 */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "summary" | "overlap" | "content")}
      >
        <TabsList>
          <TabsTrigger value="summary">성과 요약</TabsTrigger>
          <TabsTrigger value="overlap">타겟중복</TabsTrigger>
          <TabsTrigger value="content">콘텐츠</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-6 space-y-6">
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
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <BarChart3 className="h-10 w-10" />
              <p className="mt-3 text-base font-medium">광고계정을 선택하세요</p>
              <p className="mt-1 text-sm">
                위 드롭다운에서 분석할 광고계정을 선택하면 데이터가 표시됩니다
              </p>
            </div>
          )}

          {/* 데이터 표시 — 목업 순서: 게이지 → 요약카드 → TOP5 광고 (항상 표시) */}
          {selectedAccountId && !loadingData && (
            <>
              {/* 3a. TotalValueGauge (T3 엔진) */}
              <TotalValueGauge
                data={totalValue}
                isLoading={loadingTotalValue}
              />

              {/* 3b. SummaryCards */}
              <SummaryCards cards={summaryCards} />

              {/* 3c. 진단 3컬럼 (T3 기반점수 / 참여율 / 전환율) */}
              {totalValue?.diagnostics && (
                <DiagnosticPanel t3Diagnostics={totalValue.diagnostics} />
              )}

              {/* 3d. Top5AdCards (항상 표시, 토글 없음) */}
              {loadingDiagnosis ? (
                <Skeleton className="h-[200px] w-full rounded-lg" />
              ) : (
                <Top5AdCards
                  insights={insights}
                  accountId={selectedAccountId ?? undefined}
                  mixpanelProjectId={accounts.find(a => a.account_id === selectedAccountId)?.mixpanel_project_id}
                  mixpanelBoardId={accounts.find(a => a.account_id === selectedAccountId)?.mixpanel_board_id}
                  diagnoses={rawDiagnoses ?? undefined}
                />
              )}

              {/* 3e. 일별 성과 테이블 */}
              {insights.length > 0 && (
                <DailyMetricsTable data={toDailyMetrics(insights)} />
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="overlap" className="mt-6">
          <OverlapAnalysis
            accountId={selectedAccountId}
            dateRange={dateRange}
            overlapData={overlapData}
            isLoading={loadingOverlap}
            onRefresh={() => fetchOverlap(true)}
            error={overlapError}
          />
        </TabsContent>

        <TabsContent value="content" className="mt-6 space-y-6">
          {selectedAccountId && insights.length > 0 ? (
            <>
              {/* 성과 추이 + 전환 퍼널 */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
                <div className="xl:col-span-3">
                  <PerformanceTrendChart data={toDailyTrend(insights)} />
                </div>
                <div className="xl:col-span-2">
                  <ConversionFunnel
                    steps={toFunnelData(insights).steps}
                    overallRate={toFunnelData(insights).overallRate}
                  />
                </div>
              </div>

              {/* 벤치마크 비교 */}
              <BenchmarkCompare insights={insights} benchmarks={benchmarks} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <BarChart3 className="h-10 w-10" />
              <p className="mt-3 text-base font-medium">
                {!selectedAccountId ? "광고계정을 선택하세요" : "데이터가 없습니다"}
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
