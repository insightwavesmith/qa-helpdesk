import { NextRequest, NextResponse } from "next/server";
import { searchMetaAds, MetaAdError } from "@/lib/competitor/meta-ad-library";
import { upsertAdCache } from "@/lib/competitor/ad-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/competitor/search
 * 경쟁사 광고 검색 — SearchAPI.io Meta Ad Library 엔진
 *
 * Query params:
 *   q           - 검색어 (필수)
 *   page_token  - 다음 페이지 토큰 (선택, 더보기용)
 *   country     - 국가 코드 (기본 KR)
 *   media_type  - "all" | "image" | "video" (기본 all)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim();
  const pageToken = searchParams.get("page_token") ?? undefined;
  const pageId = searchParams.get("page_id") ?? undefined;
  const country = searchParams.get("country") ?? "KR";
  const mediaType = searchParams.get("media_type") ?? "all";
  const limit = Math.min(
    parseInt(searchParams.get("limit") ?? "50", 10) || 50,
    100,
  );

  if (!q && !pageId) {
    return NextResponse.json(
      { error: "검색어를 입력하세요", code: "INVALID_QUERY" },
      { status: 400 },
    );
  }

  try {
    const result = await searchMetaAds({
      searchTerms: q || "",
      country,
      limit,
      mediaType,
      pageToken,
      searchPageIds: pageId,
    });

    // 캐시 UPSERT (다운로드 시 캐시 필요 → await)
    try {
      await upsertAdCache(result.ads);
    } catch (err) {
      console.error("[search] 캐시 UPSERT 실패:", err);
    }

    return NextResponse.json({
      ads: result.ads,
      totalCount: result.ads.length,
      serverTotalCount: result.serverTotalCount,
      nextPageToken: result.nextPageToken,
      query: q,
      searchedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof MetaAdError) {
      const statusMap: Record<string, number> = {
        API_KEY_MISSING: 503,
        TOKEN_MISSING: 503,
        RATE_LIMITED: 429,
        META_API_ERROR: 502,
        SEARCH_API_ERROR: 502,
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
