"use client";

// T10: 3컬럼 카드형 진단 패널 (기반점수 / 참여율 / 전환율)
// T3 엔진의 계정 레벨 진단 + 기존 광고별 진단 모두 지원

// ── T3 계정 레벨 진단 타입 ──

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

// ── 기존 광고별 진단 타입 ──

interface DiagnosticMetric {
  name: string;
  my_value: number | null;
  pct_of_benchmark: number | null;
  verdict: string;
}

interface DiagnosticPart {
  part_name: string;
  verdict: string;
  metrics: DiagnosticMetric[];
}

interface DiagnosisEntry {
  ad_id: string;
  ad_name: string;
  overall_verdict: string;
  parts: DiagnosticPart[];
}

interface DiagnosticPanelProps {
  t3Diagnostics?: Record<string, T3DiagnosticPart>;
  diagnoses?: DiagnosisEntry[];
}

// ── 점수 → 등급 변환 ──

function scoreToGrade(score: number): string {
  if (score >= 75) return "A";
  if (score >= 50) return "B";
  return "C";
}

// ── 스타일 ──

function scoreToStyle(score: number) {
  if (score >= 75)
    return { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700", label: "우수" };
  if (score >= 50)
    return { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-700", label: "보통" };
  return { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-700", label: "미달" };
}

const VERDICT_STYLES: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  "🟢": { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
  "🟡": { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-700" },
  "🔴": { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-700" },
  "⚪": { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-500", badge: "bg-gray-100 text-gray-500" },
};

function fmtMetric(value: number | null): string {
  if (value == null) return "-";
  return value.toFixed(2);
}

// ── T3 진단 렌더링 ──

function T3DiagnosticView({ diagnostics }: { diagnostics: Record<string, T3DiagnosticPart> }) {
  const parts = Object.values(diagnostics);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold">T3 진단 상세</h3>
        <p className="text-xs text-muted-foreground">
          3파트(기반점수/참여율/전환율) 벤치마크 기반 점수
        </p>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-3">
        {parts.map((part) => {
          const style = scoreToStyle(part.score);
          return (
            <div key={part.label} className={`rounded-lg border ${style.border} ${style.bg}`}>
              <div className="flex items-center justify-between border-b border-inherit px-4 py-2.5">
                <span className="text-sm font-semibold">{part.label}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}>
                  {scoreToGrade(part.score)} · {style.label}
                </span>
              </div>
              <div className="flex flex-col gap-2 p-3">
                {part.metrics.length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">데이터 없음</p>
                ) : part.label === "참여율" ? (
                  // 참여율 파트: 개별 4개 지표 + 구분선 + 합계
                  (() => {
                    const summaryMetric = part.metrics.find((m) => m.key === "engagement_per_10k");
                    const individualMetrics = part.metrics.filter((m) => m.key !== "engagement_per_10k");
                    return (
                      <>
                        {individualMetrics.map((m) => {
                          const mStyle = m.score != null ? scoreToStyle(m.score) : { text: "text-gray-500" };
                          const fmtVal = m.value != null
                            ? m.unit === "%" ? m.value.toFixed(2) + "%" : m.value.toFixed(1)
                            : "-";
                          return (
                            <div key={m.key} className="rounded-md border border-border bg-white p-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-card-foreground">{m.name}</span>
                                <span className="text-xs">{m.status}</span>
                              </div>
                              <div className="mt-1 flex items-baseline gap-2">
                                <span className={`text-base font-bold ${mStyle.text}`}>{fmtVal}</span>
                                {m.score != null && (
                                  <span className="text-[10px] text-muted-foreground">{scoreToGrade(m.score)}</span>
                                )}
                              </div>
                              <div className="mt-1 text-[10px] text-muted-foreground">
                                {m.pctOfBenchmark != null ? `기준 대비 ${m.pctOfBenchmark}%` : ""}
                              </div>
                            </div>
                          );
                        })}
                        {summaryMetric && (
                          <>
                            <hr className="my-1 border-gray-200" />
                            <div className="rounded-md border border-border bg-white p-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-card-foreground">{summaryMetric.name}</span>
                                <span className="text-xs">{summaryMetric.status}</span>
                              </div>
                              <div className="mt-1 flex items-baseline gap-2">
                                {(() => {
                                  const sStyle = summaryMetric.score != null ? scoreToStyle(summaryMetric.score) : { text: "text-gray-500" };
                                  const fmtVal = summaryMetric.value != null
                                    ? summaryMetric.unit === "%" ? summaryMetric.value.toFixed(2) + "%" : summaryMetric.value.toFixed(1)
                                    : "-";
                                  return (
                                    <>
                                      <span className={`text-base font-bold ${sStyle.text}`}>{fmtVal}</span>
                                      {summaryMetric.score != null && (
                                        <span className="text-[10px] text-muted-foreground">{scoreToGrade(summaryMetric.score)}</span>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                              <div className="mt-1 text-[10px] text-muted-foreground">
                                {summaryMetric.pctOfBenchmark != null ? `기준 대비 ${summaryMetric.pctOfBenchmark}%` : ""}
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()
                ) : (
                  part.metrics.map((m) => {
                    const mStyle = m.score != null ? scoreToStyle(m.score) : { text: "text-gray-500" };
                    const fmtVal = m.value != null
                      ? m.unit === "%" ? m.value.toFixed(2) + "%" : m.value.toFixed(1)
                      : "-";

                    return (
                      <div key={m.key} className="rounded-md border border-border bg-white p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-card-foreground">{m.name}</span>
                          <span className="text-xs">{m.status}</span>
                        </div>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className={`text-base font-bold ${mStyle.text}`}>{fmtVal}</span>
                          {m.score != null && (
                            <span className="text-[10px] text-muted-foreground">{m.score}점</span>
                          )}
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {m.pctOfBenchmark != null ? `기준 대비 ${m.pctOfBenchmark}%` : ""}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 기존 광고별 진단 렌더링 ──

function LegacyDiagnosticView({ diagnoses }: { diagnoses: DiagnosisEntry[] }) {
  const partMap = new Map<string, { verdict: string; metrics: Map<string, { values: number[]; pctOfBenchmarks: number[]; verdicts: string[] }> }>();

  for (const d of diagnoses) {
    for (const part of d.parts) {
      if (!partMap.has(part.part_name)) {
        partMap.set(part.part_name, { verdict: part.verdict, metrics: new Map() });
      }
      const pm = partMap.get(part.part_name)!;
      for (const m of part.metrics) {
        if (!pm.metrics.has(m.name)) {
          pm.metrics.set(m.name, { values: [], pctOfBenchmarks: [], verdicts: [] });
        }
        const mm = pm.metrics.get(m.name)!;
        if (m.my_value != null) mm.values.push(m.my_value);
        if (m.pct_of_benchmark != null) mm.pctOfBenchmarks.push(m.pct_of_benchmark);
        mm.verdicts.push(m.verdict);
      }
    }
  }

  function aggregateVerdict(verdicts: string[]): string {
    if (verdicts.includes("🔴")) return "🔴";
    if (verdicts.every((v) => v === "🟢")) return "🟢";
    if (verdicts.includes("🟢") || verdicts.includes("🟡")) return "🟡";
    return "⚪";
  }

  const parts = Array.from(partMap.entries()).map(([partName, data]) => {
    const allPartVerdicts: string[] = [];
    const metrics = Array.from(data.metrics.entries()).map(([name, mm]) => {
      const avgVal = mm.values.length > 0 ? mm.values.reduce((a, b) => a + b, 0) / mm.values.length : null;
      const avgPct = mm.pctOfBenchmarks.length > 0 ? Math.round(mm.pctOfBenchmarks.reduce((a, b) => a + b, 0) / mm.pctOfBenchmarks.length) : null;
      const verdict = aggregateVerdict(mm.verdicts);
      allPartVerdicts.push(verdict);
      return { name, my_value: avgVal, pct_of_benchmark: avgPct, verdict };
    });
    const partVerdict = aggregateVerdict(allPartVerdicts);
    return { partName, verdict: partVerdict, metrics };
  });

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold">광고 진단 상세</h3>
        <p className="text-xs text-muted-foreground">
          {diagnoses.length}개 광고 기준 · 3파트 지표별 벤치마크 비교
        </p>
      </div>
      <div className="grid gap-4 p-5 lg:grid-cols-3">
        {parts.map(({ partName, verdict, metrics }) => {
          const vs = VERDICT_STYLES[verdict] ?? VERDICT_STYLES["⚪"];
          return (
            <div key={partName} className={`rounded-lg border ${vs.border} ${vs.bg}`}>
              <div className="flex items-center justify-between border-b border-inherit px-4 py-2.5">
                <span className="text-sm font-semibold">{partName}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${vs.badge}`}>
                  {verdict}
                </span>
              </div>
              <div className="flex flex-col gap-2 p-3">
                {metrics.length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">데이터 없음</p>
                ) : (
                  metrics.map((m) => {
                    const ms = VERDICT_STYLES[m.verdict] ?? VERDICT_STYLES["⚪"];
                    return (
                      <div key={m.name} className="rounded-md border border-border bg-white p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-card-foreground">{m.name}</span>
                          <span className="text-xs">{m.verdict}</span>
                        </div>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className={`text-base font-bold ${ms.text}`}>{fmtMetric(m.my_value)}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {m.pct_of_benchmark != null ? `기준 대비 ${m.pct_of_benchmark}%` : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ──

export function DiagnosticPanel({ t3Diagnostics, diagnoses }: DiagnosticPanelProps) {
  // T3 진단 우선 표시
  if (t3Diagnostics && Object.keys(t3Diagnostics).length > 0) {
    return <T3DiagnosticView diagnostics={t3Diagnostics} />;
  }

  // 기존 광고별 진단 폴백
  if (diagnoses && diagnoses.length > 0) {
    return <LegacyDiagnosticView diagnoses={diagnoses} />;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
      진단할 광고 데이터가 부족합니다
    </div>
  );
}
