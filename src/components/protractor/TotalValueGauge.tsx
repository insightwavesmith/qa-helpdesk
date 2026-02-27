"use client";

import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Info } from "lucide-react";

// ── T3 API 응답 타입 (real-dashboard와 공유) ──

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
}

// ── 등급별 스타일 ──

const GRADE_STYLES: Record<string, { border: string; text: string; bg: string; hex: string }> = {
  A: { border: "border-emerald-400", text: "text-emerald-500", bg: "bg-emerald-50", hex: "#10b981" },
  B: { border: "border-blue-400", text: "text-blue-500", bg: "bg-blue-50", hex: "#3b82f6" },
  C: { border: "border-yellow-400", text: "text-yellow-500", bg: "bg-yellow-50", hex: "#eab308" },
  D: { border: "border-orange-400", text: "text-orange-500", bg: "bg-orange-50", hex: "#f97316" },
  F: { border: "border-red-400", text: "text-red-500", bg: "bg-red-50", hex: "#ef4444" },
};

// ── 반원형 SVG 게이지 ──

function SemiCircleGauge({ score, grade, gradeStyle }: {
  score: number;
  grade: string;
  gradeStyle: { hex: string; text: string };
}) {
  const cx = 120;
  const cy = 110;
  const r = 85;
  const strokeWidth = 14;
  const startAngle = Math.PI;

  function arcPath(startDeg: number, endDeg: number): string {
    const x1 = cx + r * Math.cos(startDeg);
    const y1 = cy - r * Math.sin(startDeg);
    const x2 = cx + r * Math.cos(endDeg);
    const y2 = cy - r * Math.sin(endDeg);
    const sweep = endDeg < startDeg ? 0 : 1;
    return `M ${x1} ${y1} A ${r} ${r} 0 0 ${sweep} ${x2} ${y2}`;
  }

  const segments = [
    { start: Math.PI, end: Math.PI * 0.667, color: "#fca5a5" },
    { start: Math.PI * 0.667, end: Math.PI * 0.333, color: "#fde68a" },
    { start: Math.PI * 0.333, end: 0, color: "#86efac" },
  ];

  const needleAngle = Math.PI - (score / 100) * Math.PI;
  const needleLen = r - 10;
  const nx = cx + needleLen * Math.cos(needleAngle);
  const ny = cy - needleLen * Math.sin(needleAngle);

  return (
    <svg viewBox="0 0 240 140" className="w-full max-w-[220px]">
      {segments.map((seg, i) => (
        <path
          key={i}
          d={arcPath(seg.start, seg.end)}
          fill="none"
          stroke={seg.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      ))}
      {score > 0 && (
        <path
          d={arcPath(startAngle, startAngle - (score / 100) * Math.PI)}
          fill="none"
          stroke={gradeStyle.hex}
          strokeWidth={strokeWidth + 2}
          strokeLinecap="round"
          opacity={0.7}
        />
      )}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#374151" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={5} fill="#374151" />
      <text x={cx} y={cy + 25} textAnchor="middle" fill="#111827" fontSize="26" fontWeight="900">{score}</text>
      <text x={cx} y={cy + 42} textAnchor="middle" fill={gradeStyle.hex} fontSize="13" fontWeight="700">{grade}등급</text>
      <text x={cx - r - 2} y={cy + 16} textAnchor="middle" fill="#9ca3af" fontSize="10">0</text>
      <text x={cx} y={cy - r + 4} textAnchor="middle" fill="#9ca3af" fontSize="10">50</text>
      <text x={cx + r + 2} y={cy + 16} textAnchor="middle" fill="#9ca3af" fontSize="10">100</text>
    </svg>
  );
}

// ── 파트 점수 바 ──

function PartScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
  const textColor = score >= 75 ? "text-emerald-600" : score >= 50 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-xs text-gray-500 text-right">{label}</span>
      <div className="relative flex-1 h-2 rounded-full bg-gray-100">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className={`w-8 text-xs font-bold ${textColor}`}>{score}</span>
    </div>
  );
}

// ── 포맷 헬퍼 ──

function fmtCurrency(n: number): string {
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

// ── 메인 컴포넌트 ──

export function TotalValueGauge({ data, isLoading }: TotalValueGaugeProps) {
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

  // 벤치마크 데이터 없음
  if (data && data.hasBenchmarkData === false) {
    return (
      <Card className="bg-white border border-gray-200">
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Info className="h-6 w-6 mb-2" />
          <p className="text-sm font-medium">벤치마크 데이터 없음</p>
          <p className="text-xs mt-1">벤치마크 관리 탭에서 수집하세요.</p>
        </CardContent>
      </Card>
    );
  }

  // 데이터 없음
  if (!data || data.score == null || !data.grade) {
    return (
      <Card className="bg-white border border-gray-200">
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <AlertTriangle className="h-6 w-6 mb-2" />
          <p className="text-sm">{data?.message || "데이터를 불러올 수 없습니다"}</p>
          <p className="text-xs mt-1">기간을 변경하거나 다시 시도해 주세요</p>
        </CardContent>
      </Card>
    );
  }

  const { score, grade, diagnostics, summary, period, dataAvailableDays } = data;
  const gradeStyle = GRADE_STYLES[grade.grade] ?? GRADE_STYLES.C;

  // 기간 라벨
  const periodLabel = dataAvailableDays < period
    ? `${dataAvailableDays}일치 데이터 기준`
    : `${period}일 기준`;

  return (
    <Card className="bg-white border border-gray-200">
      <CardContent className="p-5">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* 좌측: 게이지 + 요약 */}
          <div className="flex-shrink-0 flex flex-col items-center" style={{ minWidth: "220px" }}>
            <SemiCircleGauge score={score} grade={grade.grade} gradeStyle={gradeStyle} />
            <p className={`-mt-1 text-sm font-semibold ${gradeStyle.text}`}>{grade.label}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{periodLabel}</p>

            {/* 데이터 부족 안내 */}
            {dataAvailableDays < period && (
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
            <p className="mt-0.5 text-[10px] text-muted-foreground">전체 광고 합산 기준</p>

            {/* 파트 점수 바 */}
            {diagnostics && (
              <div className="mt-4 w-full space-y-1.5">
                {Object.values(diagnostics).map((part) => (
                  <PartScoreBar key={part.label} label={part.label} score={part.score} />
                ))}
              </div>
            )}
          </div>

          {/* 우측: 지표 카드 (3×3 그리드) */}
          <div className="grid flex-1 grid-cols-3 gap-3">
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
              const barW = m.score != null ? Math.max(m.score, 5) : 0;
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
                    {m.score != null && (
                      <span className="text-[10px] text-gray-400">{m.score}점</span>
                    )}
                  </div>
                  <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`absolute left-0 top-0 h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${Math.min(barW, 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>기준선: {m.aboveAvg != null ? (m.unit === "%" ? m.aboveAvg.toFixed(2) + "%" : m.aboveAvg.toFixed(1)) : "-"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
