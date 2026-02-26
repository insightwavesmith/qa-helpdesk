"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { AdInsightRow } from "./ad-metrics-table";
import { getTop5Ads } from "@/lib/protractor/aggregate";

// ============================================================
// 로컬 타입 정의
// ============================================================

interface RawDiagnosisMetric {
  name: string;
  my_value: number | null;
  above_avg: number | null;
  average_avg: number | null;
  verdict: string; // "🟢", "🟡", "🔴"
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

interface Top5AdCardsProps {
  insights: AdInsightRow[];
  accountId?: string;
  mixpanelProjectId?: string | null;
  mixpanelBoardId?: string | null;
  diagnoses?: RawDiagnosis[];
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
  return n.toLocaleString("ko-KR");
}

function fmtCtr(n: number | undefined | null): string {
  if (n == null) return "-";
  return n.toFixed(2) + "%";
}

function fmtRoas(n: number | undefined | null): string {
  if (n == null) return "-";
  return n.toFixed(2);
}

// ============================================================
// 판정 이모지 → 배지 스타일 매핑
// ============================================================

function verdictBadgeStyle(verdict: string): { bg: string; text: string; border: string } {
  if (verdict.includes("🟢")) return { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" };
  if (verdict.includes("🟡")) return { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" };
  if (verdict.includes("🔴")) return { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" };
  return { bg: "bg-gray-50", text: "text-gray-500", border: "border-gray-200" };
}

// ============================================================
// 통계 미니카드
// ============================================================

function StatCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-2 py-2">
      <span
        className={`text-sm font-bold ${
          highlight ? "text-[#F75D5D]" : "text-gray-900"
        }`}
      >
        {value}
      </span>
      <span className="mt-0.5 text-[11px] text-gray-400">{label}</span>
    </div>
  );
}

// ============================================================
// 진단 파트 배지
// ============================================================

function PartVerdictBadge({ part }: { part: RawDiagnosisPart }) {
  const style = verdictBadgeStyle(part.verdict);
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${style.bg} ${style.border}`}
    >
      <span className={`text-xs font-medium ${style.text}`}>{part.part_name}</span>
      <span className="text-sm">{part.verdict.match(/[🟢🟡🔴]/u)?.[0] ?? part.verdict}</span>
    </div>
  );
}

// ============================================================
// 진단 상세 — 파트별 메트릭 테이블
// ============================================================

function DiagnosisDetail({ parts }: { parts: RawDiagnosisPart[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {parts.map((part) => {
        const style = verdictBadgeStyle(part.verdict);
        return (
          <div
            key={part.part_num}
            className={`rounded-xl border ${style.border} ${style.bg} p-4`}
          >
            {/* 파트 헤더 */}
            <div className="mb-3 flex items-center justify-between">
              <span className={`text-sm font-bold ${style.text}`}>
                {part.part_name}
              </span>
              <span className="text-base">
                {part.verdict.match(/[🟢🟡🔴]/u)?.[0] ?? part.verdict}
              </span>
            </div>

            {/* 메트릭 목록 */}
            <div className="space-y-2">
              {part.metrics.map((metric) => {
                const mStyle = verdictBadgeStyle(metric.verdict);
                const isRoas = metric.name.toLowerCase().includes("roas");
                return (
                  <div
                    key={metric.name}
                    className="flex items-center justify-between rounded-md bg-white/70 px-2 py-1.5"
                  >
                    <span className="text-xs text-gray-600">{metric.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`${isRoas ? "text-sm font-bold" : "text-xs font-medium"} ${mStyle.text}`}
                      >
                        {metric.my_value != null
                          ? isRoas
                            ? fmtRoas(metric.my_value)
                            : metric.name.toLowerCase().includes("rate") ||
                              metric.name.toLowerCase().includes("ctr")
                            ? fmtCtr(metric.my_value)
                            : fmtNum(metric.my_value)
                          : "-"}
                      </span>
                      <span className="text-[10px]">
                        {metric.verdict.match(/[🟢🟡🔴]/u)?.[0] ?? metric.verdict}
                      </span>
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

function AdCard({
  ad,
  rank,
  isExpanded,
  onToggle,
  accountId,
  mixpanelProjectId,
  mixpanelBoardId,
  diagnosis,
}: {
  ad: AdInsightRow;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
  accountId?: string;
  mixpanelProjectId?: string | null;
  mixpanelBoardId?: string | null;
  diagnosis?: RawDiagnosis;
}) {
  const metaUrl = `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${accountId}&selected_ad_ids=${ad.ad_id}`;
  const mixpanelUrl =
    mixpanelProjectId && mixpanelBoardId
      ? `https://mixpanel.com/project/${mixpanelProjectId}/view/${mixpanelBoardId}/app/boards`
      : null;

  // 파트 3개: 기반점수, 참여율, 전환율 (없으면 빈 배열)
  const parts = diagnosis?.parts ?? [];

  return (
    <div
      className={`rounded-xl border bg-white transition-all duration-200 hover:border-[#F75D5D]/30 hover:shadow-md ${
        isExpanded ? "border-[#F75D5D]/20 shadow-sm" : "border-gray-100 shadow-sm"
      }`}
    >
      {/* 카드 헤더 클릭 영역 */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 text-left"
        aria-expanded={isExpanded}
      >
        <div className="flex items-start justify-between gap-3">
          {/* 좌: 순위 + 광고명 */}
          <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-lg font-extrabold text-[#F75D5D]">
              #{rank}
            </span>
            <span className="truncate font-bold text-gray-900 text-sm">
              {ad.ad_name || ad.ad_id}
            </span>
          </div>

          {/* 우: 링크 버튼들 + 확장 아이콘 */}
          <div className="flex shrink-0 items-center gap-2">
            {accountId && (
              <a
                href={metaUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#1877f2] to-[#0d65d9] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Meta
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {mixpanelUrl && (
              <a
                href={mixpanelUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Mixpanel
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <span className="ml-1 text-gray-400">
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </span>
          </div>
        </div>
      </button>

      {/* 통계 행 */}
      <div className="grid grid-cols-5 gap-3 px-5 pb-4">
        <StatCell label="지출" value={fmtCurrency(ad.spend)} />
        <StatCell label="노출" value={fmtNum(ad.impressions)} />
        <StatCell label="클릭" value={fmtNum(ad.clicks)} />
        <StatCell label="CTR" value={fmtCtr(ad.ctr)} />
        <StatCell label="구매" value={fmtNum(ad.purchases)} highlight />
      </div>

      {/* 판정 배지 행 (최대 3개 파트) */}
      {parts.length > 0 && (
        <div className="grid grid-cols-3 gap-3 px-5 pb-4">
          {parts.slice(0, 3).map((part) => (
            <PartVerdictBadge key={part.part_num} part={part} />
          ))}
        </div>
      )}

      {/* 확장 시: 진단 상세 */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-5 py-4">
          {diagnosis ? (
            <>
              {/* 한 줄 진단 */}
              {diagnosis.one_line_diagnosis && (
                <p className="mb-4 text-sm text-gray-600 font-medium">
                  {diagnosis.overall_verdict}{" "}
                  {diagnosis.one_line_diagnosis}
                </p>
              )}
              {/* 3컬럼 상세 */}
              {parts.length > 0 ? (
                <DiagnosisDetail parts={parts} />
              ) : (
                <p className="text-sm text-gray-400">진단 파트 데이터 없음</p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">진단 데이터 없음</p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export function Top5AdCards({
  insights,
  accountId,
  mixpanelProjectId,
  mixpanelBoardId,
  diagnoses,
}: Top5AdCardsProps) {
  const top5 = getTop5Ads(insights);

  // 첫 번째 카드는 기본 확장 상태
  const [expandedId, setExpandedId] = useState<string | null>(
    top5.length > 0 ? top5[0].ad_id : null
  );

  // 진단 결과 맵
  const diagMap = new Map<string, RawDiagnosis>();
  if (diagnoses) {
    for (const d of diagnoses) diagMap.set(d.ad_id, d);
  }

  // 빈 상태
  if (insights.length === 0 || top5.length === 0) {
    return (
      <section>
        <div className="mb-4 flex items-baseline gap-2">
          <h2 className="text-base font-bold text-gray-900">TOP 5 광고</h2>
          <span className="text-xs text-gray-400">광고비 합산 기준</span>
        </div>
        <div className="flex items-center justify-center rounded-xl border border-gray-100 bg-white py-16 text-sm text-gray-400">
          광고 데이터가 없습니다
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      {/* 섹션 타이틀 */}
      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="text-base font-bold text-gray-900">TOP 5 광고</h2>
        <span className="text-xs text-gray-400">광고비 합산 기준</span>
      </div>

      {/* 카드 목록 */}
      <div className="flex flex-col gap-3">
        {top5.map((ad, index) => (
          <AdCard
            key={ad.ad_id}
            ad={ad}
            rank={index + 1}
            isExpanded={expandedId === ad.ad_id}
            onToggle={() =>
              setExpandedId((prev) => (prev === ad.ad_id ? null : ad.ad_id))
            }
            accountId={accountId}
            mixpanelProjectId={mixpanelProjectId}
            mixpanelBoardId={mixpanelBoardId}
            diagnosis={diagMap.get(ad.ad_id)}
          />
        ))}
      </div>

      {/* 범례 */}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
        <span>🟢 우수 (p75 이상)</span>
        <span>🟡 보통 (p50~p75)</span>
        <span>🔴 미달 (p50 미만)</span>
      </div>
    </section>
  );
}
