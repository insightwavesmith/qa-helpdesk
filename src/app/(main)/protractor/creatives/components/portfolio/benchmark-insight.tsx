"use client";

// ── 타입 ──────────────────────────────────────────────────────────

interface BenchmarkRow {
  element_type: string;
  element_value: string;
  avg_roas: number | null;
  sample_count: number;
}

interface BenchmarkInsightProps {
  topHook: BenchmarkRow | null;
  topStyle: BenchmarkRow | null;
  worstHook: BenchmarkRow | null;
}

// ── 컴포넌트 ──────────────────────────────────────────────────────

export function BenchmarkInsight({
  topHook,
  topStyle,
  worstHook,
}: BenchmarkInsightProps) {
  if (!topHook && !topStyle) return null;

  return (
    <div
      className="rounded-xl p-5 border"
      style={{
        background: "rgba(245,158,11,0.04)",
        borderColor: "rgba(245,158,11,0.2)",
      }}
    >
      <h3
        className="flex items-center gap-2 text-[1.15rem] font-bold mb-3"
        style={{ color: "#f59e0b" }}
      >
        💡 벤치마크 인사이트
      </h3>
      <div className="text-sm text-gray-600 leading-relaxed space-y-1">
        {topHook && (
          <p>
            최고 성과 훅 유형:{" "}
            <strong className="text-gray-900">{topHook.element_value}</strong>{" "}
            (평균 ROAS {topHook.avg_roas?.toFixed(2) ?? "-"})
          </p>
        )}
        {topStyle && (
          <p>
            최고 성과 스타일:{" "}
            <strong className="text-gray-900">{topStyle.element_value}</strong>{" "}
            (평균 ROAS {topStyle.avg_roas?.toFixed(2) ?? "-"})
          </p>
        )}
        {worstHook && topHook && worstHook.element_value !== topHook.element_value && (
          <p className="mt-2" style={{ color: "#f59e0b" }}>
            ⚠️ 가장 많은 소재({worstHook.sample_count}개)를 가진{" "}
            <strong>{worstHook.element_value}</strong>의 ROAS가{" "}
            {worstHook.avg_roas?.toFixed(2) ?? "-"}로 가장 낮습니다. 소재 비중을{" "}
            <strong>{topHook.element_value}</strong>으로 전환하면 계정 전체 ROAS
            개선이 기대됩니다.
          </p>
        )}
      </div>
    </div>
  );
}
