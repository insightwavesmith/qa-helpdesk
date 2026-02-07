// Supabase 자동 생성 타입 (REST API 스키마 기반 - 2026-02-04)
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
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
          reject_reason: string | null;
          role: "lead" | "member" | "student" | "alumni" | "admin";
          meta_account_id: string | null;
          mixpanel_project_id: string | null;
          mixpanel_board_id: string | null;
          onboarding_completed: boolean;
          onboarding_step: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name: string;
          phone: string;
          shop_url: string;
          shop_name: string;
          business_number: string;
          business_cert_url?: string | null;
          cohort?: string | null;
          monthly_ad_budget?: string | null;
          category?: string | null;
          reject_reason?: string | null;
          role?: "lead" | "member" | "student" | "alumni" | "admin";
          meta_account_id?: string | null;
          mixpanel_project_id?: string | null;
          mixpanel_board_id?: string | null;
          onboarding_completed?: boolean;
          onboarding_step?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string;
          phone?: string;
          shop_url?: string;
          shop_name?: string;
          business_number?: string;
          business_cert_url?: string | null;
          cohort?: string | null;
          monthly_ad_budget?: string | null;
          category?: string | null;
          reject_reason?: string | null;
          role?: "lead" | "member" | "student" | "alumni" | "admin";
          meta_account_id?: string | null;
          mixpanel_project_id?: string | null;
          mixpanel_board_id?: string | null;
          onboarding_completed?: boolean;
          onboarding_step?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      qa_categories: {
        Row: {
          id: number;
          name: string;
          slug: string;
          description: string | null;
          sort_order: number;
        };
        Insert: {
          id?: number;
          name: string;
          slug: string;
          description?: string | null;
          sort_order?: number;
        };
        Update: {
          id?: number;
          name?: string;
          slug?: string;
          description?: string | null;
          sort_order?: number;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          icon: string | null;
          sort_order: number;
          is_new: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          icon?: string | null;
          sort_order?: number;
          is_new?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          icon?: string | null;
          sort_order?: number;
          is_new?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          id: string;
          author_id: string;
          category_id: number | null;
          title: string;
          content: string;
          image_urls: Json;
          embedding: string | null;
          status: "open" | "answered" | "closed";
          view_count: number;
          like_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          category_id?: number | null;
          title: string;
          content: string;
          image_urls?: Json;
          embedding?: string | null;
          status?: "open" | "answered" | "closed";
          view_count?: number;
          like_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          category_id?: number | null;
          title?: string;
          content?: string;
          image_urls?: Json;
          embedding?: string | null;
          status?: "open" | "answered" | "closed";
          view_count?: number;
          like_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questions_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "qa_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      answers: {
        Row: {
          id: string;
          question_id: string;
          author_id: string | null;
          content: string;
          is_ai: boolean;
          is_approved: boolean;
          approved_at: string | null;
          source_refs: Json | null;
          like_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          question_id: string;
          author_id?: string | null;
          content: string;
          is_ai?: boolean;
          is_approved?: boolean;
          approved_at?: string | null;
          source_refs?: Json | null;
          like_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          question_id?: string;
          author_id?: string | null;
          content?: string;
          is_ai?: boolean;
          is_approved?: boolean;
          approved_at?: string | null;
          source_refs?: Json | null;
          like_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "answers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "answers_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      posts: {
        Row: {
          id: string;
          author_id: string | null;
          title: string;
          content: string;
          category: "info" | "notice" | "webinar";
          is_published: boolean;
          is_pinned: boolean;
          published_at: string | null;
          view_count: number;
          like_count: number;
          content_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id?: string | null;
          title: string;
          content: string;
          category?: "info" | "notice" | "webinar";
          is_published?: boolean;
          is_pinned?: boolean;
          published_at?: string | null;
          view_count?: number;
          like_count?: number;
          content_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string | null;
          title?: string;
          content?: string;
          category?: "info" | "notice" | "webinar";
          is_published?: boolean;
          is_pinned?: boolean;
          published_at?: string | null;
          view_count?: number;
          like_count?: number;
          content_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          id: string;
          post_id: string | null;
          question_id: string | null;
          author_id: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          post_id?: string | null;
          question_id?: string | null;
          author_id: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          post_id?: string | null;
          question_id?: string | null;
          author_id?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      likes: {
        Row: {
          id: string;
          user_id: string;
          question_id: string | null;
          answer_id: string | null;
          post_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          question_id?: string | null;
          answer_id?: string | null;
          post_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          question_id?: string | null;
          answer_id?: string | null;
          post_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "likes_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "likes_answer_id_fkey";
            columns: ["answer_id"];
            isOneToOne: false;
            referencedRelation: "answers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "likes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      lecture_chunks: {
        Row: {
          id: string;
          lecture_name: string;
          week: string;
          chunk_index: number;
          content: string;
          embedding: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          lecture_name: string;
          week: string;
          chunk_index: number;
          content: string;
          embedding?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          lecture_name?: string;
          week?: string;
          chunk_index?: number;
          content?: string;
          embedding?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          id: string;
          user_id: string;
          email_enabled: boolean;
          slack_webhook_url: string | null;
          notify_new_post: boolean;
          notify_answer: boolean;
          notify_notice: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email_enabled?: boolean;
          slack_webhook_url?: string | null;
          notify_new_post?: boolean;
          notify_answer?: boolean;
          notify_notice?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email_enabled?: boolean;
          slack_webhook_url?: string | null;
          notify_new_post?: boolean;
          notify_answer?: boolean;
          notify_notice?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cohorts: {
        Row: {
          id: string;
          name: string;
          short_name: string;
          start_date: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          short_name: string;
          start_date?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          short_name?: string;
          start_date?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      assignments: {
        Row: {
          id: string;
          cohort_id: string | null;
          name: string;
          due_date: string | null;
          week_number: number | null;
          notion_link: string | null;
          sort_order: number;
          title: string | null;
        };
        Insert: {
          id?: string;
          cohort_id?: string | null;
          name: string;
          due_date?: string | null;
          week_number?: number | null;
          notion_link?: string | null;
          sort_order?: number;
          title?: string | null;
        };
        Update: {
          id?: string;
          cohort_id?: string | null;
          name?: string;
          due_date?: string | null;
          week_number?: number | null;
          notion_link?: string | null;
          sort_order?: number;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assignments_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
        ];
      };
      blocks: {
        Row: {
          id: string;
          category_id: string | null;
          name: string;
          time_minutes: number;
          type: string;
          details: Json | null;
          assets: Json | null;
          sort_order: number;
          created_at: string;
          parent_id: string | null;
        };
        Insert: {
          id?: string;
          category_id?: string | null;
          name: string;
          time_minutes?: number;
          type?: string;
          details?: Json | null;
          assets?: Json | null;
          sort_order?: number;
          created_at?: string;
          parent_id?: string | null;
        };
        Update: {
          id?: string;
          category_id?: string | null;
          name?: string;
          time_minutes?: number;
          type?: string;
          details?: Json | null;
          assets?: Json | null;
          sort_order?: number;
          created_at?: string;
          parent_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "blocks_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocks_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "blocks";
            referencedColumns: ["id"];
          },
        ];
      };
      curriculum: {
        Row: {
          id: string;
          cohort_id: string | null;
          week_number: number;
          block_id: string | null;
          sort_order: number;
          parent_id: string | null;
        };
        Insert: {
          id?: string;
          cohort_id?: string | null;
          week_number: number;
          block_id?: string | null;
          sort_order?: number;
          parent_id?: string | null;
        };
        Update: {
          id?: string;
          cohort_id?: string | null;
          week_number?: number;
          block_id?: string | null;
          sort_order?: number;
          parent_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "curriculum_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "curriculum_block_id_fkey";
            columns: ["block_id"];
            isOneToOne: false;
            referencedRelation: "blocks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "curriculum_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "curriculum";
            referencedColumns: ["id"];
          },
        ];
      };
      schedules: {
        Row: {
          id: string;
          cohort_id: string | null;
          week_number: number;
          date: string | null;
          start_time: string | null;
          end_time: string | null;
          type: string;
          location: string | null;
        };
        Insert: {
          id?: string;
          cohort_id?: string | null;
          week_number: number;
          date?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          type?: string;
          location?: string | null;
        };
        Update: {
          id?: string;
          cohort_id?: string | null;
          week_number?: number;
          date?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          type?: string;
          location?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "schedules_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
        ];
      };
      // invite_codes: 삭제됨 - /signup?type=student 방식으로 변경
      ad_accounts: {
        Row: {
          id: string;
          user_id: string | null;
          account_id: string;
          account_name: string | null;
          mixpanel_project_id: string | null;
          mixpanel_board_id: string | null;
          active: boolean;
          meta_status: Record<string, unknown> | null;
          mixpanel_status: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          account_id: string;
          account_name?: string | null;
          mixpanel_project_id?: string | null;
          mixpanel_board_id?: string | null;
          active?: boolean;
          meta_status?: Record<string, unknown> | null;
          mixpanel_status?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          account_id?: string;
          account_name?: string | null;
          mixpanel_project_id?: string | null;
          mixpanel_board_id?: string | null;
          active?: boolean;
          meta_status?: Record<string, unknown> | null;
          mixpanel_status?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      daily_ad_insights: {
        Row: {
          id: string;
          date: string;
          account_id: string;
          account_name: string | null;
          campaign_id: string | null;
          campaign_name: string | null;
          adset_id: string | null;
          adset_name: string | null;
          ad_id: string | null;
          ad_name: string | null;
          roas: number;
          spend: number;
          impressions: number;
          clicks: number;
          purchases: number;
          purchase_value: number;
          ctr: number;
          collected_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          account_id: string;
          [key: string]: unknown;
        };
        Update: {
          [key: string]: unknown;
        };
        Relationships: [];
      };
      daily_lp_metrics: {
        Row: {
          id: string;
          date: string;
          account_id: string;
          project_name: string | null;
          total_users: number;
          bounce_1s_rate: number;
          bounce_10s_rate: number;
          avg_time_on_page: number;
          collected_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          account_id: string;
          [key: string]: unknown;
        };
        Update: {
          [key: string]: unknown;
        };
        Relationships: [];
      };
      benchmarks: {
        Row: {
          id: string;
          date: string;
          period: string;
          metric_name: string;
          p50: number | null;
          p75: number | null;
          p90: number | null;
          avg_value: number | null;
          sample_size: number | null;
          calculated_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          metric_name: string;
          [key: string]: unknown;
        };
        Update: {
          [key: string]: unknown;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string | null;
          company_name: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          [key: string]: unknown;
        };
        Update: {
          [key: string]: unknown;
        };
        Relationships: [];
      };
      progress: {
        Row: {
          id: number;
          completed: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: number;
          completed?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: number;
          completed?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      email_sends: {
        Row: {
          id: string;
          recipient_email: string;
          recipient_type: string;
          subject: string;
          template: string | null;
          status: string;
          sent_at: string | null;
          opened_at: string | null;
          clicked_at: string | null;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipient_email: string;
          recipient_type: string;
          subject: string;
          template?: string | null;
          status?: string;
          sent_at?: string | null;
          opened_at?: string | null;
          clicked_at?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          recipient_email?: string;
          recipient_type?: string;
          subject?: string;
          template?: string | null;
          status?: string;
          sent_at?: string | null;
          opened_at?: string | null;
          clicked_at?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      student_registry: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string | null;
          shop_name: string | null;
          shop_url: string | null;
          cohort: string | null;
          registered_at: string | null;
          matched_profile_id: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          [key: string]: unknown;
        };
        Update: {
          [key: string]: unknown;
        };
        Relationships: [];
      };
      contents: {
        Row: {
          id: string;
          title: string;
          body_md: string;
          summary: string | null;
          thumbnail_url: string | null;
          category: string;
          tags: string[];
          status: string;
          source_type: string | null;
          source_ref: string | null;
          source_hash: string | null;
          author_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          body_md: string;
          summary?: string | null;
          thumbnail_url?: string | null;
          category?: string;
          tags?: string[];
          status?: string;
          source_type?: string | null;
          source_ref?: string | null;
          source_hash?: string | null;
          author_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          body_md?: string;
          summary?: string | null;
          thumbnail_url?: string | null;
          category?: string;
          tags?: string[];
          status?: string;
          source_type?: string | null;
          source_ref?: string | null;
          source_hash?: string | null;
          author_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      distributions: {
        Row: {
          id: string;
          content_id: string;
          channel: string;
          channel_ref: string | null;
          rendered_title: string | null;
          rendered_body: string | null;
          status: string;
          distributed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          content_id: string;
          channel: string;
          channel_ref?: string | null;
          rendered_title?: string | null;
          rendered_body?: string | null;
          status?: string;
          distributed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          content_id?: string;
          channel?: string;
          channel_ref?: string | null;
          rendered_title?: string | null;
          rendered_body?: string | null;
          status?: string;
          distributed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "distributions_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "contents";
            referencedColumns: ["id"];
          },
        ];
      };
      email_logs: {
        Row: {
          id: string;
          content_id: string | null;
          subject: string;
          template: string;
          html_body: string;
          recipient_count: number;
          status: string;
          sent_at: string | null;
          created_at: string;
          attachments: Json;
        };
        Insert: {
          id?: string;
          content_id?: string | null;
          subject: string;
          template?: string;
          html_body: string;
          recipient_count?: number;
          status?: string;
          sent_at?: string | null;
          created_at?: string;
          attachments?: Json;
        };
        Update: {
          id?: string;
          content_id?: string | null;
          subject?: string;
          template?: string;
          html_body?: string;
          recipient_count?: number;
          status?: string;
          sent_at?: string | null;
          created_at?: string;
          attachments?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "email_logs_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "contents";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
