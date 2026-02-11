export type ContentType = 'info' | 'result' | 'promo';
export type ContentCategory = 'education' | 'notice' | 'case_study';

export interface Content {
  id: string;
  title: string;
  body_md: string;
  summary: string | null;
  thumbnail_url: string | null;
  type: ContentType;
  category: ContentCategory;
  tags: string[];
  status: 'draft' | 'review' | 'ready' | 'published' | 'archived';
  source_type: string | null;
  source_ref: string | null;
  source_hash: string | null;
  author_id: string | null;
  email_subject: string | null;
  email_summary: string | null;
  email_cta_text: string | null;
  email_cta_url: string | null;
  email_sent_at: string | null;
  email_design_json: Record<string, unknown> | null;
  email_html: string | null;
  created_at: string;
  updated_at: string;
}

export interface Distribution {
  id: string;
  content_id: string;
  channel: string;
  channel_ref: string | null;
  rendered_title: string | null;
  rendered_body: string | null;
  status: 'pending' | 'published' | 'sent' | 'failed';
  distributed_at: string | null;
  created_at: string;
}

export interface EmailLog {
  id: string;
  content_id: string | null;
  subject: string;
  template: string;
  html_body: string;
  recipient_count: number;
  status: 'draft' | 'sent' | 'failed';
  sent_at: string | null;
  created_at: string;
  attachments: { filename: string; url: string; size: number }[];
}

export type FeedType = 'rss' | 'html' | 'api';
export type CrawlFrequency = 'daily' | 'weekly';

export interface ContentSource {
  id: string;
  name: string;
  url: string;
  feed_type: FeedType;
  is_active: boolean;
  last_crawled_at: string | null;
  crawl_frequency: CrawlFrequency;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
