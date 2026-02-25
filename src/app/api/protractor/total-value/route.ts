import { NextRequest, NextResponse } from "next/server";
import { requireProtractorAccess, verifyAccountOwnership } from "../_shared";

// 지표 정의
const METRIC_DEFS = [
  { name: "3초시청률", benchKey: "video_p3s_rate", unit: "%" },
  { name: "CTR", benchKey: "ctr", unit: "%" },
  { name: "참여합계/만노출", benchKey: "engagement_per_10k", unit: "" },
  { name: "결제시작율", benchKey: "click_to_checkout_rate", unit: "%" },
  { name: "구매전환율", benchKey: "click_to_purchase_rate", unit: "%" },
  { name: "노출→구매", benchKey: "reach_to_purchase_rate", unit: "%" },
] as const;

type GradeLabel = { grade: "A" | "B" | "C" | "D" | "F"; label: string };

function calcGrade(greenCount: number): GradeLabel {
  if (greenCount >= 4) return { grade: "A", label: "우수" };
  if (greenCount >= 3) return { grade: "B", label: "양호" };
  if (greenCount >= 2) return { grade: "C", label: "보통" };
  if (greenCount >= 1) return { grade: "D", label: "주의 필요" };
  return { grade: "F", label: "위험" };
}

export async function GET(request: NextRequest) {
  const auth = await requireProtractorAccess();
  if ("response" in auth) return auth.response;
  const { svc, user, profile } = auth;

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");
  const dateStart = searchParams.get("date_start");
  const dateEnd = searchParams.get("date_end");

  if (!accountId) {
    return NextResponse.json({ error: "account_id 필수" }, { status: 400 });
  }

  const hasAccess = await verifyAccountOwnership(svc, user.id, profile.role, accountId);
  if (!hasAccess) {
    return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });
  }

  try {
    // 1. daily_ad_insights 조회
    let query = svc
      .from("daily_ad_insights")
      .select("*")
      .eq("account_id", accountId);

    if (dateStart) query = query.gte("date", dateStart);
    if (dateEnd) query = query.lte("date", dateEnd);

    const { data: rawData } = await query;
    const rows = rawData as unknown as Record<string, unknown>[] | null;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "데이터 없음" }, { status: 404 });
    }

    // 2. 집계
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalPurchases = 0;
    let totalSpend = 0;
    let totalVideoP3s = 0;
    let totalReactions = 0;
    let totalComments = 0;
    let totalShares = 0;
    let totalInitiateCheckout = 0;

    for (const row of rows) {
      const imp = Number(row.impressions) || 0;
      const clk = Number(row.clicks) || 0;
      totalImpressions += imp;
      totalClicks += clk;
      totalPurchases += Number(row.purchases) || 0;
      totalSpend += Number(row.spend) || 0;

      // rate에서 역산
      const p3sRate = Number(row.video_p3s_rate) || 0;
      totalVideoP3s += (p3sRate / 100) * imp;

      const reactPer10k = Number(row.reactions_per_10k) || 0;
      const commentPer10k = Number(row.comments_per_10k) || 0;
      const sharePer10k = Number(row.shares_per_10k) || 0;
      totalReactions += (reactPer10k / 10000) * imp;
      totalComments += (commentPer10k / 10000) * imp;
      totalShares += (sharePer10k / 10000) * imp;

      totalInitiateCheckout += Number(row.initiate_checkout) || 0;
    }

    // 6개 지표 계산
    const metricValues: Record<string, number | null> = {
      video_p3s_rate: totalImpressions > 0 ? (totalVideoP3s / totalImpressions) * 100 : null,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null,
      engagement_per_10k:
        totalImpressions > 0
          ? ((totalReactions + totalComments + totalShares) / totalImpressions) * 10000
          : null,
      click_to_checkout_rate:
        totalClicks > 0 ? (totalInitiateCheckout / totalClicks) * 100 : null,
      click_to_purchase_rate:
        totalClicks > 0 ? (totalPurchases / totalClicks) * 100 : null,
      reach_to_purchase_rate:
        totalImpressions > 0 ? (totalPurchases / totalImpressions) * 100 : null,
    };

    // 3. 벤치마크 조회
    const { data: latestBench } = await svc
      .from("benchmarks")
      .select("date")
      .order("calculated_at", { ascending: false })
      .limit(1);

    const benchMap: Record<string, { p50: number | null; p75: number | null }> = {};

    if (latestBench && latestBench.length > 0) {
      const { data: benchRows } = await svc
        .from("benchmarks")
        .select("metric_name, p50, p75, creative_type")
        .eq("date", latestBench[0].date);

      if (benchRows) {
        for (const row of benchRows) {
          const r = row as Record<string, unknown>;
          const ct = r.creative_type as string | null;
          // ALL 또는 null의 벤치마크 사용
          if (ct === "ALL" || ct == null) {
            benchMap[r.metric_name as string] = {
              p50: r.p50 as number | null,
              p75: r.p75 as number | null,
            };
          }
        }
      }
    }

    // 4. 판정
    let greenCount = 0;
    const metricsResult = METRIC_DEFS.map((def) => {
      const value = metricValues[def.benchKey];
      const bench = benchMap[def.benchKey];
      const p50 = bench?.p50 ?? null;
      const p75 = bench?.p75 ?? null;

      let status: string;
      if (value == null) {
        status = "⚪";
      } else if (p75 != null && value >= p75) {
        status = "🟢";
        greenCount++;
      } else if (p50 != null && value >= p50) {
        status = "🟡";
      } else {
        status = "🔴";
      }

      return {
        name: def.name,
        value: value != null ? Math.round(value * 100) / 100 : null,
        p50: p50 != null ? Math.round(p50 * 100) / 100 : null,
        p75: p75 != null ? Math.round(p75 * 100) / 100 : null,
        status,
      };
    });

    // 5. 등급
    const { grade, label: gradeLabel } = calcGrade(greenCount);

    return NextResponse.json({
      grade,
      gradeLabel,
      totalSpend: Math.round(totalSpend),
      metrics: metricsResult,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
