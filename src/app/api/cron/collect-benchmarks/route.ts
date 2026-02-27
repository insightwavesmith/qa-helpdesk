import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// ── Vercel Cron 인증 ──────────────────────────────────────────
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

// 벤치마크 대상 지표 (최종 13개 — daily_ad_insights 컬럼)
const BENCHMARK_METRICS = [
  // 영상 (3)
  "video_p3s_rate",
  "thruplay_rate",
  "retention_rate",
  // 참여 (5)
  "reactions_per_10k",
  "comments_per_10k",
  "shares_per_10k",
  "saves_per_10k",
  "engagement_per_10k",
  // 전환 (5)
  "ctr",
  "click_to_checkout_rate",
  "click_to_purchase_rate",
  "checkout_to_purchase_rate",
  "roas",
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

export const maxDuration = 300; // 5분 (Vercel Pro 최대)

// ── GET /api/cron/collect-benchmarks ─────────────────────────
// Vercel Cron: 매주 월요일 02:00 UTC (KST 11:00)
export async function GET(req: NextRequest) {
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
    // 1. daily_ad_insights에서 최근 7일 데이터 조회 (creative_type 포함)
    // cpc, cpm 컬럼은 DB 마이그레이션 후 사용 가능
    const { data: insights, error: fetchErr } = (await svc
      .from("daily_ad_insights")
      .select("*")
      .gte("date", sevenDaysAgo)
      .lte("date", today)
      .gte("impressions", 3500)) as { data: Record<string, unknown>[] | null; error: Error | null };

    if (fetchErr) throw fetchErr;

    if (!insights || insights.length === 0) {
      return NextResponse.json({
        message: "No data for benchmarks",
        period: `${sevenDaysAgo} ~ ${today}`,
      });
    }

    // 2. creative_type별 그룹핑
    const groups = new Map<string, typeof insights>();
    groups.set("ALL", insights); // 전체

    for (const row of insights) {
      const ct = (row as Record<string, unknown>).creative_type as string | null;
      if (ct) {
        const key = ct.toUpperCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }
    }

    // 3. 각 그룹별로 벤치마크 계산
    const benchmarkRows: Record<string, unknown>[] = [];

    for (const [creativeType, groupInsights] of groups) {
      for (const metric of BENCHMARK_METRICS) {
        const values = groupInsights
          .map((row) => Number(row[metric as keyof typeof row]))
          .filter((v) => Number.isFinite(v) && v > 0)
          .sort((a, b) => a - b);

        if (values.length === 0) continue;

        const avg = values.reduce((s, v) => s + v, 0) / values.length;

        benchmarkRows.push({
          date: today,
          period: `${sevenDaysAgo}~${today}`,
          metric_name: metric,
          creative_type: creativeType,
          source: "all_accounts",
          p25: round(percentile(values, 25), 4),
          p50: round(percentile(values, 50), 4),
          p75: round(percentile(values, 75), 4),
          p90: round(percentile(values, 90), 4),
          avg_value: round(avg, 4),
          sample_size: values.length,
          calculated_at: new Date().toISOString(),
        });
      }
    }

    // 4. benchmarks 테이블에 upsert (중복 방지)
    if (benchmarkRows.length > 0) {
      const { error: insertErr } = await svc
        .from("benchmarks")
        .upsert(benchmarkRows as never[], {
          onConflict: "metric_name,creative_type,date",
        });

      if (insertErr) {
        console.error("benchmarks upsert error:", insertErr);
        throw insertErr;
      }
    }

    return NextResponse.json({
      message: "collect-benchmarks completed",
      date: today,
      period: `${sevenDaysAgo} ~ ${today}`,
      metrics_calculated: benchmarkRows.length,
      sample_insights: insights.length,
      creative_types: Array.from(groups.keys()),
    });
  } catch (e) {
    console.error("collect-benchmarks error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? (e as { message: string }).message : "Unknown error" },
      { status: 500 }
    );
  }
}
