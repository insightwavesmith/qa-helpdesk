import { NextRequest, NextResponse } from "next/server";
import { requireProtractorAccess, verifyAccountOwnership } from "../_shared";
import {
  ALL_METRIC_DEFS,
  type BenchEntry,
  computeMetricValues,
  getDominantCreativeType,
  calculateT3Score,
  periodToDateRange,
} from "@/lib/protractor/t3-engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchBenchmarks(svc: any, dominantCT: string): Promise<Record<string, BenchEntry>> {
  const benchMap: Record<string, BenchEntry> = {};

  const { data: latestBench } = await svc
    .from("benchmarks")
    .select("date")
    .order("calculated_at", { ascending: false })
    .limit(1);

  if (latestBench && latestBench.length > 0) {
    const { data: benchRows } = await svc
      .from("benchmarks")
      .select("metric_name, p25, p50, p75, p90, creative_type")
      .eq("date", latestBench[0].date);

    if (benchRows) {
      const byType = new Map<string, Record<string, BenchEntry>>();
      for (const row of benchRows) {
        const r = row as Record<string, unknown>;
        const ct = ((r.creative_type as string) ?? "ALL").toUpperCase();
        if (!byType.has(ct)) byType.set(ct, {});
        byType.get(ct)![r.metric_name as string] = {
          p25: r.p25 as number | null,
          p50: r.p50 as number | null,
          p75: r.p75 as number | null,
          p90: r.p90 as number | null,
        };
      }

      const primary = byType.get(dominantCT);
      const fallback = byType.get("ALL");

      for (const def of ALL_METRIC_DEFS) {
        const entry = primary?.[def.key] ?? fallback?.[def.key];
        if (entry) benchMap[def.key] = entry;
      }
    }
  }

  return benchMap;
}

// ============================================================
// API 핸들러
// ============================================================

export async function GET(request: NextRequest) {
  const auth = await requireProtractorAccess();
  if ("response" in auth) return auth.response;
  const { svc, user, profile } = auth;

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");
  const periodParam = parseInt(searchParams.get("period") ?? "1", 10);
  let dateStart = searchParams.get("date_start");
  let dateEnd = searchParams.get("date_end");

  if (!accountId) {
    return NextResponse.json({ error: "account_id 필수" }, { status: 400 });
  }

  // period → date range 자동 계산 (date_start/end 없을 때)
  const period = [1, 7, 14, 30].includes(periodParam) ? periodParam : 1;
  if (!dateStart || !dateEnd) {
    const range = periodToDateRange(period);
    dateStart = range.start;
    dateEnd = range.end;
  }

  const hasAccess = await verifyAccountOwnership(svc, user.id, profile.role, accountId);
  if (!hasAccess) {
    return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });
  }

  try {
    // ── 1. daily_ad_insights 조회 ──
    const { data: rawData } = await svc
      .from("daily_ad_insights")
      .select("*")
      .eq("account_id", accountId)
      .gte("date", dateStart)
      .lte("date", dateEnd);

    const rows = rawData as unknown as Record<string, unknown>[] | null;

    // 데이터 없음 처리 (B6)
    if (!rows || rows.length === 0) {
      return NextResponse.json({
        score: null,
        period,
        dataAvailableDays: 0,
        grade: null,
        diagnostics: null,
        metrics: [],
        summary: null,
        message: "내일부터 확인 가능합니다",
      });
    }

    // ── 2. 지표 계산 (엔진 사용) ──
    const metricValues = computeMetricValues(rows);
    const dominantCT = getDominantCreativeType(rows);

    // summary용 집계 (엔진에 없는 필드)
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalReach = 0;
    let totalClicks = 0;
    let totalPurchases = 0;
    let totalPurchaseValue = 0;
    const uniqueDates = new Set<string>();
    const adIds = new Set<string>();

    for (const row of rows) {
      totalSpend += Number(row.spend) || 0;
      totalImpressions += Number(row.impressions) || 0;
      totalReach += Number(row.reach) || 0;
      totalClicks += Number(row.clicks) || 0;
      totalPurchases += Number(row.purchases) || 0;
      totalPurchaseValue += Number(row.purchase_value) || 0;
      if (row.date) uniqueDates.add(row.date as string);
      if (row.ad_id) adIds.add(row.ad_id as string);
    }

    const dataAvailableDays = uniqueDates.size;

    // ── 3. 벤치마크 조회 ──
    const benchMap = await fetchBenchmarks(svc, dominantCT);

    // ── 4. T3 점수 계산 (엔진) ──
    const t3Result = calculateT3Score(metricValues, benchMap);

    // ── 5. 응답 ──
    return NextResponse.json({
      score: t3Result.score,
      period,
      dataAvailableDays,
      grade: t3Result.grade,
      diagnostics: t3Result.diagnostics,
      metrics: t3Result.metrics,
      summary: {
        spend: Math.round(totalSpend),
        impressions: totalImpressions,
        reach: totalReach,
        clicks: totalClicks,
        purchases: totalPurchases,
        purchaseValue: Math.round(totalPurchaseValue),
        roas: totalSpend > 0 ? Math.round((totalPurchaseValue / totalSpend) * 100) / 100 : 0,
        adCount: adIds.size,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
