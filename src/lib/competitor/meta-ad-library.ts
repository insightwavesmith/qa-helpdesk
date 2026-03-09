/**
 * SearchAPI.io Meta Ad Library 클라이언트
 * - 기존 Meta Graph API → SearchAPI.io 엔진 전환
 * - SEARCH_API_KEY 없어도 빌드 성공 (런타임에서만 확인)
 * - 기존 searchMetaAds() 시그니처 유지 (하위 호환)
 */

import type {
  CompetitorAd,
  BrandPage,
  SearchApiAdRaw,
  SearchApiSnapshot,
  DisplayFormat,
  CarouselCard,
} from "@/types/competitor";

const SEARCH_API_BASE = "https://www.searchapi.io/api/v1/search";

/** 운영기간(일수) 계산 */
function calcDurationDays(startDate: string, endDate: string | null): number {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  const diff = end.getTime() - start.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/** snapshot.body에서 텍스트 추출 (string | { text?: string } 대응) */
function extractBodyText(body?: SearchApiSnapshot["body"]): string {
  if (!body) return "";
  if (typeof body === "string") return body;
  return body.text ?? "";
}

/** 미디어 URL 방어적 추출 */
function extractMediaUrls(snapshot?: SearchApiSnapshot) {
  const imageUrl =
    snapshot?.images?.[0]?.original_image_url ??
    snapshot?.cards?.[0]?.original_image_url ??
    null;

  const videoUrl =
    snapshot?.videos?.[0]?.video_hd_url ??
    snapshot?.videos?.[0]?.video_sd_url ??
    null;

  const videoPreviewUrl =
    snapshot?.videos?.[0]?.video_preview_image_url ?? null;

  const displayFormat = detectDisplayFormat(snapshot);

  return { imageUrl, videoUrl, videoPreviewUrl, displayFormat };
}

/** 광고 포맷 감지 */
function detectDisplayFormat(snapshot?: SearchApiSnapshot): DisplayFormat {
  const fmt = snapshot?.display_format?.toUpperCase();
  if (fmt === "VIDEO" || (snapshot?.videos?.length ?? 0) > 0) return "VIDEO";
  if (fmt === "CAROUSEL" || fmt === "DCO" || fmt === "MULTI_IMAGES")
    return "CAROUSEL";
  if (fmt === "IMAGE" || (snapshot?.images?.length ?? 0) > 0) return "IMAGE";
  return "UNKNOWN";
}

/** 캐러셀 카드 추출 */
function extractCarouselCards(snapshot?: SearchApiSnapshot): CarouselCard[] {
  if (!snapshot?.cards?.length) return [];
  return snapshot.cards.map((card) => ({
    title: card.title ?? "",
    body: card.body ?? "",
    imageUrl: card.original_image_url ?? card.resized_image_url ?? null,
    linkUrl: card.link_url ?? null,
  }));
}

/** 영상 URL의 oe 파라미터(hex timestamp)에서 만료 시점 추출 */
export function extractExpiresAt(url: string | null): Date | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const oe = u.searchParams.get("oe");
    if (!oe) return null;
    const timestamp = parseInt(oe, 16);
    if (isNaN(timestamp)) return null;
    return new Date(timestamp * 1000);
  } catch {
    return null;
  }
}

/** SearchAPI.io raw 데이터 → CompetitorAd 변환 */
export function transformSearchApiAd(raw: SearchApiAdRaw): CompetitorAd {
  const endDate = raw.end_date ?? null;
  const snapshot = raw.snapshot;
  const { imageUrl, videoUrl, videoPreviewUrl, displayFormat } =
    extractMediaUrls(snapshot);
  const carouselCards = extractCarouselCards(snapshot);

  return {
    id: raw.ad_archive_id,
    pageId: raw.page_id,
    pageName: raw.page_name,
    body: extractBodyText(snapshot?.body),
    title: snapshot?.title ?? "",
    caption: snapshot?.caption ?? "",
    startDate: raw.start_date,
    endDate,
    durationDays: calcDurationDays(raw.start_date, endDate),
    isActive: raw.is_active ?? endDate === null,
    platforms: (raw.publisher_platform ?? []).map((p) => p.toLowerCase()),
    snapshotUrl: `https://www.facebook.com/ads/archive/render_ad/?id=${raw.ad_archive_id}`,
    imageUrl,
    videoUrl,
    videoPreviewUrl,
    displayFormat,
    linkUrl: snapshot?.link_url ?? null,
    carouselCards,
  };
}

export interface SearchParams {
  searchTerms: string;
  country?: string;
  limit?: number;
  mediaType?: string;
  /** 다음 페이지 토큰 (SearchAPI.io pagination) */
  pageToken?: string;
  /** 특정 페이지(브랜드) ID로 필터 검색 */
  searchPageIds?: string;
}

export interface MetaApiResult {
  ads: CompetitorAd[];
  totalCount: number;
  /** 서버 전체 결과 수 (search_information.total_results) */
  serverTotalCount: number;
  /** 다음 페이지 토큰 (없으면 null) */
  nextPageToken: string | null;
}

/**
 * SearchAPI.io Meta Ad Library 엔진에서 광고 검색
 * @throws MetaAdError API 키 미설정, API 에러, Rate Limit 시
 */
export async function searchMetaAds(
  params: SearchParams,
): Promise<MetaApiResult> {
  const apiKey = process.env.SEARCH_API_KEY;
  if (!apiKey) {
    throw new MetaAdError(
      "SearchAPI.io API 키가 설정되지 않았습니다",
      "API_KEY_MISSING",
    );
  }

  const country = params.country ?? "KR";
  const limit = Math.min(params.limit ?? 50, 100);

  const url = new URL(SEARCH_API_BASE);
  url.searchParams.set("engine", "meta_ad_library");
  url.searchParams.set("api_key", apiKey);

  if (params.pageToken) {
    // 페이지네이션: page_token + 검색 조건(q 또는 page_id) 함께 전송
    // SearchAPI.io는 page_token만으로는 검색 조건을 인식하지 못함
    url.searchParams.set("page_token", params.pageToken);
    if (params.searchPageIds) {
      url.searchParams.set("page_id", params.searchPageIds);
    } else if (params.searchTerms) {
      url.searchParams.set("q", params.searchTerms);
    }
    url.searchParams.set("country", country);
    url.searchParams.set("ad_active_status", "active");
  } else {
    // 새 검색: 기존 로직 유지
    if (!params.searchPageIds) {
      url.searchParams.set("q", params.searchTerms);
    }
    url.searchParams.set("country", country);
    url.searchParams.set("ad_active_status", "active");

    if (params.mediaType && params.mediaType !== "all") {
      url.searchParams.set("media_type", params.mediaType);
    }

    if (params.searchPageIds) {
      url.searchParams.set("page_id", params.searchPageIds);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json" },
  });

  if (res.status === 429) {
    throw new MetaAdError(
      "요청 한도 초과. 잠시 후 다시 시도하세요",
      "RATE_LIMITED",
    );
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new MetaAdError(
      `검색 API 호출 실패: ${errBody.substring(0, 200)}`,
      "SEARCH_API_ERROR",
    );
  }

  const json = await res.json();
  const rawAds: SearchApiAdRaw[] = json.ads ?? json.data ?? [];
  const ads = rawAds.slice(0, limit).map(transformSearchApiAd);

  // 전체 결과 수 (search_information.total_results)
  const serverTotalCount: number =
    json.search_information?.total_results ?? ads.length;

  // 다음 페이지 토큰
  const nextPageToken: string | null =
    json.pagination?.next_page_token ?? null;

  return {
    ads,
    totalCount: ads.length,
    serverTotalCount,
    nextPageToken,
  };
}

/**
 * SearchAPI.io meta_ad_library_page_search 엔진으로 브랜드 페이지 검색
 * @param query 브랜드명 또는 키워드 (한글 지원)
 * @throws MetaAdError API 키 미설정, API 에러, Rate Limit 시
 */
export async function searchBrandPages(query: string): Promise<BrandPage[]> {
  const apiKey = process.env.SEARCH_API_KEY;
  if (!apiKey) {
    throw new MetaAdError(
      "SearchAPI.io API 키가 설정되지 않았습니다",
      "API_KEY_MISSING",
    );
  }

  const url = new URL(SEARCH_API_BASE);
  url.searchParams.set("engine", "meta_ad_library_page_search");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json" },
  });

  if (res.status === 429) {
    throw new MetaAdError(
      "요청 한도 초과. 잠시 후 다시 시도하세요",
      "RATE_LIMITED",
    );
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new MetaAdError(
      `브랜드 검색 API 호출 실패: ${errBody.substring(0, 200)}`,
      "SEARCH_API_ERROR",
    );
  }

  const json = await res.json();
  const rawPages: Array<Record<string, unknown>> =
    json.page_results ?? json.data ?? [];

  return rawPages.map((p) => ({
    page_id: String(p.page_id ?? ""),
    page_name: String(
      p.page_name ||
        (p as Record<string, unknown>).name ||
        p.page_alias ||
        p.ig_username ||
        p.page_id ||
        "알 수 없는 브랜드",
    ),
    category: (p.category as string) ?? null,
    image_uri: (p.image_uri as string) ?? null,
    likes: typeof p.likes === "number" ? p.likes : null,
    ig_username: (p.ig_username as string) ?? null,
    ig_followers: typeof p.ig_followers === "number" ? p.ig_followers : null,
    ig_verification: Boolean(p.ig_verification),
    page_alias: (p.page_alias as string) ?? null,
  }));
}

/** Meta Ad Library / SearchAPI.io 전용 에러 클래스 */
export class MetaAdError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "MetaAdError";
    this.code = code;
  }
}
