import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// ── Vercel Cron 인증 ──────────────────────────────────────────
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

// 벤치마크 대상 지표 (daily_ad_insights 컬럼)
const BENCHMARK_METRICS = [
  "roas",
  "ctr",
  "spend",
  "impressions",
  "clicks",
  "purchases",
  "purchase_value",
] as const;

function round(v: number, d: number): number {
  const m = 10 ** d;
  return Math.round(v * m) / m;
}

// 배열에서 백분위수 계산
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ── POST /api/cron/collect-benchmarks ─────────────────────────
// Vercel Cron: 매주 월요일 00:00 UTC (KST 09:00)
export async function POST(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  // 최근 7일 범위 계산
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  try {
    // 1. daily_ad_insights에서 최근 7일 데이터 조회
    const { data: insights, error: fetchErr } = await svc
      .from("daily_ad_insights")
      .select("roas, ctr, spend, impressions, clicks, purchases, purchase_value")
      .gte("date", sevenDaysAgo)
      .lte("date", today);

    if (fetchErr) throw fetchErr;

    if (!insights || insights.length === 0) {
      return NextResponse.json({
        message: "No data for benchmarks",
        period: `${sevenDaysAgo} ~ ${today}`,
      });
    }

    // 2. 지표별 p50, p75, p90, avg 계산
    const benchmarkRows: Record<string, unknown>[] = [];

    for (const metric of BENCHMARK_METRICS) {
      const values = insights
        .map((row) => Number(row[metric]))
        .filter((v) => Number.isFinite(v) && v > 0)
        .sort((a, b) => a - b);

      if (values.length === 0) continue;

      const avg = values.reduce((s, v) => s + v, 0) / values.length;

      benchmarkRows.push({
        date: today,
        period: `${sevenDaysAgo}~${today}`,
        metric_name: metric,
        p50: round(percentile(values, 50), 4),
        p75: round(percentile(values, 75), 4),
        p90: round(percentile(values, 90), 4),
        avg_value: round(avg, 4),
        sample_size: values.length,
        calculated_at: new Date().toISOString(),
      });
    }

    // 3. benchmarks 테이블에 INSERT
    if (benchmarkRows.length > 0) {
      const { error: insertErr } = await svc
        .from("benchmarks")
        .insert(benchmarkRows as never[]);

      if (insertErr) {
        console.error("benchmarks insert error:", insertErr);
        throw insertErr;
      }
    }

    return NextResponse.json({
      message: "collect-benchmarks completed",
      date: today,
      period: `${sevenDaysAgo} ~ ${today}`,
      metrics_calculated: benchmarkRows.length,
      sample_insights: insights.length,
    });
  } catch (e) {
    console.error("collect-benchmarks error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
