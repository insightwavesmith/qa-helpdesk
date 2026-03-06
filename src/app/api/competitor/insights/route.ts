import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { analyzeAds } from "@/lib/competitor/analyze-ads";
import type { CompetitorAd } from "@/types/competitor";

export const maxDuration = 120;

/**
 * POST /api/competitor/insights
 * 검색 결과 AI 분석 (24시간 캐시)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query: string = body.query?.trim()?.toLowerCase();
    const ads: CompetitorAd[] = body.ads ?? [];

    if (!query || ads.length === 0) {
      return NextResponse.json(
        { error: "검색어와 광고 데이터가 필요합니다", code: "INVALID_QUERY" },
        { status: 400 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any;

    // 캐시 확인
    const { data: cached } = await svc
      .from("competitor_insight_cache")
      .select("insight_data, expires_at")
      .eq("search_query", query)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      return NextResponse.json({
        insight: cached.insight_data,
        cached: true,
      });
    }

    // AI 분석 실행
    const insight = await analyzeAds(ads.slice(0, 50));

    // 캐시 저장 (24시간 TTL)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await svc.from("competitor_insight_cache").insert({
      search_query: query,
      insight_data: insight,
      ad_count: ads.length,
      expires_at: expiresAt.toISOString(),
    });

    return NextResponse.json({
      insight,
      cached: false,
    });
  } catch (err) {
    console.error("[competitor/insights] 분석 실패:", err);
    return NextResponse.json(
      {
        error: "AI 분석에 실패했습니다. 다시 시도하세요.",
        code: "INSIGHT_ERROR",
      },
      { status: 500 },
    );
  }
}
