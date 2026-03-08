import { NextRequest, NextResponse } from "next/server";
import {
  searchBrandPages,
  searchMetaAds,
  MetaAdError,
} from "@/lib/competitor/meta-ad-library";
import {
  lookupBrand,
  containsKorean,
  suggestEnglishName,
} from "@/lib/competitor/brand-dictionary";
import type { AdPage } from "@/types/competitor";

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
 * URL에서 전체 도메인 추출 (ad_library 키워드 검색용)
 * 예: https://www.oliveyoung.co.kr/product/xxx → oliveyoung.co.kr
 */
function extractDomain(input: string): string | null {
  // 인스타/페북은 도메인 검색이 아닌 username 검색이므로 제외
  if (/(?:instagram\.com|instagr\.am|facebook\.com)/.test(input)) return null;

  const domainMatch = input.match(
    /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+)/,
  );
  if (domainMatch) return domainMatch[1];

  return null;
}

/**
 * 입력이 URL인지 판별
 */
function isUrlInput(input: string): boolean {
  return /(?:https?:\/\/|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/.test(input);
}

/**
 * GET /api/competitor/brands?q=올리브영
 * 브랜드 페이지 검색 — page_search + ad_library 병렬 검색
 *
 * 뭘 치든 찾아주는 검색:
 * - "올리브영" → page_search(올리브영) + ad_library(올리브영) 병렬
 * - "oliveyoung.co.kr" → page_search(oliveyoung) + ad_library(oliveyoung.co.kr) 병렬
 * - "instagram.com/oliveyoung_official" → page_search(oliveyoung_official) + ad_library(oliveyoung_official) 병렬
 */
export async function GET(req: NextRequest) {
  const rawQ = req.nextUrl.searchParams.get("q")?.trim();

  if (!rawQ) {
    return NextResponse.json(
      { error: "검색어를 입력하세요", code: "INVALID_QUERY" },
      { status: 400 },
    );
  }

  // URL 입력 감지 → 키워드 추출 (page_search용)
  const pageSearchQuery = extractQueryFromUrl(rawQ) ?? rawQ;

  // ad_library 검색용 쿼리: URL이면 도메인, 아니면 원본
  const domain = extractDomain(rawQ);
  const adLibraryQuery = domain ?? rawQ;
  const searchedDomain = domain;

  // T4: 한글 브랜드명 → 영문 변환 (사전 매칭 우선, 없으면 Google Suggest)
  let translatedQuery: string | null = null;
  if (!isUrlInput(rawQ) && containsKorean(rawQ)) {
    // 1단계: 브랜드 사전 조회
    translatedQuery = lookupBrand(rawQ);
    // 2단계: 사전에 없으면 Google Suggest API
    if (!translatedQuery) {
      translatedQuery = await suggestEnglishName(rawQ);
    }
  }

  try {
    // 검색 쿼리 목록: 원본 + 영문 변환 (있으면)
    const effectivePageSearch = translatedQuery ?? pageSearchQuery;
    const effectiveAdLibrary = translatedQuery ?? adLibraryQuery;

    // 병렬 검색: page_search + ad_library
    // 영문 변환이 있으면 영문으로 검색, 원본 한글로도 ad_library 검색 (폴백)
    const searches: Promise<unknown>[] = [
      searchBrandPages(effectivePageSearch),
      searchMetaAds({ searchTerms: effectiveAdLibrary, limit: 50 }),
    ];

    // T4 폴백: 한글 원본이 영문 변환과 다르면, 원본으로도 ad_library 검색
    if (translatedQuery && translatedQuery !== rawQ) {
      searches.push(searchMetaAds({ searchTerms: rawQ, limit: 30 }));
    }

    const results = await Promise.allSettled(searches);

    const [pageResult, adResult] = results as [
      PromiseSettledResult<Awaited<ReturnType<typeof searchBrandPages>>>,
      PromiseSettledResult<Awaited<ReturnType<typeof searchMetaAds>>>,
    ];
    const fallbackAdResult = results[2] as
      | PromiseSettledResult<Awaited<ReturnType<typeof searchMetaAds>>>
      | undefined;

    // page_search 결과
    const brands =
      pageResult.status === "fulfilled" ? pageResult.value : [];

    // ad_library 결과 → page_id별 그룹핑
    const adPages: AdPage[] = [];

    // 영문 검색 + 한글 폴백 결과 합산
    const allAds = [
      ...(adResult.status === "fulfilled" ? adResult.value.ads : []),
      ...(fallbackAdResult?.status === "fulfilled"
        ? fallbackAdResult.value.ads
        : []),
    ];

    if (allAds.length > 0) {
      const pageMap = new Map<string, { name: string; count: number }>();
      for (const ad of allAds) {
        const existing = pageMap.get(ad.pageId);
        if (existing) {
          existing.count++;
        } else {
          pageMap.set(ad.pageId, { name: ad.pageName, count: 1 });
        }
      }

      // page_search에 이미 있는 page_id는 제외 (중복 방지)
      const brandPageIds = new Set(brands.map((b) => b.page_id));

      for (const [pageId, { name, count }] of pageMap) {
        if (!brandPageIds.has(pageId)) {
          adPages.push({
            page_id: pageId,
            page_name: name,
            ad_count: count,
          });
        }
      }

      // 광고 건수 내림차순 정렬, 상위 10개
      adPages.sort((a, b) => b.ad_count - a.ad_count);
      adPages.splice(10);
    }

    // 둘 다 실패한 경우
    if (pageResult.status === "rejected" && adResult.status === "rejected") {
      const err = pageResult.reason;
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

    return NextResponse.json({
      brands,
      adPages,
      searchedDomain,
      translatedQuery,
    });
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
