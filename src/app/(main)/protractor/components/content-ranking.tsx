"use client";

import { useState, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdInsightRow, BenchmarkRow } from "./ad-metrics-table";
import { getTop5Ads } from "@/lib/protractor/aggregate";
import { findAboveAvg } from "./utils";

// ============================================================
// 타입 정의
// ============================================================

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

export interface ContentRankingProps {
  insights: AdInsightRow[];
  benchmarks: BenchmarkRow[];
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

// 값 기준 판정 (aboveAvg 기준)
function calcVerdictStyle(
  value: number | null,
  aboveAvg: number | null
): { bg: string; text: string; border: string } {
  if (value == null || aboveAvg == null || aboveAvg === 0) {
    return { bg: "bg-gray-50", text: "text-gray-400", border: "border-gray-100" };
  }
  if (value >= aboveAvg) return { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" };
  if (value >= aboveAvg * 0.75) return { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" };
  return { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" };
}

function calcVerdictEmoji(value: number | null, aboveAvg: number | null): string {
  if (value == null || aboveAvg == null || aboveAvg === 0) return "⚪";
  if (value >= aboveAvg) return "🟢";
  if (value >= aboveAvg * 0.75) return "🟡";
  return "🔴";
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
// 진단 상세 — 3컬럼 파트별 메트릭
// ============================================================

interface DiagnosisDetailProps {
  parts: RawDiagnosisPart[];
  ad: AdInsightRow;
  periodNum: number;
  engAbove: BenchmarkRow | undefined;
}

// 참여 지표 실제 개수 환산
function formatEngagementValue(
  metricKey: string,
  myValue: number | null,
  aboveValue: number | null,
  impressions: number,
  periodNum: number
): { my: string; above: string } {
  const engagementKeys = ["reactions", "comments", "shares", "saves", "engagement"];
  const isEngagement = engagementKeys.some((k) => metricKey.toLowerCase().includes(k));

  if (!isEngagement || myValue == null) {
    return {
      my: myValue != null ? fmtDecimal(myValue) : "-",
      above: aboveValue != null ? fmtDecimal(aboveValue) : "-",
    };
  }

  if (periodNum === 1) {
    // 어제: 실제 개수 환산
    const myActual = Math.round(myValue * (impressions / 10000));
    const aboveActual = aboveValue != null ? Math.round(aboveValue * (impressions / 10000)) : null;
    return {
      my: `${myActual.toLocaleString("ko-KR")}개`,
      above: aboveActual != null ? `${aboveActual.toLocaleString("ko-KR")}개` : "-",
    };
  } else {
    // 기간: per_10k 그대로
    return {
      my: fmtDecimal(myValue),
      above: aboveValue != null ? fmtDecimal(aboveValue) : "-",
    };
  }
}

function DiagnosisDetail({ parts, ad, periodNum, engAbove }: DiagnosisDetailProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {parts.map((part) => {
        const pStyle = verdictStyle(part.verdict);
        return (
          <div key={part.part_num} className={`rounded-xl border ${pStyle.border} ${pStyle.bg} p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <span className={`text-sm font-bold ${pStyle.text}`}>{part.part_name}</span>
              <span className="text-base">{verdictEmoji(part.verdict)}</span>
            </div>

            <div className="space-y-2">
              {part.metrics.map((metric) => {
                const mStyle = verdictStyle(metric.verdict);
                const isRoas = metric.name.toLowerCase().includes("roas");
                const isCtr = metric.name.toLowerCase().includes("ctr") || metric.name.toLowerCase().includes("rate");

                // 참여 지표 환산
                const engFormatted = formatEngagementValue(
                  metric.name,
                  metric.my_value,
                  metric.above_avg,
                  ad.impressions,
                  periodNum
                );

                const isEngMetric =
                  ["reactions", "comments", "shares", "saves", "engagement"].some((k) =>
                    metric.name.toLowerCase().includes(k)
                  );

                let myDisplay: string;
                let aboveDisplay: string;

                if (isEngMetric) {
                  myDisplay = engFormatted.my;
                  aboveDisplay = engFormatted.above;
                } else if (metric.my_value != null) {
                  myDisplay = isRoas
                    ? fmtDecimal(metric.my_value, 2)
                    : isCtr
                    ? fmtCtr(metric.my_value)
                    : fmtDecimal(metric.my_value);
                  aboveDisplay = metric.above_avg != null
                    ? isRoas
                      ? fmtDecimal(metric.above_avg, 2)
                      : isCtr
                      ? fmtCtr(metric.above_avg)
                      : fmtDecimal(metric.above_avg)
                    : "-";
                } else {
                  myDisplay = "-";
                  aboveDisplay = "-";
                }

                // 참여지표의 above 계산 (벤치마크 기반)
                const aboveAvgBenchVal = engAbove
                  ? (engAbove[`avg_${metric.name.toLowerCase().replace(/\s+/g, "_")}_per_10k`] as number | undefined)
                  : undefined;

                const finalAboveDisplay = isEngMetric && aboveAvgBenchVal != null
                  ? periodNum === 1
                    ? `${Math.round(aboveAvgBenchVal * (ad.impressions / 10000)).toLocaleString("ko-KR")}개`
                    : fmtDecimal(aboveAvgBenchVal)
                  : aboveDisplay;

                return (
                  <div
                    key={metric.name}
                    className="flex items-center justify-between rounded-md bg-white/70 px-2 py-1.5"
                  >
                    <span className="text-xs text-gray-600">{metric.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-medium ${mStyle.text}`}>
                        {myDisplay}
                        {finalAboveDisplay !== "-" && (
                          <span className="text-gray-400"> / {finalAboveDisplay}</span>
                        )}
                      </span>
                      <span className="text-[10px]">{verdictEmoji(metric.verdict)}</span>
                    </div>
                  </div>
                );
              })}
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

// ============================================================
// 벤치마크 비교 (진단 없을 때 fallback)
// ============================================================

interface BenchMetric {
  label: string;
  adKey: keyof AdInsightRow;
  benchKey: string;
  benchSource: "eng" | "conv";
  format: "pct" | "decimal" | "per10k";
}

const BENCH_METRICS: { part: string; metrics: BenchMetric[] }[] = [
  {
    part: "기반점수",
    metrics: [
      { label: "3초 시청률", adKey: "video_p3s_rate", benchKey: "avg_video_p3s_rate", benchSource: "eng", format: "pct" },
      { label: "ThruPlay률", adKey: "thruplay_rate", benchKey: "avg_thruplay_rate", benchSource: "eng", format: "pct" },
      { label: "유지율", adKey: "retention_rate", benchKey: "avg_retention_rate", benchSource: "eng", format: "pct" },
    ],
  },
  {
    part: "참여율",
    metrics: [
      { label: "반응", adKey: "reactions_per_10k", benchKey: "avg_reactions_per_10k", benchSource: "eng", format: "per10k" },
      { label: "댓글", adKey: "comments_per_10k", benchKey: "avg_comments_per_10k", benchSource: "eng", format: "per10k" },
      { label: "공유", adKey: "shares_per_10k", benchKey: "avg_shares_per_10k", benchSource: "eng", format: "per10k" },
      { label: "저장", adKey: "saves_per_10k", benchKey: "avg_saves_per_10k", benchSource: "eng", format: "per10k" },
    ],
  },
  {
    part: "전환율",
    metrics: [
      { label: "CTR", adKey: "ctr", benchKey: "avg_ctr", benchSource: "conv", format: "pct" },
      { label: "클릭→구매", adKey: "click_to_purchase_rate", benchKey: "avg_click_to_purchase_rate", benchSource: "conv", format: "pct" },
      { label: "ROAS", adKey: "roas", benchKey: "avg_roas", benchSource: "conv", format: "decimal" },
    ],
  },
];

function BenchmarkCompareGrid({
  ad,
  engAbove,
  convAbove,
}: {
  ad: AdInsightRow;
  engAbove: BenchmarkRow | undefined;
  convAbove: BenchmarkRow | undefined;
}) {
  if (!engAbove && !convAbove) {
    return <p className="text-sm text-gray-400">벤치마크 데이터 없음</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {BENCH_METRICS.map((group) => {
        const hasAnyData = group.metrics.some((m) => {
          const bench = m.benchSource === "eng" ? engAbove : convAbove;
          return ad[m.adKey] != null || (bench && bench[m.benchKey] != null);
        });
        if (!hasAnyData) return null;

        return (
          <div key={group.part} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">{group.part}</span>
            </div>
            <div className="space-y-2">
              {group.metrics.map((m) => {
                const myVal = ad[m.adKey] as number | undefined | null;
                const bench = m.benchSource === "eng" ? engAbove : convAbove;
                const benchVal = bench ? (bench[m.benchKey] as number | undefined) : undefined;

                if (myVal == null && benchVal == null) return null;

                const style = calcVerdictStyle(myVal ?? null, benchVal ?? null);
                const emoji = calcVerdictEmoji(myVal ?? null, benchVal ?? null);

                const myDisplay =
                  myVal == null ? "-"
                    : m.format === "pct" ? fmtCtr(myVal)
                    : m.format === "per10k" ? fmtDecimal(myVal)
                    : fmtDecimal(myVal, 2);

                const benchDisplay =
                  benchVal == null ? "-"
                    : m.format === "pct" ? fmtCtr(benchVal)
                    : m.format === "per10k" ? fmtDecimal(benchVal)
                    : fmtDecimal(benchVal, 2);

                return (
                  <div
                    key={m.label}
                    className="flex items-center justify-between rounded-md bg-white/70 px-2 py-1.5"
                  >
                    <span className="text-xs text-gray-600">{m.label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-medium ${style.text}`}>
                        {myDisplay}
                        {benchDisplay !== "-" && (
                          <span className="text-gray-400"> / {benchDisplay}</span>
                        )}
                      </span>
                      <span className="text-[10px]">{emoji}</span>
                    </div>
                  </div>
                );
              })}
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
  periodNum,
  engAbove,
  convAbove,
}: {
  ad: AdInsightRow;
  rank: number;
  accountId: string;
  mixpanelProjectId?: string | null;
  mixpanelBoardId?: string | null;
  diagnosis?: RawDiagnosis;
  periodNum: number;
  engAbove: BenchmarkRow | undefined;
  convAbove: BenchmarkRow | undefined;
}) {
  const metaUrl = `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${accountId}&selected_ad_ids=${ad.ad_id}`;
  const mixpanelUrl = mixpanelProjectId
    ? mixpanelBoardId
      ? `https://mixpanel.com/project/${mixpanelProjectId}/view/${mixpanelBoardId}/app/boards`
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

      {/* 진단 상세 (항상 펼침) */}
      <div className="border-t border-gray-100 px-5 py-4">
        {diagnosis ? (
          <>
            {diagnosis.one_line_diagnosis && (
              <p className="mb-4 text-sm font-medium text-gray-600">
                {diagnosis.overall_verdict} {diagnosis.one_line_diagnosis}
              </p>
            )}
            {parts.length > 0 ? (
              <DiagnosisDetail
                parts={parts}
                ad={ad}
                periodNum={periodNum}
                engAbove={engAbove}
              />
            ) : (
              <BenchmarkCompareGrid ad={ad} engAbove={engAbove} convAbove={convAbove} />
            )}
          </>
        ) : (
          <BenchmarkCompareGrid ad={ad} engAbove={engAbove} convAbove={convAbove} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export function ContentRanking({
  insights,
  benchmarks,
  accountId,
  periodNum,
  mixpanelProjectId,
  mixpanelBoardId,
}: ContentRankingProps) {
  const top5 = getTop5Ads(insights);
  const [diagnoses, setDiagnoses] = useState<RawDiagnosis[] | null>(null);
  const [loadingDiagnosis, setLoadingDiagnosis] = useState(false);

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
          return;
        }

        let json: { diagnoses?: RawDiagnosis[] };
        try {
          json = await res.json();
        } catch {
          console.warn("[ContentRanking] diagnose non-JSON response");
          return;
        }

        if (json.diagnoses) {
          setDiagnoses(json.diagnoses as RawDiagnosis[]);
        }
      } catch {
        // 진단 실패해도 카드는 표시
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

  // ABOVE_AVERAGE 벤치마크
  const engAbove = findAboveAvg(benchmarks, "engagement");
  const convAbove = findAboveAvg(benchmarks, "conversion");

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
            periodNum={periodNum}
            engAbove={engAbove}
            convAbove={convAbove}
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
