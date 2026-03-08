import { NextRequest, NextResponse } from "next/server";
import {
  searchBrandPages,
  MetaAdError,
} from "@/lib/competitor/meta-ad-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * URL에서 검색 키워드를 추출
 * - instagram.com/xxx → username
 * - facebook.com/xxx → alias
 * - 일반 URL → 도메인 키워드
 */
function extractQueryFromUrl(input: string): string | null {
  // 인스타그램 URL
  const igMatch = input.match(
    /(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9._]+)/,
  );
  if (igMatch) return igMatch[1];

  // 페이스북 URL
  const fbMatch = input.match(/facebook\.com\/([a-zA-Z0-9._-]+)/);
  if (fbMatch) return fbMatch[1];

  // 일반 URL → 도메인에서 키워드 추출
  const urlMatch = input.match(
    /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+)(?:\.[a-zA-Z]{2,})/,
  );
  if (urlMatch) return urlMatch[1];

  return null;
}

/**
 * GET /api/competitor/brands?q=올리브영
 * 브랜드 페이지 검색 — SearchAPI.io meta_ad_library_page_search 엔진
 *
 * URL 입력 시 자동 감지:
 * - instagram.com/oliveyoung_official → q=oliveyoung_official
 * - facebook.com/OY.GLOBAL → q=OY.GLOBAL
 * - oliveyoung.co.kr → q=oliveyoung
 */
export async function GET(req: NextRequest) {
  const rawQ = req.nextUrl.searchParams.get("q")?.trim();

  if (!rawQ) {
    return NextResponse.json(
      { error: "검색어를 입력하세요", code: "INVALID_QUERY" },
      { status: 400 },
    );
  }

  // URL 입력 감지 → 키워드 추출
  const q = extractQueryFromUrl(rawQ) ?? rawQ;

  try {
    const brands = await searchBrandPages(q);

    return NextResponse.json({ brands });
  } catch (err) {
    if (err instanceof MetaAdError) {
      const statusMap: Record<string, number> = {
        API_KEY_MISSING: 503,
        RATE_LIMITED: 429,
        SEARCH_API_ERROR: 502,
      };
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: statusMap[err.code] ?? 500 },
      );
    }
    return NextResponse.json(
      { error: "브랜드 검색에 실패했습니다", code: "SEARCH_API_ERROR" },
      { status: 500 },
    );
  }
}
