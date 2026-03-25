// distribution.ts — 오가닉 채널 Phase 2 배포 관련 타입 정의
// organic.ts의 OrganicChannel, OrganicStatus를 확장

// ----------------------------------------------------------------
// 채널 타입 (Phase 2 확장 — newsletter, google_seo 추가)
// ----------------------------------------------------------------
export type TransformChannel =
  | 'naver_blog'
  | 'naver_cafe'
  | 'newsletter'
  | 'youtube'
  | 'instagram'
  | 'google_seo';

// ----------------------------------------------------------------
// 상태 타입
// ----------------------------------------------------------------

/** 배포 단계별 상태 */
export type DistributionStatus =
  | 'pending'
  | 'review'
  | 'approved'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'rejected';

/** AI 콘텐츠 변환 상태 */
export type AITransformStatus = 'pending' | 'processing' | 'done' | 'failed';

// ----------------------------------------------------------------
// 테이블 Row 타입
// ----------------------------------------------------------------

/** channel_distributions 테이블 */
export interface ChannelDistribution {
  id: string;
  source_post_id: string;
  channel: TransformChannel;
  transformed_title: string | null;
  transformed_body: string | null;
  transformed_metadata: Record<string, unknown>;
  status: DistributionStatus;
  scheduled_at: string | null;
  published_at: string | null;
  external_id: string | null;
  external_url: string | null;
  error_message: string | null;
  retry_count: number;
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;
}

/** channel_credentials 테이블 */
export interface ChannelCredential {
  id: string;
  channel: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  extra_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** newsletter_segments 테이블 */
export interface NewsletterSegment {
  id: string;
  name: string;
  description: string | null;
  filter_rules: Record<string, unknown>;
  is_default: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------
// AI 변환 요청/응답
// ----------------------------------------------------------------

/** AI 변환 요청 */
export interface TransformRequest {
  sourcePostId: string;
  channels: TransformChannel[];
  keywords?: string[];
}

/** AI 변환 결과 (채널별) */
export interface TransformResult {
  channel: TransformChannel;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  wordCount: number;
}

// ----------------------------------------------------------------
// 채널 발행 요청/응답
// ----------------------------------------------------------------

/** 채널 발행 요청 */
export interface ChannelPostRequest {
  distributionId: string;
  channel: TransformChannel;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}

/** 채널 발행 결과 */
export interface ChannelPostResult {
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: string;
}

// ----------------------------------------------------------------
// 콘텐츠 성과 분석
// ----------------------------------------------------------------

/** 채널별 성과 데이터 */
export interface ContentAnalytics {
  distributionId: string;
  channel: TransformChannel;
  views: number;
  clicks: number;
  shares: number;
  comments: number;
  conversionRate: number;
  collectedAt: string;
}
