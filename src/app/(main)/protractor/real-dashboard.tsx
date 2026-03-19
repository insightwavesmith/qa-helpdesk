"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { type AdAccount } from "./components/account-selector";
import { type AdInsightRow } from "./components/ad-metrics-table";
import { PeriodTabs, type DateRange as PeriodDateRange } from "./components/period-tabs";
import { ContentRanking } from "./components/content-ranking";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, ArrowRight, BarChart3, LinkIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { removeAdAccount } from "@/actions/onboarding";
import { mp } from "@/lib/mixpanel";
import { jsonFetcher } from "@/lib/swr/config";
import { SWR_KEYS } from "@/lib/swr/keys";

import dynamic from "next/dynamic";
import {
  ProtractorHeader,
  SummaryCards,
  TotalValueGauge,
  type OverlapData,
} from "@/components/protractor";

const OverlapAnalysis = dynamic(
  () => import("@/components/protractor/OverlapAnalysis").then((m) => m.OverlapAnalysis),
  {
    ssr: false,
    loading: () => <div className="h-[300px] animate-pulse rounded-xl bg-gray-100" />,
  }
);

import {
  aggregateSummary,
  toSummaryCards,
} from "@/lib/protractor/aggregate";

// 어제 날짜 (기본값) — toISOString은 UTC 변환되어 KST 자정~09시 사이 날짜 밀림
function yesterday(): PeriodDateRange {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const s = `${y}-${m}-${day}`;
  return { start: s, end: s };
}

// ── T3 API 응답 타입 ──

interface T3MetricResult {
  name: string;
  key: string;
  value: number | null;
  score: number | null;
  pctOfBenchmark: number | null; // T3: 기준 대비 % (raw aboveAvg 대신)
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
  hasBenchmarkData?: boolean;
}

interface RealDashboardProps {
  initialAccounts?: Record<string, unknown>[];
}

export default function RealDashboard({ initialAccounts }: RealDashboardProps) {
  const searchParams = useSearchParams();
  const accountParam = searchParams.get("account_id");

  // UI 상태
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<PeriodDateRange>(yesterday());
  const [periodNum, setPeriodNum] = useState(1);
  const [activeTab, setActiveTab] = useState<"summary" | "content">("summary");

  // 1) SWR: 계정 목록
  const { data: accountsData, error: accountsError, isLoading: loadingAccounts, mutate: mutateAccounts } = useSWR(
    SWR_KEYS.PROTRACTOR_ACCOUNTS,
    jsonFetcher,
    initialAccounts ? { fallbackData: { data: initialAccounts } } : undefined,
  );
  const accounts: AdAccount[] = accountsData?.data ?? [];

  // Mixpanel: 총가치각도기 페이지 뷰
  useEffect(() => {
    mp.track("protractor_viewed");
  }, []);

  // URL 파라미터 또는 첫 번째 계정 자동 선택
  useEffect(() => {
    if (accounts.length === 0) return;
    if (selectedAccountId) {
      const exists = accounts.some((a) => a.account_id === selectedAccountId);
      if (exists) return;
    }
    if (accountParam && accounts.some((a) => a.account_id === accountParam)) {
      setSelectedAccountId(accountParam);
    } else {
      setSelectedAccountId(accounts[0].account_id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  // 2) SWR: insights
  const { data: insightsData, error: insightsError, isLoading: loadingData } = useSWR(
    selectedAccountId ? SWR_KEYS.protractorInsights(selectedAccountId, dateRange.start, dateRange.end) : null,
    jsonFetcher,
  );
  const insights: AdInsightRow[] = insightsData?.data ?? [];
  const error = accountsError ? String(accountsError) : insightsError ? String(insightsError) : null;

  // 3) SWR: 총가치수준 T3
  const { data: totalValueRaw, error: tvError, isLoading: loadingTotalValue } = useSWR(
    selectedAccountId ? SWR_KEYS.protractorTotalValue(selectedAccountId, periodNum, dateRange.start, dateRange.end) : null,
    async (url: string) => {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? "권한이 없습니다"
            : (json as { error?: string }).error || "T3 점수 조회 실패"
        );
      }
      return json as T3Response;
    },
  );
  const totalValue = totalValueRaw ?? null;
  const totalValueError = tvError ? String(tvError) : null;

  // 4) SWR: 타겟중복 분석
  const { data: overlapData = null, error: overlapErr, isLoading: loadingOverlap, mutate: mutateOverlap } = useSWR(
    selectedAccountId ? SWR_KEYS.protractorOverlap(selectedAccountId, dateRange.start, dateRange.end) : null,
    jsonFetcher,
  );
  const overlapError = overlapErr ? String(overlapErr) : null;

  const fetchOverlap = useCallback(
    async (force = false) => {
      if (!selectedAccountId || !force) return;
      const params = new URLSearchParams({
        account_id: selectedAccountId,
        date_start: dateRange.start,
        date_end: dateRange.end,
        force: "true",
      });
      const res = await fetch(`/api/protractor/overlap?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "타겟중복 분석 실패");
      mutateOverlap(json, { revalidate: false });
    },
    [selectedAccountId, dateRange, mutateOverlap],
  );

  const handlePeriodChange = (range: PeriodDateRange, days: number) => {
    setDateRange(range);
    setPeriodNum(days);
  };

  const handleAccountSelect = (accountId: string) => {
    setSelectedAccountId(accountId);
    const url = new URL(window.location.href);
    url.searchParams.set("account_id", accountId);
    window.history.replaceState({}, "", url.toString());
  };

  const handleRemoveAccount = async (accountId: string) => {
    const confirmed = window.confirm(
      `광고계정 ${accountId}를 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`
    );
    if (!confirmed) return;

    const result = await removeAdAccount(accountId);
    if (result.error) {
      toast.error(`계정 삭제 실패: ${result.error}`);
    } else {
      toast.success("광고계정이 삭제되었습니다.");
      mutateAccounts();
      if (selectedAccountId === accountId) {
        const remaining = accounts.filter((a) => a.account_id !== accountId);
        setSelectedAccountId(remaining.length > 0 ? remaining[0].account_id : null);
      }
    }
  };

  // 실데이터 집계
  const summary = insights.length > 0 ? aggregateSummary(insights) : null;
  // T2: totalValue.metrics를 toSummaryCards에 전달 → 벤치마크 비교 표시
  const summaryCards = summary ? toSummaryCards(summary, totalValue?.metrics ?? null) : undefined;

  // 현재 선택 계정의 믹스패널 정보
  const selectedAccount = accounts.find((a) => a.account_id === selectedAccountId);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. ProtractorHeader (카드형) */}
      <ProtractorHeader
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelect={handleAccountSelect}
        onRemove={handleRemoveAccount}
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

      {/* 3. 탭 구조: 성과 요약 / 콘텐츠 */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as "summary" | "content");
          mp.track("protractor_tab_switched", { tab: v });
        }}
      >
        <TabsList>
          <TabsTrigger value="summary">성과 요약</TabsTrigger>
          <TabsTrigger value="content">콘텐츠</TabsTrigger>
        </TabsList>

        {/* ── 성과 요약 탭 ── */}
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

          {/* 데이터 표시 */}
          {selectedAccountId && !loadingData && (
            <>
              {/* 3a. TotalValueGauge (T3 엔진) — 9개 지표 카드 숨김 */}
              <TotalValueGauge
                data={totalValue}
                isLoading={loadingTotalValue}
                showMetricCards={false}
                errorMessage={totalValueError}
              />

              {/* 3b. SummaryCards (6개: 3초시청률/CTR/CPC/구매전환율/노출당구매확률/ROAS) */}
              <SummaryCards cards={summaryCards} />

              {/* 3c. 타겟중복 분석 */}
              {selectedAccountId && (
                <OverlapAnalysis
                  accountId={selectedAccountId}
                  dateRange={dateRange}
                  overlapData={overlapData}
                  isLoading={loadingOverlap}
                  onRefresh={() => fetchOverlap(true)}
                  error={overlapError}
                />
              )}
            </>
          )}
        </TabsContent>

        {/* ── 콘텐츠 탭 ── */}
        <TabsContent value="content" className="mt-6">
          {loadingData ? (
            <div className="space-y-3">
              <Skeleton className="h-[140px] w-full rounded-xl" />
              <Skeleton className="h-[140px] w-full rounded-xl" />
              <Skeleton className="h-[140px] w-full rounded-xl" />
            </div>
          ) : selectedAccountId && insights.length > 0 ? (
            <ContentRanking
              insights={insights}
              accountId={selectedAccountId}
              periodNum={periodNum}
              mixpanelProjectId={selectedAccount?.mixpanel_project_id}
              mixpanelBoardId={selectedAccount?.mixpanel_board_id}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <BarChart3 className="h-10 w-10" />
              <p className="mt-3 text-base font-medium">
                {!selectedAccountId ? "광고계정을 선택하세요" : "해당 기간에 광고 데이터가 없습니다"}
              </p>
            </div>
          )}
        </TabsContent>

      </Tabs>
    </div>
  );
}
