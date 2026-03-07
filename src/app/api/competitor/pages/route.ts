import { NextRequest, NextResponse } from "next/server";
import { searchMetaAds, MetaAdError } from "@/lib/competitor/meta-ad-library";
import type { MetaPage } from "@/types/competitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/competitor/pages?q=브랜드명
 * Meta Ad Library 검색 결과에서 고유 페이지 목록 추출
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json(
      { error: "검색어를 입력하세요", code: "INVALID_QUERY" },
      { status: 400 },
    );
  }

  try {
    const result = await searchMetaAds({ searchTerms: q });

    // page_id 기준 중복 제거
    const pageMap = new Map<string, MetaPage>();
    for (const ad of result.ads) {
      if (!pageMap.has(ad.pageId)) {
        pageMap.set(ad.pageId, {
          pageId: ad.pageId,
          pageName: ad.pageName,
          profileImageUrl: `https://graph.facebook.com/${ad.pageId}/picture?type=small`,
        });
      }
    }

    const pages: MetaPage[] = Array.from(pageMap.values());

    return NextResponse.json({ pages });
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
      { error: "페이지 검색에 실패했습니다", code: "META_API_ERROR" },
      { status: 500 },
    );
  }
}
