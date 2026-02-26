"use client";

import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

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

// ── 등급별 스타일 매핑 (화이트 테마) ──

const GRADE_STYLES: Record<string, { border: string; text: string; bg: string; hex: string }> = {
  A: { border: "border-emerald-400", text: "text-emerald-500", bg: "bg-emerald-50", hex: "#10b981" },
  B: { border: "border-blue-400", text: "text-blue-500", bg: "bg-blue-50", hex: "#3b82f6" },
  C: { border: "border-yellow-400", text: "text-yellow-500", bg: "bg-yellow-50", hex: "#eab308" },
  D: { border: "border-orange-400", text: "text-orange-500", bg: "bg-orange-50", hex: "#f97316" },
  F: { border: "border-red-400", text: "text-red-500", bg: "bg-red-50", hex: "#ef4444" },
};

// ── 점수 계산 (metrics 상태 기반) ──

function calcScoreFromMetrics(metrics: MetricData[]): number {
  const SCORE_MAP: Record<string, number> = {
    "🟢": 100,
    "🟡": 55,
    "🔴": 15,
  };

  let total = 0;
  let count = 0;
  for (const m of metrics) {
    const s = SCORE_MAP[m.status];
    if (s != null) {
      total += s;
      count++;
    }
  }
  return count > 0 ? Math.round(total / count) : 0;
}

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

  // 반원: 180° (왼쪽) → 0° (오른쪽)
  // 각도 = 180 - (score / 100) * 180
  const startAngle = Math.PI; // 180°
  const endAngle = 0; // 0°

  function arcPath(startDeg: number, endDeg: number): string {
    const x1 = cx + r * Math.cos(startDeg);
    const y1 = cy - r * Math.sin(startDeg);
    const x2 = cx + r * Math.cos(endDeg);
    const y2 = cy - r * Math.sin(endDeg);
    const sweep = endDeg < startDeg ? 0 : 1;
    return `M ${x1} ${y1} A ${r} ${r} 0 0 ${sweep} ${x2} ${y2}`;
  }

  // 게이지 세그먼트 (빨강→노랑→초록)
  const segments = [
    { start: Math.PI, end: Math.PI * 0.667, color: "#fca5a5" },          // 0~33: 연빨강
    { start: Math.PI * 0.667, end: Math.PI * 0.333, color: "#fde68a" },  // 33~66: 연노랑
    { start: Math.PI * 0.333, end: 0, color: "#86efac" },                // 66~100: 연초록
  ];

  // 바늘 각도: score 0 → 180°, score 100 → 0°
  const needleAngle = Math.PI - (score / 100) * Math.PI;
  const needleLen = r - 10;
  const nx = cx + needleLen * Math.cos(needleAngle);
  const ny = cy - needleLen * Math.sin(needleAngle);

  return (
    <svg viewBox="0 0 240 140" className="w-full max-w-[220px]">
      {/* 배경 세그먼트 */}
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

      {/* 활성 구간 (0 ~ score) */}
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

      {/* 바늘 */}
      <line
        x1={cx}
        y1={cy}
        x2={nx}
        y2={ny}
        stroke="#374151"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={5} fill="#374151" />

      {/* 점수 */}
      <text x={cx} y={cy + 25} textAnchor="middle" className="text-2xl font-black" fill="#111827" fontSize="26" fontWeight="900">
        {score}
      </text>

      {/* 등급 */}
      <text x={cx} y={cy + 42} textAnchor="middle" fill={gradeStyle.hex} fontSize="13" fontWeight="700">
        {grade}등급
      </text>

      {/* 스케일 라벨 */}
      <text x={cx - r - 2} y={cy + 16} textAnchor="middle" fill="#9ca3af" fontSize="10">0</text>
      <text x={cx} y={cy - r + 4} textAnchor="middle" fill="#9ca3af" fontSize="10">50</text>
      <text x={cx + r + 2} y={cy + 16} textAnchor="middle" fill="#9ca3af" fontSize="10">100</text>
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
  gradeStyle: { text: string },
): React.ReactNode | null {
  const good: string[] = [];
  const bad: string[] = [];

  for (const m of metrics) {
    if (m.status === "🟢") good.push(m.name);
    else if (m.status === "🔴") bad.push(m.name);
  }

  if (good.length === 0 && bad.length === 0) return null;

  const gradeSpan = (
    <span className={`font-bold ${gradeStyle.text}`}>
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
  totalClicks: _totalClicks,
  totalPurchases: _totalPurchases,
  totalRoas: _totalRoas,
  adCount: _adCount,
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
    return (
      <Card className="bg-white border border-gray-200">
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <AlertTriangle className="h-6 w-6 mb-2" />
          <p className="text-sm">데이터를 불러올 수 없습니다</p>
          <p className="text-xs mt-1">기간을 변경하거나 다시 시도해 주세요</p>
        </CardContent>
      </Card>
    );
  }

  const gradeStyle = GRADE_STYLES[grade] ?? GRADE_STYLES.C;
  const periodDays = calcPeriodDays(dateRange);
  const periodLabel = `${periodDays}일`;
  const score = calcScoreFromMetrics(metrics);

  const diagJsx = buildDiagnosticJsx(grade, metrics, gradeStyle);

  return (
    <Card className="bg-white border border-gray-200">
      <CardContent className="p-5">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* 좌측: 반원형 SVG 게이지 */}
          <div className="flex-shrink-0 flex flex-col items-center" style={{ minWidth: "220px" }}>
            <SemiCircleGauge score={score} grade={grade} gradeStyle={gradeStyle} />
            {gradeLabel && (
              <p className={`-mt-1 text-sm font-semibold ${gradeStyle.text}`}>{gradeLabel}</p>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">{periodLabel} 기준</p>
            {totalSpend != null && (
              <p className="mt-2 text-sm font-bold text-gray-900">
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
