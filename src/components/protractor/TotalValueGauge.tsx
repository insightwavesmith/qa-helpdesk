"use client";

import { Card, CardContent } from "@/components/ui/card";

interface MetricData {
  name: string;
  value: number | null;
  p50: number | null;
  p75: number | null;
  status: string; // 🟢🟡🔴⚪
}

interface TotalValueGaugeProps {
  grade?: "A" | "B" | "C" | "D" | "F";
  gradeLabel?: string;
  totalSpend?: number;
  totalClicks?: number;
  totalPurchases?: number;
  totalRoas?: number;
  adCount?: number;
  metrics?: MetricData[];
  dateRange?: { start: string; end: string };
  isLoading?: boolean;
}

// ── 등급별 텍스트 색상 ──

const GRADE_TEXT_COLORS: Record<string, string> = {
  A: "#15803d",
  B: "#1d4ed8",
  C: "#a16207",
  D: "#c2410c",
  F: "#b91c1c",
};

// ── 반원형 SVG 게이지 설정 ──

const CX = 110;
const CY = 108;
const GAUGE_R = 85;
const GAUGE_STROKE = 20;

const GAUGE_SEGMENTS = [
  { grade: "F", color: "#ef4444", start: 180, end: 145 },
  { grade: "D", color: "#f97316", start: 143, end: 108 },
  { grade: "C", color: "#eab308", start: 106, end: 72 },
  { grade: "B", color: "#3b82f6", start: 70, end: 36 },
  { grade: "A", color: "#22c55e", start: 34, end: 0 },
];

const NEEDLE_ANGLE: Record<string, number> = {
  F: 162,
  D: 126,
  C: 89,
  B: 53,
  A: 17,
};

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function arcPath(startDeg: number, endDeg: number) {
  const s = polar(CX, CY, GAUGE_R, startDeg);
  const e = polar(CX, CY, GAUGE_R, endDeg);
  const large = Math.abs(startDeg - endDeg) > 180 ? 1 : 0;
  return `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${GAUGE_R} ${GAUGE_R} 0 ${large} 0 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
}

function SemiCircleGauge({ grade, gradeColor }: { grade: string; gradeColor: string }) {
  const angle = NEEDLE_ANGLE[grade] ?? 90;
  const needleLen = GAUGE_R - GAUGE_STROKE / 2 - 8;
  const tip = polar(CX, CY, needleLen, angle);
  const b1 = polar(CX, CY, 7, angle + 90);
  const b2 = polar(CX, CY, 7, angle - 90);

  return (
    <svg
      viewBox="0 0 220 125"
      className="mx-auto w-full max-w-[220px]"
      role="img"
      aria-label={`총가치 수준 ${grade}등급`}
    >
      {/* 세그먼트 (F→A 컬러 그라데이션) */}
      {GAUGE_SEGMENTS.map((seg) => (
        <path
          key={seg.grade}
          d={arcPath(seg.start, seg.end)}
          fill="none"
          stroke={seg.color}
          strokeWidth={GAUGE_STROKE}
          strokeLinecap="round"
          opacity={seg.grade === grade ? 1 : 0.25}
        />
      ))}

      {/* 양 끝 등급 라벨 */}
      <text x="20" y={CY + 18} textAnchor="middle" fontSize="10" fill="#9ca3af">
        F
      </text>
      <text x="200" y={CY + 18} textAnchor="middle" fontSize="10" fill="#9ca3af">
        A
      </text>

      {/* 바늘 */}
      <path
        d={`M ${tip.x.toFixed(1)} ${tip.y.toFixed(1)} L ${b1.x.toFixed(1)} ${b1.y.toFixed(1)} L ${b2.x.toFixed(1)} ${b2.y.toFixed(1)} Z`}
        fill="#374151"
      />
      <circle cx={CX} cy={CY} r={5} fill="#374151" />

      {/* 중앙 등급 텍스트 */}
      <text
        x={CX}
        y={CY - 30}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="34"
        fontWeight="900"
        fill={gradeColor}
        style={{ fontFamily: "Pretendard, sans-serif" }}
      >
        {grade}
      </text>
    </svg>
  );
}

// ── 지표 카드 헬퍼 ──

const STATUS_COLORS: Record<string, { bar: string; text: string }> = {
  "🟢": { bar: "bg-green-500", text: "text-green-600" },
  "🟡": { bar: "bg-yellow-500", text: "text-yellow-600" },
  "🔴": { bar: "bg-red-500", text: "text-red-600" },
  "⚪": { bar: "bg-gray-300", text: "text-gray-400" },
};

const STATUS_LABELS: Record<string, string> = {
  "🟢": "우수",
  "🟡": "보통",
  "🔴": "미달",
  "⚪": "데이터 없음",
};

function fmtCurrency(n: number): string {
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

function fmtValue(v: number | null, name: string): string {
  if (v == null) return "-";
  if (name.includes("만노출")) return v.toFixed(1);
  return v.toFixed(2) + "%";
}

function fmtBenchmark(v: number | null, name: string): string {
  if (v == null) return "-";
  if (name.includes("만노출")) return v.toFixed(1);
  return v.toFixed(2) + "%";
}

function calcBarWidth(value: number | null, p75: number | null): number {
  if (value == null || p75 == null || p75 === 0) return 0;
  const pct = Math.min((value / p75) * 100, 150);
  return Math.max(pct, 5);
}

function calcPeriodDays(dateRange?: { start: string; end: string }): number {
  if (!dateRange) return 14;
  const start = new Date(dateRange.start);
  const end = new Date(dateRange.end);
  const diffMs = end.getTime() - start.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(days, 1);
}

function buildDiagnosticJsx(
  grade: string,
  metrics: MetricData[],
  gradeTextColor: string,
): React.ReactNode | null {
  const good: string[] = [];
  const bad: string[] = [];

  for (const m of metrics) {
    if (m.status === "🟢") good.push(m.name);
    else if (m.status === "🔴") bad.push(m.name);
  }

  if (good.length === 0 && bad.length === 0) return null;

  const gradeSpan = (
    <span className="font-bold" style={{ color: gradeTextColor }}>
      {grade}등급
    </span>
  );

  if (bad.length === 0) {
    return (
      <>
        {gradeSpan} — 모든 지표가 벤치마크 상위 수준입니다
      </>
    );
  }

  const badSpans = bad.map((name, i) => (
    <span key={name}>
      <span className="font-semibold text-red-500">{name}</span>
      {i < bad.length - 1 ? "·" : ""}
    </span>
  ));

  if (good.length === 0) {
    return (
      <>
        {gradeSpan} — 전체적인 개선이 필요합니다 ({badSpans} 미달)
      </>
    );
  }

  const goodSpans = good.map((name, i) => (
    <span key={name}>
      {name}
      {i < good.length - 1 ? "·" : ""}
    </span>
  ));

  return (
    <>
      {gradeSpan} — {goodSpans}은 우수하나, {badSpans}이 벤치마크 미달
    </>
  );
}

// ── 메인 컴포넌트 ──

export function TotalValueGauge({
  grade,
  gradeLabel,
  totalSpend,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  totalClicks,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  totalPurchases,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  totalRoas,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  adCount,
  metrics,
  dateRange,
  isLoading,
}: TotalValueGaugeProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="ml-2 text-sm text-muted-foreground">총가치수준 계산 중...</span>
        </CardContent>
      </Card>
    );
  }

  if (!grade || !metrics) {
    return null;
  }

  const gradeTextColor = GRADE_TEXT_COLORS[grade] ?? GRADE_TEXT_COLORS.C;
  const periodDays = calcPeriodDays(dateRange);
  const periodLabel = `${periodDays}일`;

  const diagJsx = buildDiagnosticJsx(grade, metrics, gradeTextColor);

  return (
    <Card className="bg-white border border-gray-200">
      <CardContent className="p-5">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* 좌측: 반원형 게이지 */}
          <div className="flex-shrink-0 text-center" style={{ minWidth: "220px" }}>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">총가치 수준</p>
            <SemiCircleGauge grade={grade} gradeColor={gradeTextColor} />
            {gradeLabel && (
              <p className="-mt-1 text-sm font-semibold">{gradeLabel}</p>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">{periodLabel} 기준</p>
            {totalSpend != null && (
              <p className="mt-2 text-sm font-bold">
                총 광고비 {fmtCurrency(totalSpend)}
              </p>
            )}
            <p className="mt-0.5 text-[10px] text-muted-foreground">전체 광고 합산 기준</p>
          </div>

          {/* 우측: 6개 지표 */}
          <div className="grid flex-1 grid-cols-3 gap-3">
            {metrics.map((m) => {
              const sc = STATUS_COLORS[m.status] ?? STATUS_COLORS["⚪"];
              const barW = calcBarWidth(m.value, m.p75);
              const statusLabel = STATUS_LABELS[m.status] ?? "";

              return (
                <div
                  key={m.name}
                  className="rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{m.name}</span>
                    <span className="flex items-center gap-1 text-xs">
                      <span>{m.status}</span>
                      <span className={sc.text}>{statusLabel}</span>
                    </span>
                  </div>
                  <div className={`mt-1 text-lg font-bold ${sc.text}`}>
                    {fmtValue(m.value, m.name)}
                  </div>
                  {/* 게이지 바 */}
                  <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`absolute left-0 top-0 h-full rounded-full transition-all ${sc.bar}`}
                      style={{ width: `${Math.min(barW, 100)}%` }}
                    />
                    {/* p75 기준선 마커 */}
                    {m.p75 != null && (
                      <div
                        className="absolute top-0 h-full w-px bg-gray-400"
                        style={{ left: `${Math.min((100 / 150) * 100, 100)}%` }}
                        title={`p75: ${m.p75}`}
                      />
                    )}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>p50: {fmtBenchmark(m.p50, m.name)}</span>
                    <span>
                      {m.p75 != null && m.value != null && m.value >= m.p75
                        ? "p75 이상"
                        : `p75: ${fmtBenchmark(m.p75, m.name)}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 하단: 한줄 진단 텍스트 */}
        {diagJsx && (
          <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3 border border-gray-100">
            <p className="text-sm text-muted-foreground">{diagJsx}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
