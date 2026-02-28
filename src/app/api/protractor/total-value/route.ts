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

/**
 * wide format 벤치마크 조회 — ranking_group=ABOVE_AVERAGE 기준 단일 값
 * dominantCT: creative_type (VIDEO/IMAGE/CATALOG/ALL)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchBenchmarks(svc: any, dominantCT: string): Promise<Record<string, BenchEntry>> {
  const benchMap: Record<string, BenchEntry> = {};

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const benchSvc = svc as any;

    // 최신 calculated_at 조회
    const { data: latestBench } = await benchSvc
      .from("benchmarks")
      .select("calculated_at")
      .order("calculated_at", { ascending: false })
      .limit(1);

    if (!latestBench || latestBench.length === 0) return benchMap;

    const latestAt = (latestBench[0].calculated_at as string).slice(0, 10);

    // creative_type + ABOVE_AVERAGE 행 조회 (engagement + conversion 두 행)
    const { data: rows } = await benchSvc
      .from("benchmarks")
      .select("*")
      .eq("creative_type", dominantCT)
      .eq("ranking_group", "ABOVE_AVERAGE")
      .gte("calculated_at", latestAt);

    if (!rows || rows.length === 0) {
      // fallback: ALL creative_type 시도
      const { data: fallbackRows } = await benchSvc
        .from("benchmarks")
        .select("*")
        .eq("creative_type", "ALL")
        .eq("ranking_group", "ABOVE_AVERAGE")
        .gte("calculated_at", latestAt);

      if (!fallbackRows || fallbackRows.length === 0) return benchMap;

      for (const row of fallbackRows as Record<string, unknown>[]) {
        for (const def of ALL_METRIC_DEFS) {
          const val = row[def.key];
          if (val != null && typeof val === "number" && benchMap[def.key] == null) {
            benchMap[def.key] = val;
          }
        }
      }
      return benchMap;
    }

    // engagement + conversion 두 행에서 지표값 추출 (먼저 발견된 값 우선)
    for (const row of rows as Record<string, unknown>[]) {
      for (const def of ALL_METRIC_DEFS) {
        const val = row[def.key];
        if (val != null && typeof val === "number" && benchMap[def.key] == null) {
          benchMap[def.key] = val;
        }
      }
    }
  } catch {
    // 벤치마크 없어도 T3 계산 가능 (기본 점수 반환)
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
    const hasBenchmarkData = Object.keys(benchMap).length > 0;

    // ── 4. T3 점수 계산 (엔진) ──
    const t3Result = calculateT3Score(metricValues, benchMap);

    // ── 5. 응답 (T3: aboveAvg 제거, pctOfBenchmark 추가) ──
    const safeMetrics = t3Result.metrics.map(({ aboveAvg, ...rest }) => ({
      ...rest,
      pctOfBenchmark: rest.value != null && aboveAvg != null && aboveAvg > 0
        ? Math.round((rest.value / aboveAvg) * 100)
        : null,
    }));

    const safeDiagnostics = t3Result.diagnostics
      ? Object.fromEntries(
          Object.entries(t3Result.diagnostics).map(([k, part]) => [
            k,
            {
              ...part,
              metrics: part.metrics.map(({ aboveAvg, ...rest }) => ({
                ...rest,
                pctOfBenchmark: rest.value != null && aboveAvg != null && aboveAvg > 0
                  ? Math.round((rest.value / aboveAvg) * 100)
                  : null,
              })),
            },
          ])
        )
      : null;

    return NextResponse.json({
      score: t3Result.score,
      period,
      dataAvailableDays,
      grade: t3Result.grade,
      diagnostics: safeDiagnostics,
      metrics: safeMetrics,
      hasBenchmarkData,
      message: hasBenchmarkData ? undefined : "벤치마크 데이터 없음. 벤치마크 관리 탭에서 수집하세요.",
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
