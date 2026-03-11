import { NextRequest, NextResponse } from "next/server";
import { requireProtractorAccess, verifyAccountOwnership } from "../_shared";
import {
  ALL_METRIC_DEFS,
  type BenchEntry,
  computeMetricValues,
  calculateT3Score,
  periodToDateRange,
  getDominantCreativeType,
} from "@/lib/protractor/t3-engine";

/**
 * wide format 벤치마크 조회 — ranking_group=ABOVE_AVERAGE
 * creative_type별 벤치마크 우선, 없으면 ALL fallback
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchBenchmarks(svc: any, dominantCreativeType: string): Promise<Record<string, BenchEntry>> {
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

    // creative_type별 + ALL 벤치마크를 함께 조회 (ABOVE_AVERAGE만)
    const aboveAvgValues = ["ABOVE_AVERAGE", "above_avg"];
    const ctValues = dominantCreativeType !== "ALL"
      ? [dominantCreativeType, "ALL"]
      : ["ALL"];

    const { data: rows } = await benchSvc
      .from("benchmarks")
      .select("*")
      .in("creative_type", ctValues)
      .in("ranking_group", aboveAvgValues)
      .gte("calculated_at", latestAt);

    if (!rows || rows.length === 0) return benchMap;

    // creative_type별 벤치마크 우선, ALL은 fallback
    const typedRows = rows as Record<string, unknown>[];
    const ctRows = typedRows.filter((r) => r.creative_type === dominantCreativeType);
    const allRows = typedRows.filter((r) => r.creative_type === "ALL");

    // 1차: creative_type별 값 적용
    for (const row of ctRows) {
      for (const def of ALL_METRIC_DEFS) {
        const val = row[def.key];
        if (val != null && typeof val === "number" && benchMap[def.key] == null) {
          benchMap[def.key] = val;
        }
      }
    }

    // 2차: ALL fallback (아직 없는 지표만)
    for (const row of allRows) {
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
      .select("spend,impressions,reach,clicks,purchases,purchase_value,date,ad_id,adset_id,initiate_checkout,video_p3s_rate,thruplay_rate,retention_rate,reactions_per_10k,comments_per_10k,shares_per_10k,saves_per_10k,creative_type")
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

    // ── 3. 벤치마크 조회 (dominant creative_type별) ──
    const dominantCT = getDominantCreativeType(rows);
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
    console.error("[total-value] Error:", {
      accountId,
      dateStart,
      dateEnd,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
