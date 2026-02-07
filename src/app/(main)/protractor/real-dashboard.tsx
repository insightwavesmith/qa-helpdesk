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
  ConversionFunnel,
  DailyMetricsTable,
} from "@/components/protractor";

import dynamic from "next/dynamic";
const PerformanceTrendChart = dynamic(
  () => import("@/components/protractor/PerformanceTrendChart").then(m => m.PerformanceTrendChart),
  { ssr: false, loading: () => <div className="h-[350px] rounded-lg bg-muted animate-pulse" /> }
);

import {
  aggregateSummary,
  toSummaryCards,
  toDailyTrend,
  toFunnelData,
  toDailyMetrics,
} from "@/lib/protractor/aggregate";

// 어제 날짜 (기본값)
function yesterday(): DateRange {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const s = d.toISOString().split("T")[0];
  return { start: s, end: s };
}

// 진단 결과 타입
interface DiagnosisIssue {
  title: string;
  description: string;
  severity: "심각" | "주의" | "양호";
}

interface DiagnosisData {
  grade: "A" | "B" | "C" | "D" | "F";
  gradeLabel: string;
  summary: string;
  issues: DiagnosisIssue[];
}

// 진단 verdict → grade 변환
function verdictToGrade(diagnoses: {
  overall_verdict: string;
  one_line_diagnosis: string;
  ad_name: string;
  parts: { part_name: string; verdict: string; metrics: { name: string; verdict: string; my_value: number | null; above_avg: number | null }[] }[];
}[]): DiagnosisData {
  if (!diagnoses || diagnoses.length === 0) {
    return { grade: "C", gradeLabel: "데이터 없음", summary: "진단할 광고 데이터가 부족합니다.", issues: [] };
  }

  // 전체 verdict 분포 계산
  const verdictCounts = { "🟢": 0, "🟡": 0, "🔴": 0, "⚪": 0 };
  for (const d of diagnoses) {
    const v = d.overall_verdict as keyof typeof verdictCounts;
    if (v in verdictCounts) verdictCounts[v]++;
  }

  // 등급 산출
  let grade: DiagnosisData["grade"];
  let gradeLabel: string;
  const total = diagnoses.length;
  const goodRatio = verdictCounts["🟢"] / total;
  const poorRatio = verdictCounts["🔴"] / total;

  if (goodRatio >= 0.8) { grade = "A"; gradeLabel = "우수"; }
  else if (goodRatio >= 0.5) { grade = "B"; gradeLabel = "양호"; }
  else if (poorRatio >= 0.6) { grade = "F"; gradeLabel = "위험"; }
  else if (poorRatio >= 0.3) { grade = "D"; gradeLabel = "주의 필요"; }
  else { grade = "C"; gradeLabel = "보통"; }

  // 한줄 진단 (첫 번째 광고의 one_line_diagnosis 사용)
  const summary = diagnoses[0].one_line_diagnosis;

  // 이슈 생성 (각 광고의 파트별 WARNING/BAD 항목)
  const issues: DiagnosisIssue[] = [];
  for (const d of diagnoses) {
    for (const part of d.parts) {
      if (part.verdict === "🔴") {
        const badMetrics = part.metrics
          .filter((m) => m.verdict === "🔴")
          .map((m) => m.name)
          .join(", ");
        issues.push({
          title: `${d.ad_name.substring(0, 30)} - ${part.part_name}`,
          description: badMetrics ? `미달 지표: ${badMetrics}` : `${part.part_name} 파트 전체가 미달입니다.`,
          severity: "심각",
        });
      } else if (part.verdict === "🟡") {
        issues.push({
          title: `${d.ad_name.substring(0, 30)} - ${part.part_name}`,
          description: `${part.part_name} 파트가 보통 수준입니다. 개선 여지가 있습니다.`,
          severity: "주의",
        });
      } else if (part.verdict === "🟢") {
        issues.push({
          title: `${d.ad_name.substring(0, 30)} - ${part.part_name}`,
          description: `${part.part_name} 파트가 우수합니다.`,
          severity: "양호",
        });
      }
    }
  }

  // 심각 → 주의 → 양호 순 정렬
  const severityOrder = { "심각": 0, "주의": 1, "양호": 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return { grade, gradeLabel, summary, issues: issues.slice(0, 8) };
}

export default function RealDashboard() {
  // 상태
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(yesterday());
  const [insights, setInsights] = useState<AdInsightRow[]>([]);
  const [lpMetrics, setLpMetrics] = useState<LpMetricRow[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkRow[]>([]);
  const [diagnosisData, setDiagnosisData] = useState<DiagnosisData | null>(null);

  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingDiagnosis, setLoadingDiagnosis] = useState(false);
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

  // 4) 진단 호출 (insights 로드 완료 후)
  useEffect(() => {
    if (!selectedAccountId || insights.length === 0) {
      setDiagnosisData(null);
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
          setDiagnosisData(verdictToGrade(json.diagnoses));
        }
      } catch {
        // 진단 실패해도 대시보드는 표시
      } finally {
        setLoadingDiagnosis(false);
      }
    })();
  }, [selectedAccountId, insights, dateRange]);

  const handlePeriodChange = (range: DateRange) => {
    setDateRange(range);
  };

  const handleAccountSelect = (accountId: string) => {
    setSelectedAccountId(accountId);
  };

  // 실데이터 집계
  const summary = insights.length > 0 ? aggregateSummary(insights) : null;
  const summaryCards = summary ? toSummaryCards(summary) : undefined;
  const trendData = insights.length > 0 ? toDailyTrend(insights) : undefined;
  const funnelResult = insights.length > 0 ? toFunnelData(insights) : undefined;
  const dailyMetrics = insights.length > 0 ? toDailyMetrics(insights) : undefined;

  // unused 방지
  void lpMetrics;
  void benchmarks;

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

      {/* 데이터 표시 — 실데이터 연결 */}
      {selectedAccountId && !loadingData && (
        <>
          <SummaryCards cards={summaryCards} />

          {loadingDiagnosis ? (
            <Skeleton className="h-[200px] w-full rounded-lg" />
          ) : diagnosisData ? (
            <DiagnosticPanel
              grade={diagnosisData.grade}
              gradeLabel={diagnosisData.gradeLabel}
              summary={diagnosisData.summary}
              issues={diagnosisData.issues}
            />
          ) : (
            <DiagnosticPanel />
          )}

          <div className="grid gap-6 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <PerformanceTrendChart data={trendData} />
            </div>
            <div className="xl:col-span-2">
              <ConversionFunnel
                steps={funnelResult?.steps}
                overallRate={funnelResult?.overallRate}
              />
            </div>
          </div>
          <DailyMetricsTable data={dailyMetrics} />
        </>
      )}
    </div>
  );
}
