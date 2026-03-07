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
}

/** 검색 응답 */
export interface CompetitorSearchResponse {
  ads: CompetitorAd[];
  totalCount: number;
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
  | "DB_ERROR";
