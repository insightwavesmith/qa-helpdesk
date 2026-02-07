export interface Content {
  id: string;
  title: string;
  body_md: string;
  summary: string | null;
  thumbnail_url: string | null;
  category: string;
  tags: string[];
  status: 'draft' | 'review' | 'ready' | 'archived';
  source_type: string | null;
  source_ref: string | null;
  source_hash: string | null;
  author_id: string | null;
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
