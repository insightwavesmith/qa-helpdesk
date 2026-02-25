"use client";

// T10: 3컬럼 카드형 진단 패널 (기반점수 / 참여율 / 전환율)

interface DiagnosticMetric {
  name: string;
  my_value: number | null;
  above_avg: number | null;
  average_avg: number | null;
  verdict: string; // 🟢🟡🔴⚪
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
  diagnoses?: DiagnosisEntry[];
}

const VERDICT_STYLES: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  "🟢": { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
  "🟡": { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-700" },
  "🔴": { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-700" },
  "⚪": { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-500", badge: "bg-gray-100 text-gray-500" },
};

const VERDICT_LABEL: Record<string, string> = {
  "🟢": "우수",
  "🟡": "보통",
  "🔴": "미달",
  "⚪": "데이터 없음",
};

function fmtMetric(value: number | null): string {
  if (value == null) return "-";
  return value.toFixed(2);
}

export function DiagnosticPanel({ diagnoses }: DiagnosticPanelProps) {
  if (!diagnoses || diagnoses.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        진단할 광고 데이터가 부족합니다
      </div>
    );
  }

  // 첫 번째 광고의 진단 결과를 대표로 표시 (여러 광고가 있으면 탭 or 스크롤)
  // 파트별로 집계: 모든 광고의 동일 파트 지표를 모아 평균으로 표시
  const partMap = new Map<string, { verdict: string; metrics: Map<string, { values: number[]; aboves: number[]; averages: number[]; verdicts: string[] }> }>();

  for (const d of diagnoses) {
    for (const part of d.parts) {
      if (!partMap.has(part.part_name)) {
        partMap.set(part.part_name, { verdict: part.verdict, metrics: new Map() });
      }
      const pm = partMap.get(part.part_name)!;
      for (const m of part.metrics) {
        if (!pm.metrics.has(m.name)) {
          pm.metrics.set(m.name, { values: [], aboves: [], averages: [], verdicts: [] });
        }
        const mm = pm.metrics.get(m.name)!;
        if (m.my_value != null) mm.values.push(m.my_value);
        if (m.above_avg != null) mm.aboves.push(m.above_avg);
        if (m.average_avg != null) mm.averages.push(m.average_avg);
        mm.verdicts.push(m.verdict);
      }
    }
  }

  // 집계된 파트 verdict 재계산 (전체 광고 기준)
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
      const avgAbove = mm.aboves.length > 0 ? mm.aboves.reduce((a, b) => a + b, 0) / mm.aboves.length : null;
      const avgAverage = mm.averages.length > 0 ? mm.averages.reduce((a, b) => a + b, 0) / mm.averages.length : null;
      const verdict = aggregateVerdict(mm.verdicts);
      allPartVerdicts.push(verdict);
      return { name, my_value: avgVal, above_avg: avgAbove, average_avg: avgAverage, verdict };
    });
    const partVerdict = aggregateVerdict(allPartVerdicts);
    return { partName, verdict: partVerdict, metrics };
  });

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold">광고 진단 상세</h3>
        <p className="text-xs text-muted-foreground">
          {diagnoses.length}개 광고 기준 · 3파트(기반점수/참여율/전환율) 지표별 벤치마크 비교
        </p>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-3">
        {parts.map(({ partName, verdict, metrics }) => {
          const vs = VERDICT_STYLES[verdict] ?? VERDICT_STYLES["⚪"];
          return (
            <div key={partName} className={`rounded-lg border ${vs.border} ${vs.bg}`}>
              {/* 파트 헤더 */}
              <div className="flex items-center justify-between border-b border-inherit px-4 py-2.5">
                <span className="text-sm font-semibold">{partName}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${vs.badge}`}>
                  {verdict} {VERDICT_LABEL[verdict] ?? ""}
                </span>
              </div>

              {/* 지표 리스트 */}
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
                          <span className={`text-base font-bold ${ms.text}`}>
                            {fmtMetric(m.my_value)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {m.average_avg != null && m.above_avg != null
                              ? `p50: ${fmtMetric(m.average_avg)} / p75: ${fmtMetric(m.above_avg)}`
                              : m.above_avg != null
                                ? `기준선: ${fmtMetric(m.above_avg)}`
                                : ""}
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
