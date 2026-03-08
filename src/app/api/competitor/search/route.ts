import { NextRequest, NextResponse } from "next/server";
import { searchMetaAds, MetaAdError } from "@/lib/competitor/meta-ad-library";
import { upsertAdCache } from "@/lib/competitor/ad-cache";
import {
  lookupBrand,
  containsKorean,
  suggestEnglishName,
} from "@/lib/competitor/brand-dictionary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/competitor/search
 * 경쟁사 광고 검색 — SearchAPI.io Meta Ad Library 엔진
 *
 * Query params:
 *   q           - 검색어 (필수)
 *   page_token  - 다음 페이지 토큰 (선택, 더보기용)
 *   page_id     - 브랜드 페이지 ID (선택)
 *   country     - 국가 코드 (기본 KR)
 *   media_type  - "all" | "image" | "video" (기본 all)
 *   seen_ids    - 이미 로드된 ad_archive_id 목록 (콤마 구분, 서버 중복제거용)
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
  // 서버 중복제거: 프론트에서 이미 로드된 광고 ID 목록
  const seenIdsParam = searchParams.get("seen_ids") ?? "";
  const seenIds = new Set(
    seenIdsParam ? seenIdsParam.split(",").filter(Boolean) : [],
  );

  // 더보기(page_token)는 q/page_id 없이도 허용
  if (!q && !pageId && !pageToken) {
    return NextResponse.json(
      { error: "검색어를 입력하세요", code: "INVALID_QUERY" },
      { status: 400 },
    );
  }

  try {
    // T4: 한글 키워드 → 영문 변환 (사전 매칭 + Google Suggest 폴백)
    let effectiveQuery = q || "";
    let translatedQuery: string | null = null;

    if (q && !pageId && !pageToken && containsKorean(q)) {
      // 1단계: 브랜드 사전 조회
      translatedQuery = lookupBrand(q);
      // 2단계: 사전에 없으면 Google Suggest API
      if (!translatedQuery) {
        translatedQuery = await suggestEnglishName(q);
      }
      if (translatedQuery) {
        effectiveQuery = translatedQuery;
      }
    }

    const result = await searchMetaAds({
      searchTerms: effectiveQuery,
      country,
      limit,
      mediaType,
      pageToken,
      searchPageIds: pageId,
    });

    // T4 폴백: 영문 변환 검색 결과 0건 → 원본 한글로 재검색 (광고 본문 매칭)
    let finalResult = result;
    if (
      translatedQuery &&
      result.ads.length === 0 &&
      q &&
      !pageToken &&
      !pageId
    ) {
      finalResult = await searchMetaAds({
        searchTerms: q,
        country,
        limit,
        mediaType,
      });
    }

    // 서버 중복제거: seen_ids에 포함된 광고 필터링
    const dedupedAds =
      seenIds.size > 0
        ? finalResult.ads.filter((ad) => !seenIds.has(ad.id))
        : finalResult.ads;

    // 캐시 UPSERT (다운로드 시 캐시 필요 → await)
    try {
      await upsertAdCache(dedupedAds);
    } catch (err) {
      console.error("[search] 캐시 UPSERT 실패:", err);
    }

    return NextResponse.json({
      ads: dedupedAds,
      totalCount: dedupedAds.length,
      serverTotalCount: finalResult.serverTotalCount,
      nextPageToken: finalResult.nextPageToken,
      query: q,
      translatedQuery,
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
