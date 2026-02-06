import { NextResponse } from "next/server";
import { requireProtractorAccess } from "../_shared";

// EAV metric_name → 프론트엔드 BenchmarkRow 필드 매핑
// 벤치마크 그룹: engagement 또는 conversion
const METRIC_FIELD_MAP: Record<string, { field: string; group: "engagement" | "conversion" }> = {
  roas: { field: "avg_roas", group: "conversion" },
  ctr: { field: "avg_ctr", group: "conversion" },
  spend: { field: "avg_spend", group: "conversion" },
  impressions: { field: "avg_impressions", group: "engagement" },
  clicks: { field: "avg_clicks", group: "conversion" },
  purchases: { field: "avg_purchases", group: "conversion" },
  purchase_value: { field: "avg_purchase_value", group: "conversion" },
  video_p3s_rate: { field: "avg_video_p3s_rate", group: "engagement" },
  thruplay_rate: { field: "avg_thruplay_rate", group: "engagement" },
  retention_rate: { field: "avg_retention_rate", group: "engagement" },
  reactions_per_10k: { field: "avg_reactions_per_10k", group: "engagement" },
  comments_per_10k: { field: "avg_comments_per_10k", group: "engagement" },
  shares_per_10k: { field: "avg_shares_per_10k", group: "engagement" },
  engagement_per_10k: { field: "avg_engagement_per_10k", group: "engagement" },
  click_to_cart_rate: { field: "avg_click_to_cart_rate", group: "conversion" },
  click_to_checkout_rate: { field: "avg_click_to_checkout_rate", group: "conversion" },
  checkout_to_purchase_rate: { field: "avg_checkout_to_purchase_rate", group: "conversion" },
  click_to_purchase_rate: { field: "avg_click_to_purchase_rate", group: "conversion" },
  reach_to_purchase_rate: { field: "avg_reach_to_purchase_rate", group: "conversion" },
};

// EAV 행들을 프론트엔드가 기대하는 wide-format BenchmarkRow로 피벗
// p75를 "상위 기준선" (above_avg) 값으로 사용
function pivotBenchmarks(
  rows: { metric_name: string; avg_value: number | null; p75: number | null; date: string }[]
): Record<string, unknown>[] {
  // date별로 그룹핑 (같은 날짜의 metric_name들을 하나의 wide row로 합침)
  const byDate = new Map<string, { metric_name: string; avg_value: number | null; p75: number | null }[]>();
  for (const row of rows) {
    const existing = byDate.get(row.date) ?? [];
    existing.push(row);
    byDate.set(row.date, existing);
  }

  const result: Record<string, unknown>[] = [];

  for (const [, metrics] of byDate) {
    // engagement 그룹 row
    const engRow: Record<string, unknown> = {
      ranking_type: "engagement",
      ranking_group: "above_avg",
      creative_type: "VIDEO",
    };
    // conversion 그룹 row
    const convRow: Record<string, unknown> = {
      ranking_type: "conversion",
      ranking_group: "above_avg",
      creative_type: "VIDEO",
    };

    for (const m of metrics) {
      const mapping = METRIC_FIELD_MAP[m.metric_name];
      if (!mapping) continue;
      // p75를 기준선으로 사용, 없으면 avg_value 폴백
      const value = m.p75 ?? m.avg_value;
      if (value == null) continue;

      if (mapping.group === "engagement") {
        engRow[mapping.field] = value;
      } else {
        convRow[mapping.field] = value;
      }
    }

    result.push(engRow, convRow);
  }

  return result;
}

// GET /api/protractor/benchmarks
// student 이상만 접근 가능
// benchmarks 테이블(EAV)에서 최근 데이터 조회 → 프론트엔드용 wide format으로 변환
export async function GET() {
  try {
    const auth = await requireProtractorAccess();
    if ("response" in auth) return auth.response;
    const { svc } = auth;

    // 가장 최근 날짜의 벤치마크만 가져오기
    const { data: latest, error: latestErr } = await svc
      .from("benchmarks")
      .select("date")
      .order("calculated_at", { ascending: false })
      .limit(1);

    if (latestErr) {
      console.error("benchmarks 조회 오류:", latestErr);
      return NextResponse.json(
        { error: "벤치마크 데이터 조회에 실패했습니다." },
        { status: 500 }
      );
    }

    if (!latest || latest.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const latestDate = latest[0].date;
    const { data, error } = await svc
      .from("benchmarks")
      .select("metric_name, avg_value, p75, date")
      .eq("date", latestDate);

    if (error) {
      console.error("benchmarks 조회 오류:", error);
      return NextResponse.json(
        { error: "벤치마크 데이터 조회에 실패했습니다." },
        { status: 500 }
      );
    }

    const pivoted = pivotBenchmarks(data ?? []);
    return NextResponse.json({ data: pivoted });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
