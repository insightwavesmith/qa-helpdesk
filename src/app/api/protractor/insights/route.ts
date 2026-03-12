import { NextRequest, NextResponse } from "next/server";
import { requireProtractorAccess, verifyAccountOwnership } from "../_shared";

// GET /api/protractor/insights?account_id=xxx&start=YYYY-MM-DD&end=YYYY-MM-DD
// student 이상만 접근 가능 + 자신의 계정만 (admin은 전체)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireProtractorAccess();
    if ("response" in auth) return auth.response;
    const { user, profile, svc } = auth;

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("account_id");
    let start = searchParams.get("start");
    let end = searchParams.get("end");

    if (!accountId) {
      return NextResponse.json(
        { error: "account_id는 필수입니다." },
        { status: 400 }
      );
    }

    // 계정 소유권 확인
    const hasAccess = await verifyAccountOwnership(svc, user.id, profile.role, accountId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "해당 계정에 대한 접근 권한이 없습니다." },
        { status: 403 }
      );
    }

    // start/end 기본값: 미입력 시 최근 90일
    if (!start) {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      start = d.toISOString().slice(0, 10);
    }
    if (!end) {
      end = new Date().toISOString().slice(0, 10);
    }

    let query = svc
      .from("daily_ad_insights")
      .select(
        "date,account_id,ad_id,ad_name,adset_name,campaign_name,creative_type," +
        "impressions,reach,clicks,ctr,spend,purchases,purchase_value,roas," +
        "video_p3s_rate,thruplay_rate,retention_rate," +
        "reactions_per_10k,comments_per_10k,shares_per_10k,saves_per_10k,engagement_per_10k," +
        "click_to_checkout_rate,checkout_to_purchase_rate,click_to_purchase_rate,reach_to_purchase_rate," +
        "engagement_ranking,conversion_ranking"
      )
      .eq("account_id", accountId)
      .order("date", { ascending: true })
      .limit(5000);

    query = query.gte("date", start);
    query = query.lte("date", end);

    const { data, error } = await query;

    if (error) {
      console.error("daily_ad_insights 조회 오류:", error);
      return NextResponse.json(
        { error: "인사이트 데이터 조회에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
