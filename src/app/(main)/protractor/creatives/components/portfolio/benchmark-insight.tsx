"use client";

const V = {
  a: "#f59e0b", t2: "#475569", t: "#1e293b",
};

interface BenchmarkRow {
  element_type: string; element_value: string; avg_roas: number | null; sample_count: number;
}

interface BenchmarkInsightProps {
  topHook: BenchmarkRow | null; topStyle: BenchmarkRow | null; worstHook: BenchmarkRow | null;
}

export function BenchmarkInsight({ topHook, topStyle, worstHook }: BenchmarkInsightProps) {
  if (!topHook && !topStyle) return null;

  return (
    <div style={{
      background: "rgba(245,158,11,0.04)", borderRadius: 12, padding: "1.5rem", marginBottom: "1.2rem",
      border: "1px solid rgba(245,158,11,0.2)",
    }}>
      <h2 style={{ color: V.a, fontSize: "1.15rem", fontWeight: 700, marginBottom: ".8rem", display: "flex", alignItems: "center", gap: 8 }}>
        💡 벤치마크 인사이트
      </h2>
      <div style={{ fontSize: ".82rem", color: V.t2, lineHeight: 1.8 }}>
        {topHook && (
          <p>최고 성과 훅 유형: <b style={{ color: V.t }}>{topHook.element_value}</b> (평균 ROAS {topHook.avg_roas?.toFixed(2) ?? "-"})</p>
        )}
        {topStyle && (
          <p>최고 성과 스타일: <b style={{ color: V.t }}>{topStyle.element_value}</b> (평균 ROAS {topStyle.avg_roas?.toFixed(2) ?? "-"})</p>
        )}
        {worstHook && topHook && worstHook.element_value !== topHook.element_value && (
          <p style={{ marginTop: ".5rem", color: V.a }}>
            ⚠️ 가장 많은 소재({worstHook.sample_count}개)를 가진 <b>{worstHook.element_value}</b>의 ROAS가{" "}
            {worstHook.avg_roas?.toFixed(2) ?? "-"}로 가장 낮습니다. 소재 비중을 <b>{topHook.element_value}</b>으로 전환하면 계정 전체 ROAS 개선이 기대됩니다.
          </p>
        )}
      </div>
    </div>
  );
}
