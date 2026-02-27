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

// Phase 3에서 전면 재작성 예정 — wide format 스키마 대응 임시 구현
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchBenchmarks(svc: any, _dominantCT: string): Promise<Record<string, BenchEntry>> {
  // Phase 3 재작성 전까지 빈 맵 반환 (benchmarks 스키마 전환 중)
  const benchMap: Record<string, BenchEntry> = {};

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const benchSvc = svc as any;
    const { data: latestBench } = await benchSvc
      .from("benchmarks")
      .select("calculated_at")
      .order("calculated_at", { ascending: false })
      .limit(1);

    if (!latestBench || latestBench.length === 0) return benchMap;

    // wide format: 한 행에 모든 지표가 컬럼으로 존재
    const { data: rows } = await benchSvc
      .from("benchmarks")
      .select("*")
      .order("calculated_at", { ascending: false })
      .limit(10);

    if (!rows || rows.length === 0) return benchMap;

    // wide format에서 BenchEntry 구성 (p25=0, p50=avg, p75=avg, p90=avg 임시)
    // Phase 3에서 ranking_type/ranking_group 기반으로 대체 예정
    const row = rows[0] as Record<string, unknown>;
    for (const def of ALL_METRIC_DEFS) {
      const val = row[def.key];
      if (val != null && typeof val === "number") {
        benchMap[def.key] = { p25: val * 0.7, p50: val * 0.85, p75: val, p90: val * 1.2 };
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
