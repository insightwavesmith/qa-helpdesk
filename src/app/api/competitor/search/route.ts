import { NextRequest, NextResponse } from "next/server";
import { searchMetaAds, MetaAdError } from "@/lib/competitor/meta-ad-library";

/**
 * GET /api/competitor/search
 * 경쟁사 광고 검색 — Meta Ad Library API 연동
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim();
  const country = searchParams.get("country") ?? "KR";
  const activeOnly = searchParams.get("active_only") === "true";
  const minDays = parseInt(searchParams.get("min_days") ?? "0", 10) || 0;
  const platform = searchParams.get("platform") ?? "";
  const limit = Math.min(
    parseInt(searchParams.get("limit") ?? "50", 10) || 50,
    100,
  );

  if (!q) {
    return NextResponse.json(
      { error: "검색어를 입력하세요", code: "INVALID_QUERY" },
      { status: 400 },
    );
  }

  try {
    const result = await searchMetaAds({
      searchTerms: q,
      country,
      limit,
    });

    // 클라이언트 필터 적용
    let filteredAds = result.ads;

    if (activeOnly) {
      filteredAds = filteredAds.filter((ad) => ad.isActive);
    }

    if (minDays > 0) {
      filteredAds = filteredAds.filter((ad) => ad.durationDays >= minDays);
    }

    if (platform) {
      filteredAds = filteredAds.filter((ad) =>
        ad.platforms.includes(platform.toLowerCase()),
      );
    }

    return NextResponse.json({
      ads: filteredAds,
      totalCount: filteredAds.length,
      query: q,
      searchedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof MetaAdError) {
      const statusMap: Record<string, number> = {
        TOKEN_MISSING: 503,
        RATE_LIMITED: 429,
        META_API_ERROR: 502,
      };
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: statusMap[err.code] ?? 500 },
      );
    }
    return NextResponse.json(
      { error: "알 수 없는 오류가 발생했습니다", code: "UNKNOWN" },
      { status: 500 },
    );
  }
}
