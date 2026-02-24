// 앱 전역 타입 정의

// 사용자 역할
export type UserRole = "lead" | "member" | "student" | "assistant" | "admin" | "alumni";

// 질문 상태
export type QuestionStatus = "open" | "answered" | "closed";

// 게시글 카테고리 (contents 테이블 기준)
export type PostCategory = "education" | "notice" | "case_study" | "newsletter";

// 프로필
export interface Profile {
  id: string;
  email: string;
  name: string;
  phone: string;
  shop_url: string;
  shop_name: string;
  business_number: string;
  business_cert_url: string | null;
  cohort: string | null;
  monthly_ad_budget: string | null;
  category: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

// 카테고리
export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
}

// 질문
export interface Question {
  id: string;
  author_id: string;
  category_id: number | null;
  title: string;
  content: string;
  status: QuestionStatus;
  view_count: number;
  like_count: number;
  created_at: string;
  updated_at: string;
  // 조인된 필드
  author?: Profile;
  category?: Category;
  answers_count?: number;
}

// 답변
export interface Answer {
  id: string;
  question_id: string;
  author_id: string | null;
  content: string;
  is_ai: boolean;
  is_approved: boolean;
  approved_at: string | null;
  source_refs: SourceRef[] | null;
  like_count: number;
  created_at: string;
  updated_at: string;
  // 조인된 필드
  author?: Profile;
}

// AI 답변 출처 참조
export interface SourceRef {
  lecture_name: string;
  week: string;
  chunk_index: number;
  relevance_score: number;
}

// 게시글 (contents 테이블 기반, 기존 호환 필드 포함)
export interface Post {
  id: string;
  author_id: string | null;
  title: string;
  content: string;
  body_md: string;
  category: PostCategory;
  is_published: boolean;
  is_pinned: boolean;
  published_at: string | null;
  view_count: number;
  like_count: number;
  created_at: string;
  updated_at: string;
  // contents 확장 필드
  summary: string | null;
  email_summary: string | null;
  images: unknown[];
  video_url: string | null;
  type: string;
  tags: string[];
  // 조인된 필드
  author?: Profile;
}

// 댓글
export interface Comment {
  id: string;
  question_id: string | null;
  author_id: string;
  content: string;
  created_at: string;
  // 조인된 필드
  author?: Profile;
}

// 알림 설정
export interface NotificationPreference {
  id: string;
  user_id: string;
  email_enabled: boolean;
  slack_webhook_url: string | null;
  notify_new_post: boolean;
  notify_answer: boolean;
  notify_notice: boolean;
  created_at: string;
}
