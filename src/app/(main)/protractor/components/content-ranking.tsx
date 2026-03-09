"use client";

import { useState, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdInsightRow } from "./ad-metrics-table";
import { getTop5Ads } from "@/lib/protractor/aggregate";
import { METRIC_GROUPS, type CommonMetricDef } from "@/lib/protractor/metric-groups";

// ============================================================
// 타입 정의
// ============================================================

interface RawDiagnosisMetric {
  name: string;
  key: string | null;
  my_value: number | null;
  pct_of_benchmark: number | null;
  abs_benchmark: number | null; // T3: 절대 벤치마크 값 (my_value=0일 때 기준값 표시용)
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

export interface ContentRankingProps {
  insights: AdInsightRow[];
  accountId: string;
  periodNum: number;
  mixpanelProjectId?: string | null;
  mixpanelBoardId?: string | null;
}

// ============================================================
// 포맷 헬퍼
// ============================================================

function fmtCurrency(n: number | undefined | null): string {
  if (n == null) return "-";
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

function fmtNum(n: number | undefined | null): string {
  if (n == null) return "-";
  return Math.round(n).toLocaleString("ko-KR");
}

function fmtCtr(n: number | undefined | null): string {
  if (n == null) return "-";
  return n.toFixed(2) + "%";
}

function fmtDecimal(n: number | undefined | null, digits = 1): string {
  if (n == null) return "-";
  return n.toFixed(digits);
}

// ============================================================
// 판정 스타일
// ============================================================

function verdictStyle(verdict: string): { bg: string; text: string; border: string } {
  if (verdict.includes("🟢")) return { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" };
  if (verdict.includes("🟡")) return { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" };
  if (verdict.includes("🔴")) return { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" };
  return { bg: "bg-gray-50", text: "text-gray-500", border: "border-gray-200" };
}

function verdictEmoji(verdict: string): string {
  return verdict.match(/[🟢🟡🔴]/u)?.[0] ?? "⚪";
}


// ============================================================
// 통계 미니카드
// ============================================================

function StatCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-2 py-2">
      <span className={`text-sm font-bold ${highlight ? "text-[#F75D5D]" : "text-gray-900"}`}>
        {value}
      </span>
      <span className="mt-0.5 text-[11px] text-gray-400">{label}</span>
    </div>
  );
}

// ============================================================
// 파트 배지
// ============================================================

function PartVerdictBadge({ part }: { part: RawDiagnosisPart }) {
  const style = verdictStyle(part.verdict);
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${style.bg} ${style.border}`}>
      <span className={`text-xs font-medium ${style.text}`}>{part.part_name}</span>
      <span className="text-sm">{verdictEmoji(part.verdict)}</span>
    </div>
  );
}

// ============================================================
// 벤치마크 비교 (1~5등 동일 구조: 영상3 + 참여5 + 전환6)
// ============================================================

// METRIC_GROUPS 공통 상수에서 파생 (영상3 + 참여5 + 전환6 = 14개)

function BenchmarkCompareGrid({
  ad,
  diagnosis,
}: {
  ad: AdInsightRow;
  diagnosis?: RawDiagnosis;
}) {
  // T3: 진단 결과에서 metric key → {pct_of_benchmark, abs_benchmark, verdict} 맵 구축
  const diagMetricMap = new Map<string, { pct_of_benchmark: number | null; abs_benchmark: number | null; verdict: string }>();
  if (diagnosis) {
    for (const part of diagnosis.parts) {
      for (const m of part.metrics) {
        if (m.key) {
          diagMetricMap.set(m.key, {
            pct_of_benchmark: m.pct_of_benchmark,
            abs_benchmark: m.abs_benchmark,
            verdict: m.verdict,
          });
        }
      }
    }
  }

  function formatVal(v: number | null, m: CommonMetricDef): string {
    if (v == null) return "-";
    if (m.unit === "pct") return fmtCtr(v);
    if (m.unit === "per10k") return fmtDecimal(v);
    return fmtDecimal(v, 2);
  }

  function renderMetricRow(m: CommonMetricDef, isSummary?: boolean) {
    const myVal = ad[m.key as keyof AdInsightRow] as number | undefined | null;
    const diag = diagMetricMap.get(m.key);

    if (myVal == null) return null;

    const style = diag ? verdictStyle(diag.verdict) : { bg: "bg-gray-50", text: "text-gray-400", border: "border-gray-100" };
    const emoji = diag ? (diag.verdict.match(/[🟢🟡🔴]/u)?.[0] ?? "⚪") : "⚪";

    // T3: 기준값 계산 — abs_benchmark 직접 사용 우선, 없으면 pct_of_benchmark에서 역산
    const benchVal = diag?.abs_benchmark != null && diag.abs_benchmark > 0
      ? diag.abs_benchmark
      : (myVal != null && myVal > 0 && diag?.pct_of_benchmark != null && diag.pct_of_benchmark > 0
        ? (myVal / diag.pct_of_benchmark) * 100
        : null);

    return (
      <div
        key={m.key}
        className="flex items-center justify-between rounded-md bg-white/70 px-2 py-1.5"
      >
        <span className={`text-xs ${isSummary ? "font-semibold text-gray-700" : "text-gray-600"}`}>{m.label}</span>
        <div className="flex items-center gap-1.5">
          <span className={`${isSummary ? "text-sm font-bold" : "text-xs font-medium"} ${m.key === "roas" ? "" : style.text}`}>
            {formatVal(myVal ?? null, m)}
            {benchVal != null && m.key !== "roas" && (
              <span className="text-gray-400 ml-1 text-[10px]">(기준 {formatVal(benchVal, m)})</span>
            )}
          </span>
          {m.key !== "roas" && <span className="text-[10px]">{emoji}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {METRIC_GROUPS.map((group) => {
        const allMetrics = [...group.metrics, ...(group.summaryMetric ? [group.summaryMetric] : [])];
        const hasAnyData = allMetrics.some((m) => ad[m.key as keyof AdInsightRow] != null);
        if (!hasAnyData) return null;

        return (
          <div key={group.groupKey} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">{group.label}</span>
            </div>
            <div className="space-y-2">
              {group.metrics.map((m) => renderMetricRow(m))}
              {group.summaryMetric && (() => {
                const row = renderMetricRow(group.summaryMetric, true);
                if (!row) return null;
                return (
                  <>
                    <hr className="my-1 border-gray-200" />
                    {row}
                  </>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 개별 광고 카드
// ============================================================

function AdRankCard({
  ad,
  rank,
  accountId,
  mixpanelProjectId,
  mixpanelBoardId,
  diagnosis,
}: {
  ad: AdInsightRow;
  rank: number;
  accountId: string;
  mixpanelProjectId?: string | null;
  mixpanelBoardId?: string | null;
  diagnosis?: RawDiagnosis;
}) {
  const metaUrl = `https://adsmanager.facebook.com/adsmanager/manage/ads/insights?act=${accountId}&selected_ad_ids=${ad.ad_id}&nav_source=no_referrer`;
  const mixpanelUrl = mixpanelProjectId
    ? mixpanelBoardId
      ? `https://mixpanel.com/project/${mixpanelProjectId}/view/${mixpanelBoardId}/app/boards#persistent_filters=${encodeURIComponent(JSON.stringify([["utm_term", "=", [ad.ad_id]]]))}`
      : `https://mixpanel.com/project/${mixpanelProjectId}`
    : null;

  const parts = diagnosis?.parts ?? [];

  return (
    <div
      className="rounded-xl border border-[#F75D5D]/20 bg-white shadow-sm transition-all duration-200 hover:border-[#F75D5D]/30 hover:shadow-md"
    >
      {/* 헤더 */}
      <div className="w-full px-5 py-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-lg font-extrabold text-[#F75D5D]">#{rank}</span>
            <span className="truncate text-sm font-bold text-gray-900">
              {ad.ad_name || ad.ad_id}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <a
              href={metaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#1877f2] to-[#0d65d9] px-3 py-1.5 text-xs font-semibold text-white"
            >
              광고 통계
              <ExternalLink className="h-3 w-3" />
            </a>
            {mixpanelUrl && (
              <a
                href={mixpanelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] px-3 py-1.5 text-xs font-semibold text-white"
              >
                믹스패널
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 통계 행 */}
      <div className="grid grid-cols-5 gap-3 px-5 pb-4">
        <StatCell label="지출" value={fmtCurrency(ad.spend)} />
        <StatCell label="노출" value={fmtNum(ad.impressions)} />
        <StatCell label="클릭" value={fmtNum(ad.clicks)} />
        <StatCell label="CTR" value={fmtCtr(ad.ctr)} />
        <StatCell label="구매" value={fmtNum(ad.purchases)} highlight />
      </div>

      {/* 파트 판정 배지 */}
      {parts.length > 0 && (
        <div className="grid grid-cols-3 gap-3 px-5 pb-4">
          {parts.slice(0, 3).map((part) => (
            <PartVerdictBadge key={part.part_num} part={part} />
          ))}
        </div>
      )}

      {/* 지표 비교 (1~5등 동일 구조: 영상3 + 참여5 + 전환5) */}
      <div className="border-t border-gray-100 px-5 py-4">
        {diagnosis?.one_line_diagnosis && (
          <p className="mb-4 text-sm font-medium text-gray-600">
            {diagnosis.overall_verdict} {diagnosis.one_line_diagnosis}
          </p>
        )}
        <BenchmarkCompareGrid ad={ad} diagnosis={diagnosis} />
      </div>
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export function ContentRanking({
  insights,
  accountId,
  periodNum,
  mixpanelProjectId,
  mixpanelBoardId,
}: ContentRankingProps) {
  const top5 = getTop5Ads(insights);
  const [diagnoses, setDiagnoses] = useState<RawDiagnosis[] | null>(null);
  const [loadingDiagnosis, setLoadingDiagnosis] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);

  // 진단 API 호출 (insights 로드 완료 후)
  useEffect(() => {
    if (insights.length === 0 || !accountId) {
      setDiagnoses(null);
      return;
    }

    // dateRange 재계산 (insights의 최소/최대 날짜 사용)
    const dates = insights.map((r) => r.date).sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    (async () => {
      setLoadingDiagnosis(true);
      setDiagnosisError(null);
      try {
        const res = await fetch("/api/diagnose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            accountId,
            startDate,
            endDate,
          }),
        });

        if (!res.ok) {
          console.warn(`[ContentRanking] diagnose API ${res.status}`);
          if (res.status === 404) {
            setDiagnosisError("해당 기간에 데이터가 없습니다");
          } else {
            setDiagnosisError("진단 데이터를 불러올 수 없습니다");
          }
          return;
        }

        let json: { diagnoses?: RawDiagnosis[] };
        try {
          json = await res.json();
        } catch {
          console.warn("[ContentRanking] diagnose non-JSON response");
          setDiagnosisError("진단 데이터를 불러올 수 없습니다");
          return;
        }

        if (json.diagnoses) {
          setDiagnoses(json.diagnoses as RawDiagnosis[]);
        }
      } catch {
        setDiagnosisError("진단 데이터를 불러올 수 없습니다");
      } finally {
        setLoadingDiagnosis(false);
      }
    })();
  }, [insights, accountId]);

  // 진단 결과 맵
  const diagMap = new Map<string, RawDiagnosis>();
  if (diagnoses) {
    for (const d of diagnoses) {
      if (d.ad_id) diagMap.set(d.ad_id, d);
    }
  }

  if (insights.length === 0 || top5.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-100 bg-white py-20 text-gray-400">
        <p className="text-base font-medium">벤치마크 데이터 없음</p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      {/* 섹션 타이틀 */}
      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="text-base font-bold text-gray-900">콘텐츠 성과 순위</h2>
        <span className="text-xs text-gray-400">광고비 합산 기준 상위 5개</span>
      </div>

      {/* 진단 로딩 */}
      {loadingDiagnosis && (
        <div className="mb-4 space-y-3">
          <Skeleton className="h-[80px] w-full rounded-xl" />
          <Skeleton className="h-[80px] w-full rounded-xl" />
        </div>
      )}

      {/* 진단 에러 메시지 (벤치마크 비교는 계속 표시됨) */}
      {!loadingDiagnosis && diagnosisError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          {diagnosisError}
        </div>
      )}

      {/* 광고 카드 목록 */}
      <div className="flex flex-col gap-3">
        {top5.map((ad, index) => (
          <AdRankCard
            key={ad.ad_id}
            ad={ad}
            rank={index + 1}
            accountId={accountId}
            mixpanelProjectId={mixpanelProjectId}
            mixpanelBoardId={mixpanelBoardId}
            diagnosis={diagMap.get(ad.ad_id)}
          />
        ))}
      </div>

      {/* 범례 */}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
        <span>🟢 우수 (기준선 이상)</span>
        <span>🟡 보통 (기준선의 75% 이상)</span>
        <span>🔴 미달 (기준선의 75% 미만)</span>
      </div>
    </section>
  );
}
