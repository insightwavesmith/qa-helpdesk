import { NextResponse } from "next/server";
import { requireProtractorAccess } from "../_shared";

/**
 * 벤치마크 API — GCP wide format 직접 반환 (T7 재작성)
 *
 * DB: benchmarks 테이블 (wide format)
 *   creative_type × ranking_type × ranking_group 조합, 13개 지표 컬럼
 *
 * 프론트엔드(BenchmarkRow)와 호환을 위해:
 *   - ranking_group: "ABOVE_AVERAGE" → "above_avg" (lowercase) 변환
 *   - 지표 필드: DB 컬럼명(ctr) → avg_ prefix 추가(avg_ctr) 변환
 */

// DB wide-format → BenchmarkRow 변환
function toFrontendRow(row: Record<string, unknown>): Record<string, unknown> {
  const rankingGroup = (row.ranking_group as string ?? "").toLowerCase().replace(/_/g, "_");
  // ABOVE_AVERAGE → above_avg, AVERAGE → average, etc.
  const groupAlias = rankingGroup === "above_average" ? "above_avg"
    : rankingGroup === "median_all" ? "median_all"
    : rankingGroup;

  return {
    id: row.id,
    creative_type: row.creative_type,
    ranking_type: row.ranking_type,
    ranking_group: groupAlias,
    sample_count: row.sample_count,
    calculated_at: row.calculated_at,
    // 13개 지표: avg_ prefix 추가
    avg_video_p3s_rate: row.video_p3s_rate,
    avg_thruplay_rate: row.thruplay_rate,
    avg_retention_rate: row.retention_rate,
    avg_reactions_per_10k: row.reactions_per_10k,
    avg_comments_per_10k: row.comments_per_10k,
    avg_shares_per_10k: row.shares_per_10k,
    avg_saves_per_10k: row.saves_per_10k,
    avg_engagement_per_10k: row.engagement_per_10k,
    avg_ctr: row.ctr,
    avg_click_to_checkout_rate: row.click_to_checkout_rate,
    avg_click_to_purchase_rate: row.click_to_purchase_rate,
    avg_checkout_to_purchase_rate: row.checkout_to_purchase_rate,
    // reach_to_purchase_rate: 이름과 달리 분모는 impressions (= purchases / impressions × 100)
    avg_reach_to_purchase_rate: row.reach_to_purchase_rate,
    avg_roas: row.roas,
  };
}

// GET /api/protractor/benchmarks
// student 이상만 접근 가능
export async function GET() {
  try {
    const auth = await requireProtractorAccess();
    if ("response" in auth) return auth.response;
    const { svc } = auth;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const benchSvc = svc as any;

    // 가장 최근 calculated_at 조회
    const { data: latest, error: latestErr } = await benchSvc
      .from("benchmarks")
      .select("calculated_at")
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

    const latestAt = (latest[0].calculated_at as string).slice(0, 10);

    // 최근 수집분 전체 조회 (모든 ranking_group 포함)
    const { data, error } = await benchSvc
      .from("benchmarks")
      .select("*")
      .gte("calculated_at", latestAt);

    if (error) {
      console.error("benchmarks 조회 오류:", error);
      return NextResponse.json(
        { error: "벤치마크 데이터 조회에 실패했습니다." },
        { status: 500 }
      );
    }

    const rows = (data as Record<string, unknown>[] ?? []).map(toFrontendRow);
    return NextResponse.json({ data: rows });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
