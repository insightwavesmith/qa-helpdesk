"use client";

import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Info } from "lucide-react";

// ── T3 API 응답 타입 (real-dashboard와 공유) ──

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

interface T3Data {
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

interface TotalValueGaugeProps {
  data: T3Data | null;
  isLoading?: boolean;
  showMetricCards?: boolean; // default: true (하위 호환)
  errorMessage?: string | null; // T7: 에러 메시지
}

// ── 등급 배지 스타일 (목업 기준) ──

const GRADE_BADGE_STYLES: Record<string, string> = {
  A: "bg-green-100 text-green-700",
  B: "bg-yellow-100 text-yellow-700",
  C: "bg-red-100 text-red-700",
  D: "bg-orange-100 text-orange-700",
  F: "bg-red-100 text-red-700",
};

// ── 서브점수 카드 부제목 ──

const PART_SUB_LABELS: Record<string, string> = {
  "기반점수": "노출·도달·빈도 기반",
  "참여율": "3초시청·좋아요·공유 등",
  "전환율": "CTR·구매·ROAS",
};

// ── T6: 반원형 SVG 게이지 (목업 일치) ──

function SemiCircleGauge({ score }: { score: number }) {
  const cx = 100;
  const cy = 100;
  const r = 80;
  const angle = Math.PI - (score / 100) * Math.PI;
  const dotX = cx + r * Math.cos(angle);
  const dotY = cy - r * Math.sin(angle);

  return (
    <svg viewBox="0 0 200 120" className="w-[180px] h-[110px]">
      {/* 배경 회색 호 */}
      <path
        d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none" stroke="#e2e8f0" strokeWidth={16} strokeLinecap="round"
      />
      {/* 빨강 구간 (D등급: 0~33%) */}
      <path
        d="M 20 100 A 80 80 0 0 1 60 35"
        fill="none" stroke="#ef4444" strokeWidth={16} strokeLinecap="round"
      />
      {/* 노랑 구간 (C/B등급: 33~67%) */}
      <path
        d="M 60 35 A 80 80 0 0 1 140 35"
        fill="none" stroke="#eab308" strokeWidth={16} strokeLinecap="round"
      />
      {/* 초록 구간 (A등급: 67~100%) */}
      <path
        d="M 140 35 A 80 80 0 0 1 180 100"
        fill="none" stroke="#22c55e" strokeWidth={16} strokeLinecap="round"
      />
      {/* 포인터: 호 위 도트 */}
      <circle cx={dotX} cy={dotY} r={6} fill="#1e293b" />
    </svg>
  );
}

// ── 점수 → 등급 변환 ──

function scoreToGrade(score: number): string {
  if (score >= 75) return "A";
  if (score >= 50) return "B";
  return "C";
}

// ── T6: 서브점수 카드 (목업 기준) ──

function GradeCard({ label, subLabel, score, dotColor }: {
  label: string;
  subLabel: string;
  score: number;
  dotColor: string;
}) {
  const grade = scoreToGrade(score);
  const badgeStyle = GRADE_BADGE_STYLES[grade] ?? GRADE_BADGE_STYLES.C;

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex justify-between items-center">
      <div className="flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
        <div>
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <p className="text-xs text-gray-400 mt-0.5">{subLabel}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-extrabold text-gray-900">{score}</p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeStyle}`}>{grade}</span>
      </div>
    </div>
  );
}

// ── 포맷 헬퍼 ──

function fmtCurrency(n: number): string {
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

// ── 메인 컴포넌트 ──

export function TotalValueGauge({ data, isLoading, showMetricCards = true, errorMessage }: TotalValueGaugeProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="ml-2 text-sm text-muted-foreground">T3 점수 계산 중...</span>
        </CardContent>
      </Card>
    );
  }

  // T7: 에러 메시지 표시
  if (!data && errorMessage) {
    return (
      <Card className="bg-white border border-gray-200">
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <AlertTriangle className="h-6 w-6 mb-2 text-red-400" />
          <p className="text-sm font-medium text-red-600">{errorMessage}</p>
          <p className="text-xs mt-1">기간을 변경하거나 새로고침해 주세요</p>
        </CardContent>
      </Card>
    );
  }

  // 데이터 완전 없음 — 게이지 렌더링 자체 불가
  if (!data) {
    return (
      <Card className="bg-white border border-gray-200">
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <AlertTriangle className="h-6 w-6 mb-2" />
          <p className="text-sm">데이터가 없습니다</p>
          <p className="text-xs mt-1">기간을 변경하거나 새로고침해 주세요</p>
        </CardContent>
      </Card>
    );
  }

  // 벤치마크/점수 없어도 게이지는 표시 (0점 F등급 fallback)
  const noBenchmark = data.hasBenchmarkData === false;
  const noScore = data.score == null || !data.grade;

  const displayScore = data.score ?? 0;
  const displayGrade = data.grade ?? { grade: "F" as const, label: "벤치마크 설정 필요" };
  const gradeBadgeStyle = GRADE_BADGE_STYLES[displayGrade.grade] ?? GRADE_BADGE_STYLES.F;

  const { diagnostics, summary, period, dataAvailableDays } = data;

  // 기간 라벨
  const periodLabel = period
    ? (dataAvailableDays < period
      ? `${dataAvailableDays}일치 데이터 기준 · 전체 광고 합산`
      : `${period}일 기준 · 전체 광고 합산`)
    : "전체 광고 합산";

  return (
    <Card className="bg-white border border-gray-200">
      <CardContent className="p-5">
        {/* 벤치마크 미설정 안내 배너 */}
        {(noBenchmark || noScore) && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
            <Info className="h-4 w-4 shrink-0" />
            <p>
              {noBenchmark
                ? "벤치마크 데이터가 없어 점수를 계산할 수 없습니다. 관리자에게 벤치마크 수집을 요청하세요."
                : "데이터가 부족합니다. 기간을 변경하거나 새로고침해 주세요."}
            </p>
          </div>
        )}

        {/* T6: 게이지 + 서브점수 카드 레이아웃 (목업 일치) */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* 좌측: 게이지 카드 */}
          <div className="flex-shrink-0 flex flex-col items-center bg-white rounded-2xl border border-gray-200 p-6" style={{ minWidth: "220px" }}>
            <SemiCircleGauge score={displayScore} />
            {/* T7: 벤치마크 없으면 점수 대신 "-" 표시 */}
            {noBenchmark ? (
              <div className="text-5xl font-black text-gray-300 -mt-2.5">-</div>
            ) : (
              <div className="text-5xl font-black -mt-2.5">{displayScore}</div>
            )}
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold mt-1 ${gradeBadgeStyle}`}>
              {displayGrade.grade}등급
            </span>
            <p className="text-xs text-gray-400 mt-2">{periodLabel}</p>

            {/* 데이터 부족 안내 */}
            {period > 0 && dataAvailableDays < period && (
              <div className="mt-2 flex items-center gap-1 text-[11px] text-amber-600">
                <Info className="h-3 w-3" />
                <span>{period}일 중 {dataAvailableDays}일 데이터</span>
              </div>
            )}

            {summary && (
              <p className="mt-2 text-sm font-bold text-gray-900">
                총 광고비 {fmtCurrency(summary.spend)}
              </p>
            )}
          </div>

          {/* 우측: 서브점수 카드 3개 (T6: 목업 기준 독립 카드) */}
          {!!diagnostics && (
            <div className="flex-1 flex flex-col gap-3">
              {Object.values(diagnostics).map((part) => {
                const dotColor = part.score >= 75 ? "#22c55e" : part.score >= 50 ? "#eab308" : "#ef4444";
                return (
                  <GradeCard
                    key={part.label}
                    label={part.label}
                    subLabel={PART_SUB_LABELS[part.label] ?? ""}
                    score={part.score}
                    dotColor={dotColor}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* 지표 카드 (3×3 그리드) — showMetricCards에 따라 표시/숨김 */}
        {showMetricCards && (
          <div className="grid grid-cols-3 gap-3 mt-6">
            {data.metrics.map((m) => {
              const barColor = m.score != null
                ? m.score >= 75 ? "bg-green-500" : m.score >= 50 ? "bg-yellow-500" : "bg-red-500"
                : "bg-gray-300";
              const textColor = m.score != null
                ? m.score >= 75 ? "text-green-600" : m.score >= 50 ? "text-yellow-600" : "text-red-600"
                : "text-gray-400";
              const statusLabel = m.score != null
                ? m.score >= 75 ? "우수" : m.score >= 50 ? "보통" : "미달"
                : "데이터 없음";
              const barW = m.pctOfBenchmark != null
                ? Math.min(Math.max(m.pctOfBenchmark, 5), 100)
                : m.score != null ? Math.max(m.score, 5) : 0;
              const fmtVal = m.value != null
                ? m.unit === "%" ? m.value.toFixed(2) + "%" : m.value.toFixed(1)
                : "-";

              return (
                <div key={m.key} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{m.name}</span>
                    <span className="flex items-center gap-1 text-xs">
                      <span>{m.status}</span>
                      <span className={textColor}>{statusLabel}</span>
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className={`text-lg font-bold ${textColor}`}>{fmtVal}</span>
                  </div>
                  <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`absolute left-0 top-0 h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${Math.min(barW, 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>{m.pctOfBenchmark != null ? `기준 대비 ${m.pctOfBenchmark}%` : "-"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
