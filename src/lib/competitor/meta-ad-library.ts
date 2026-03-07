/**
 * Meta Ad Library API 클라이언트
 * - META_AD_LIBRARY_TOKEN 없어도 빌드 성공
 * - 런타임에서만 토큰 확인
 */

import type { MetaAdRaw, CompetitorAd } from "@/types/competitor";

const META_API_BASE = "https://graph.facebook.com/v19.0/ads_archive";

const AD_FIELDS = [
  "id",
  "page_id",
  "page_name",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "ad_creative_link_captions",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "publisher_platforms",
  "ad_snapshot_url",
].join(",");

/** 운영기간(일수) 계산 */
function calcDurationDays(startDate: string, endDate: string | null): number {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  const diff = end.getTime() - start.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/** Meta raw 데이터 → CompetitorAd 변환 */
function transformAd(raw: MetaAdRaw): CompetitorAd {
  const endDate = raw.ad_delivery_stop_time ?? null;
  return {
    id: raw.id,
    pageId: raw.page_id,
    pageName: raw.page_name,
    body: raw.ad_creative_bodies?.[0] ?? "",
    title: raw.ad_creative_link_titles?.[0] ?? "",
    caption: raw.ad_creative_link_captions?.[0] ?? "",
    startDate: raw.ad_delivery_start_time,
    endDate,
    durationDays: calcDurationDays(raw.ad_delivery_start_time, endDate),
    isActive: endDate === null,
    platforms: raw.publisher_platforms ?? [],
    snapshotUrl: raw.ad_snapshot_url,
  };
}

export interface SearchParams {
  searchTerms: string;
  country?: string;
  limit?: number;
}

export interface MetaApiResult {
  ads: CompetitorAd[];
  totalCount: number;
}

/**
 * Meta Ad Library API에서 광고 검색
 * @throws Error 토큰 미설정, API 에러, Rate Limit 시
 */
export async function searchMetaAds(
  params: SearchParams,
): Promise<MetaApiResult> {
  const token = process.env.META_AD_LIBRARY_TOKEN;
  console.log(
    "[meta-ad-library] 토큰 확인:",
    token ? `존재 (${token.length}자)` : "미설정",
    "| runtime:",
    typeof globalThis !== "undefined" && "EdgeRuntime" in globalThis ? "edge" : "nodejs",
  );
  if (!token) {
    throw new MetaAdError(
      "META_AD_LIBRARY_TOKEN이 설정되지 않았습니다",
      "TOKEN_MISSING",
    );
  }

  const country = params.country ?? "KR";
  const limit = Math.min(params.limit ?? 50, 100);

  const url = new URL(META_API_BASE);
  url.searchParams.set("access_token", token);
  url.searchParams.set("search_terms", params.searchTerms);
  url.searchParams.set("ad_reached_countries", JSON.stringify([country]));
  url.searchParams.set("ad_type", "ALL");
  url.searchParams.set("fields", AD_FIELDS);
  url.searchParams.set("limit", String(limit));

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
      `Meta API 호출 실패: ${errBody.substring(0, 200)}`,
      "META_API_ERROR",
    );
  }

  const json = await res.json();
  const rawAds: MetaAdRaw[] = json.data ?? [];
  const ads = rawAds.map(transformAd);

  // 운영기간 DESC 정렬
  ads.sort((a, b) => b.durationDays - a.durationDays);

  return {
    ads,
    totalCount: ads.length,
  };
}

/** Meta Ad Library 전용 에러 클래스 */
export class MetaAdError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "MetaAdError";
    this.code = code;
  }
}
