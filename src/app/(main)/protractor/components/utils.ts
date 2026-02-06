import type { BenchmarkRow } from "./ad-metrics-table";

// 벤치마크에서 above_avg 그룹 값 찾기
export function findAboveAvg(
  benchmarks: BenchmarkRow[],
  rankingType: string,
  creativeType = "VIDEO"
): BenchmarkRow | undefined {
  return benchmarks.find(
    (b) =>
      b.ranking_type === rankingType &&
      b.ranking_group === "above_avg" &&
      b.creative_type === creativeType
  );
}

// 3단계 판정: 우수 / 보통 / 미달
export function getVerdict(
  value: number | undefined | null,
  aboveAvg: number | undefined | null,
  higherBetter = true
): { emoji: string; className: string; label: string } {
  if (value == null || aboveAvg == null || aboveAvg === 0) {
    return { emoji: "", className: "text-muted-foreground", label: "데이터 없음" };
  }
  const threshold = aboveAvg * 0.75;

  if (higherBetter) {
    if (value >= aboveAvg)
      return { emoji: "", className: "text-green-600 dark:text-green-400", label: "우수" };
    if (value >= threshold)
      return { emoji: "", className: "text-yellow-600 dark:text-yellow-400", label: "보통" };
    return { emoji: "", className: "text-red-600 dark:text-red-400", label: "미달" };
  } else {
    if (value <= aboveAvg)
      return { emoji: "", className: "text-green-600 dark:text-green-400", label: "우수" };
    if (value <= aboveAvg * 1.25)
      return { emoji: "", className: "text-yellow-600 dark:text-yellow-400", label: "보통" };
    return { emoji: "", className: "text-red-600 dark:text-red-400", label: "미달" };
  }
}

// 숫자 포맷 헬퍼
export function fmt(n: number | undefined | null): string {
  if (n == null) return "-";
  return n.toLocaleString("ko-KR");
}

export function fmtCurrency(n: number | undefined | null): string {
  if (n == null) return "-";
  return "\u20A9" + Math.round(n).toLocaleString("ko-KR");
}

export function fmtPercent(n: number | undefined | null): string {
  if (n == null) return "-";
  return n.toFixed(2) + "%";
}
