/** Meta Ad Library API raw 응답 항목 */
export interface MetaAdRaw {
  id: string;
  page_id: string;
  page_name: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_captions?: string[];
  ad_delivery_start_time: string;
  ad_delivery_stop_time?: string;
  publisher_platforms?: string[];
  ad_snapshot_url: string;
}

/** 가공된 광고 카드 데이터 */
export interface CompetitorAd {
  id: string;
  pageId: string;
  pageName: string;
  body: string;
  title: string;
  caption: string;
  startDate: string;
  endDate: string | null;
  durationDays: number;
  isActive: boolean;
  platforms: string[];
  snapshotUrl: string;

  // === SearchAPI.io 전환 필드 ===
  imageUrl: string | null;
  videoUrl: string | null;
  videoPreviewUrl: string | null;
  displayFormat: DisplayFormat;
  linkUrl: string | null;
  carouselCards: CarouselCard[];
}

export type DisplayFormat = "IMAGE" | "VIDEO" | "CAROUSEL" | "DPA" | "DCO" | "UNKNOWN";

export interface CarouselCard {
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string | null;
}

/** SearchAPI.io Meta Ad Library 응답 항목 */
export interface SearchApiAdRaw {
  ad_archive_id: string;
  page_id: string;
  page_name: string;
  start_date: string;
  end_date?: string;
  is_active: boolean;
  publisher_platform?: string[];
  snapshot?: SearchApiSnapshot;
}

export interface SearchApiSnapshot {
  body?: { text?: string } | string;
  title?: string;
  caption?: string;
  link_url?: string;
  display_format?: string;
  images?: Array<{
    original_image_url?: string;
    resized_image_url?: string;
  }>;
  videos?: Array<{
    video_hd_url?: string;
    video_sd_url?: string;
    video_preview_image_url?: string;
  }>;
  cards?: Array<{
    title?: string;
    body?: string;
    link_url?: string;
    original_image_url?: string;
    resized_image_url?: string;
  }>;
}

/** competitor_ad_cache DB Row 타입 */
export interface CompetitorAdCacheRow {
  ad_archive_id: string;
  page_id: string;
  page_name: string;
  ad_text: string | null;
  ad_title: string | null;
  image_url: string | null;
  video_url: string | null;
  video_preview_url: string | null;
  display_format: string;
  link_url: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  platforms: string[];
  snapshot_url: string | null;
  carousel_cards: CarouselCard[];
  metadata: Record<string, unknown>;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 검색 응답 */
export interface CompetitorSearchResponse {
  ads: CompetitorAd[];
  /** 이번 페이지 광고 수 */
  totalCount: number;
  /** SearchAPI.io 전체 결과 수 */
  serverTotalCount: number;
  /** 다음 페이지 토큰 (null이면 마지막 페이지) */
  nextPageToken: string | null;
  query: string;
  searchedAt: string;
}

/** 모니터링 브랜드 */
export interface CompetitorMonitor {
  id: string;
  brandName: string;
  pageId: string | null;
  lastCheckedAt: string | null;
  lastAdCount: number;
  createdAt: string;
  unreadAlertCount?: number;
  // v2 확장 필드
  pageProfileUrl: string | null;
  igUsername: string | null;
  category: string | null;
  newAdsCount: number;
  latestAdDate: string | null;
  totalAdsCount: number;
}

/** AI 인사이트 결과 */
export interface CompetitorInsight {
  longRunningAdCount: number;
  totalAdCount: number;
  videoRatio: number;
  imageRatio: number;
  platformDistribution: {
    facebook: number;
    instagram: number;
    messenger: number;
  };
  hookTypes: {
    type: string;
    count: number;
    percentage: number;
    examples: string[];
  }[];
  seasonPattern: {
    month: number;
    adCount: number;
  }[];
  keyProducts: string[];
  summary: string;
  analyzedAt: string;
}

/** Meta 페이지 (브랜드 검색 결과) */
export interface MetaPage {
  pageId: string;
  pageName: string;
  profileImageUrl: string;
}

/** DB Row 타입 (database.ts 재생성 전 임시) */
export interface CompetitorMonitorRow {
  id: string;
  user_id: string;
  brand_name: string;
  page_id: string | null;
  last_checked_at: string | null;
  last_ad_count: number | null;
  created_at: string;
  // v2 확장 컬럼
  page_profile_url: string | null;
  ig_username: string | null;
  category: string | null;
  new_ads_count: number;
  latest_ad_date: string | null;
  total_ads_count: number;
}

export interface CompetitorAlertRow {
  id: string;
  monitor_id: string;
  new_ad_ids: string[];
  detected_at: string;
  is_read: boolean;
}

export interface CompetitorInsightCacheRow {
  id: string;
  search_query: string;
  insight_data: CompetitorInsight;
  ad_count: number;
  created_at: string;
  expires_at: string;
}

/** ad_library 키워드 검색에서 발견된 광고 페이지 (비공식 포함) */
export interface AdPage {
  page_id: string;
  page_name: string;
  ad_count: number;
}

/** 브랜드 페이지 검색 결과 (SearchAPI.io meta_ad_library_page_search) */
export interface BrandPage {
  page_id: string;
  page_name: string;
  category: string | null;
  image_uri: string | null;
  likes: number | null;
  ig_username: string | null;
  ig_followers: number | null;
  ig_verification: boolean;
  page_alias: string | null;
}

/** 검색 모드: 브랜드 검색 vs 키워드 검색 */
export type SearchMode = "brand" | "keyword";

/** API 에러 코드 */
export type CompetitorErrorCode =
  | "TOKEN_MISSING"
  | "INVALID_QUERY"
  | "META_API_ERROR"
  | "RATE_LIMITED"
  | "MONITOR_LIMIT"
  | "DUPLICATE_MONITOR"
  | "UNAUTHORIZED"
  | "INSIGHT_ERROR"
  | "DB_ERROR"
  | "API_KEY_MISSING"
  | "SEARCH_API_ERROR"
  | "AD_NOT_FOUND"
  | "URL_EXPIRED"
  | "DOWNLOAD_FAILED";
