export type OrganicChannel = 'naver_blog' | 'naver_cafe' | 'youtube' | 'instagram' | 'tiktok';
export type OrganicStatus = 'draft' | 'scheduled' | 'review' | 'published' | 'archived';
export type OrganicLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export interface OrganicPost {
  id: string;
  title: string;
  content: string | null;
  channel: OrganicChannel;
  keywords: string[];
  level: OrganicLevel | null;
  status: OrganicStatus;
  external_url: string | null;
  external_id: string | null;
  parent_post_id: string | null;
  seo_score: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateOrganicPostInput {
  title: string;
  content?: string;
  channel: OrganicChannel;
  keywords?: string[];
  level?: OrganicLevel;
}

export interface UpdateOrganicPostInput {
  title?: string;
  content?: string;
  channel?: OrganicChannel;
  keywords?: string[];
  level?: OrganicLevel;
  status?: OrganicStatus;
  external_url?: string;
  seo_score?: number;
}

export interface OrganicStats {
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  reviewPosts: number;
  totalViews: number;
  totalKeywords: number;
}

export interface KeywordStat {
  id: string;
  keyword: string;
  channel: string;
  pc_search: number | null;
  mobile_search: number | null;
  total_search: number | null;
  competition: string | null;
  fetched_at: string;
}
