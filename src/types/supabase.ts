export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      _backup_contents_category: {
        Row: {
          category: string | null
          id: string | null
        }
        Insert: {
          category?: string | null
          id?: string | null
        }
        Update: {
          category?: string | null
          id?: string | null
        }
        Relationships: []
      }
      _backup_posts: {
        Row: {
          author_id: string | null
          category: string | null
          content: string | null
          content_id: string | null
          created_at: string | null
          id: string | null
          is_pinned: boolean | null
          is_published: boolean | null
          like_count: number | null
          published_at: string | null
          title: string | null
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          content?: string | null
          content_id?: string | null
          created_at?: string | null
          id?: string | null
          is_pinned?: boolean | null
          is_published?: boolean | null
          like_count?: number | null
          published_at?: string | null
          title?: string | null
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          author_id?: string | null
          category?: string | null
          content?: string | null
          content_id?: string | null
          created_at?: string | null
          id?: string | null
          is_pinned?: boolean | null
          is_published?: boolean | null
          like_count?: number | null
          published_at?: string | null
          title?: string | null
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      ad_accounts: {
        Row: {
          account_id: string
          account_name: string | null
          active: boolean | null
          created_at: string | null
          id: string
          meta_status: Json | null
          mixpanel_board_id: string | null
          mixpanel_project_id: string | null
          mixpanel_status: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          account_id: string
          account_name?: string | null
          active?: boolean | null
          created_at?: string | null
          id?: string
          meta_status?: Json | null
          mixpanel_board_id?: string | null
          mixpanel_project_id?: string | null
          mixpanel_status?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          account_id?: string
          account_name?: string | null
          active?: boolean | null
          created_at?: string | null
          id?: string
          meta_status?: Json | null
          mixpanel_board_id?: string | null
          mixpanel_project_id?: string | null
          mixpanel_status?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      answers: {
        Row: {
          approved_at: string | null
          author_id: string | null
          content: string
          created_at: string | null
          id: string
          is_ai: boolean | null
          is_approved: boolean | null
          like_count: number | null
          question_id: string
          source_refs: Json | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          author_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          is_ai?: boolean | null
          is_approved?: boolean | null
          like_count?: number | null
          question_id: string
          source_refs?: Json | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          author_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          is_ai?: boolean | null
          is_approved?: boolean | null
          like_count?: number | null
          question_id?: string
          source_refs?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answers_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          cohort_id: string | null
          due_date: string | null
          id: string
          name: string
          notion_link: string | null
          sort_order: number | null
          title: string | null
          week_number: number | null
        }
        Insert: {
          cohort_id?: string | null
          due_date?: string | null
          id?: string
          name: string
          notion_link?: string | null
          sort_order?: number | null
          title?: string | null
          week_number?: number | null
        }
        Update: {
          cohort_id?: string | null
          due_date?: string | null
          id?: string
          name?: string
          notion_link?: string | null
          sort_order?: number | null
          title?: string | null
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmarks: {
        Row: {
          avg_value: number | null
          calculated_at: string | null
          date: string
          id: string
          metric_name: string
          p10: number | null
          p25: number | null
          p50: number | null
          p75: number | null
          p90: number | null
          period: string | null
          sample_size: number | null
        }
        Insert: {
          avg_value?: number | null
          calculated_at?: string | null
          date: string
          id?: string
          metric_name: string
          p10?: number | null
          p25?: number | null
          p50?: number | null
          p75?: number | null
          p90?: number | null
          period?: string | null
          sample_size?: number | null
        }
        Update: {
          avg_value?: number | null
          calculated_at?: string | null
          date?: string
          id?: string
          metric_name?: string
          p10?: number | null
          p25?: number | null
          p50?: number | null
          p75?: number | null
          p90?: number | null
          period?: string | null
          sample_size?: number | null
        }
        Relationships: []
      }
      blocks: {
        Row: {
          assets: Json | null
          category_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          name: string
          parent_id: string | null
          sort_order: number | null
          time_minutes: number | null
          type: string | null
        }
        Insert: {
          assets?: Json | null
          category_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number | null
          time_minutes?: number | null
          type?: string | null
        }
        Update: {
          assets?: Json | null
          category_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number | null
          time_minutes?: number | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          icon: string | null
          id: string
          is_new: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          icon?: string | null
          id?: string
          is_new?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          icon?: string | null
          id?: string
          is_new?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      cohorts: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          short_name: string
          start_date: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          short_name: string
          start_date?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          short_name?: string
          start_date?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          id: string
          question_id: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          id?: string
          question_id?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          id?: string
          question_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      content_sources: {
        Row: {
          config: Json | null
          crawl_frequency: string | null
          created_at: string | null
          feed_type: string
          id: string
          is_active: boolean | null
          last_crawled_at: string | null
          name: string
          updated_at: string | null
          url: string
        }
        Insert: {
          config?: Json | null
          crawl_frequency?: string | null
          created_at?: string | null
          feed_type?: string
          id?: string
          is_active?: boolean | null
          last_crawled_at?: string | null
          name: string
          updated_at?: string | null
          url: string
        }
        Update: {
          config?: Json | null
          crawl_frequency?: string | null
          created_at?: string | null
          feed_type?: string
          id?: string
          is_active?: boolean | null
          last_crawled_at?: string | null
          name?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: []
      }
      contents: {
        Row: {
          ai_source: string | null
          author_id: string | null
          body_md: string
          category: string
          created_at: string | null
          email_cta_text: string | null
          email_cta_url: string | null
          email_design_json: Json | null
          email_html: string | null
          email_sent_at: string | null
          email_subject: string | null
          email_summary: string | null
          id: string
          images: Json | null
          is_pinned: boolean | null
          like_count: number | null
          published_at: string | null
          source_hash: string | null
          source_ref: string | null
          source_type: string | null
          source_url: string | null
          status: string
          summary: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          type: string | null
          updated_at: string | null
          video_url: string | null
          view_count: number | null
        }
        Insert: {
          ai_source?: string | null
          author_id?: string | null
          body_md: string
          category?: string
          created_at?: string | null
          email_cta_text?: string | null
          email_cta_url?: string | null
          email_design_json?: Json | null
          email_html?: string | null
          email_sent_at?: string | null
          email_subject?: string | null
          email_summary?: string | null
          id?: string
          images?: Json | null
          is_pinned?: boolean | null
          like_count?: number | null
          published_at?: string | null
          source_hash?: string | null
          source_ref?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: string
          summary?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          type?: string | null
          updated_at?: string | null
          video_url?: string | null
          view_count?: number | null
        }
        Update: {
          ai_source?: string | null
          author_id?: string | null
          body_md?: string
          category?: string
          created_at?: string | null
          email_cta_text?: string | null
          email_cta_url?: string | null
          email_design_json?: Json | null
          email_html?: string | null
          email_sent_at?: string | null
          email_subject?: string | null
          email_summary?: string | null
          id?: string
          images?: Json | null
          is_pinned?: boolean | null
          like_count?: number | null
          published_at?: string | null
          source_hash?: string | null
          source_ref?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: string
          summary?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          type?: string | null
          updated_at?: string | null
          video_url?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contents_author_id_profiles_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum: {
        Row: {
          block_id: string | null
          cohort_id: string | null
          id: string
          parent_id: string | null
          sort_order: number | null
          week_number: number
        }
        Insert: {
          block_id?: string | null
          cohort_id?: string | null
          id?: string
          parent_id?: string | null
          sort_order?: number | null
          week_number: number
        }
        Update: {
          block_id?: string | null
          cohort_id?: string | null
          id?: string
          parent_id?: string | null
          sort_order?: number | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "curriculum"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_ad_insights: {
        Row: {
          account_id: string
          account_name: string | null
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          cart_to_purchase_rate: number | null
          checkout_to_purchase_rate: number | null
          click_to_cart_rate: number | null
          click_to_checkout_rate: number | null
          click_to_purchase_rate: number | null
          clicks: number | null
          collected_at: string | null
          comments_per_10k: number | null
          conversion_ranking: string | null
          creative_type: string | null
          ctr: number | null
          date: string
          engagement_per_10k: number | null
          engagement_ranking: string | null
          id: string
          impressions: number | null
          purchase_value: number | null
          purchases: number | null
          quality_ranking: string | null
          reach: number | null
          reactions_per_10k: number | null
          retention_rate: number | null
          roas: number | null
          shares_per_10k: number | null
          spend: number | null
          thruplay_rate: number | null
          video_p3s_rate: number | null
        }
        Insert: {
          account_id: string
          account_name?: string | null
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          cart_to_purchase_rate?: number | null
          checkout_to_purchase_rate?: number | null
          click_to_cart_rate?: number | null
          click_to_checkout_rate?: number | null
          click_to_purchase_rate?: number | null
          clicks?: number | null
          collected_at?: string | null
          comments_per_10k?: number | null
          conversion_ranking?: string | null
          creative_type?: string | null
          ctr?: number | null
          date: string
          engagement_per_10k?: number | null
          engagement_ranking?: string | null
          id?: string
          impressions?: number | null
          purchase_value?: number | null
          purchases?: number | null
          quality_ranking?: string | null
          reach?: number | null
          reactions_per_10k?: number | null
          retention_rate?: number | null
          roas?: number | null
          shares_per_10k?: number | null
          spend?: number | null
          thruplay_rate?: number | null
          video_p3s_rate?: number | null
        }
        Update: {
          account_id?: string
          account_name?: string | null
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          cart_to_purchase_rate?: number | null
          checkout_to_purchase_rate?: number | null
          click_to_cart_rate?: number | null
          click_to_checkout_rate?: number | null
          click_to_purchase_rate?: number | null
          clicks?: number | null
          collected_at?: string | null
          comments_per_10k?: number | null
          conversion_ranking?: string | null
          creative_type?: string | null
          ctr?: number | null
          date?: string
          engagement_per_10k?: number | null
          engagement_ranking?: string | null
          id?: string
          impressions?: number | null
          purchase_value?: number | null
          purchases?: number | null
          quality_ranking?: string | null
          reach?: number | null
          reactions_per_10k?: number | null
          retention_rate?: number | null
          roas?: number | null
          shares_per_10k?: number | null
          spend?: number | null
          thruplay_rate?: number | null
          video_p3s_rate?: number | null
        }
        Relationships: []
      }
      daily_lp_metrics: {
        Row: {
          account_id: string
          avg_time_on_page: number | null
          bounce_10s_rate: number | null
          bounce_1s_rate: number | null
          cart_users: number | null
          checkout_users: number | null
          collected_at: string | null
          date: string
          id: string
          lp_checkout_to_purchase: number | null
          lp_session_to_cart: number | null
          lp_session_to_checkout: number | null
          lp_session_to_purchase: number | null
          project_name: string | null
          purchase_users: number | null
          review_click_rate: number | null
          scroll_25_rate: number | null
          scroll_50_rate: number | null
          scroll_75_rate: number | null
          total_button_clicks: number | null
          total_users: number | null
        }
        Insert: {
          account_id: string
          avg_time_on_page?: number | null
          bounce_10s_rate?: number | null
          bounce_1s_rate?: number | null
          cart_users?: number | null
          checkout_users?: number | null
          collected_at?: string | null
          date: string
          id?: string
          lp_checkout_to_purchase?: number | null
          lp_session_to_cart?: number | null
          lp_session_to_checkout?: number | null
          lp_session_to_purchase?: number | null
          project_name?: string | null
          purchase_users?: number | null
          review_click_rate?: number | null
          scroll_25_rate?: number | null
          scroll_50_rate?: number | null
          scroll_75_rate?: number | null
          total_button_clicks?: number | null
          total_users?: number | null
        }
        Update: {
          account_id?: string
          avg_time_on_page?: number | null
          bounce_10s_rate?: number | null
          bounce_1s_rate?: number | null
          cart_users?: number | null
          checkout_users?: number | null
          collected_at?: string | null
          date?: string
          id?: string
          lp_checkout_to_purchase?: number | null
          lp_session_to_cart?: number | null
          lp_session_to_checkout?: number | null
          lp_session_to_purchase?: number | null
          project_name?: string | null
          purchase_users?: number | null
          review_click_rate?: number | null
          scroll_25_rate?: number | null
          scroll_50_rate?: number | null
          scroll_75_rate?: number | null
          total_button_clicks?: number | null
          total_users?: number | null
        }
        Relationships: []
      }
      distributions: {
        Row: {
          channel: string
          channel_ref: string | null
          content_id: string | null
          created_at: string | null
          distributed_at: string | null
          id: string
          rendered_body: string | null
          rendered_title: string | null
          status: string
        }
        Insert: {
          channel: string
          channel_ref?: string | null
          content_id?: string | null
          created_at?: string | null
          distributed_at?: string | null
          id?: string
          rendered_body?: string | null
          rendered_title?: string | null
          status?: string
        }
        Update: {
          channel?: string
          channel_ref?: string | null
          content_id?: string | null
          created_at?: string | null
          distributed_at?: string | null
          id?: string
          rendered_body?: string | null
          rendered_title?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributions_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          attachments: Json | null
          content_id: string | null
          created_at: string | null
          html_body: string
          id: string
          recipient_count: number | null
          sent_at: string | null
          status: string
          subject: string
          template: string
        }
        Insert: {
          attachments?: Json | null
          content_id?: string | null
          created_at?: string | null
          html_body: string
          id?: string
          recipient_count?: number | null
          sent_at?: string | null
          status?: string
          subject: string
          template?: string
        }
        Update: {
          attachments?: Json | null
          content_id?: string | null
          created_at?: string | null
          html_body?: string
          id?: string
          recipient_count?: number | null
          sent_at?: string | null
          status?: string
          subject?: string
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sends: {
        Row: {
          clicked_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          opened_at: string | null
          recipient_email: string
          recipient_type: string | null
          sent_at: string | null
          status: string | null
          subject: string
          template: string | null
        }
        Insert: {
          clicked_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          recipient_email: string
          recipient_type?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
          template?: string | null
        }
        Update: {
          clicked_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          recipient_email?: string
          recipient_type?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          template?: string | null
        }
        Relationships: []
      }
      invite_codes: {
        Row: {
          code: string
          cohort: string | null
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          max_uses: number | null
          used_count: number | null
        }
        Insert: {
          code: string
          cohort?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          used_count?: number | null
        }
        Update: {
          code?: string
          cohort?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          used_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_usage: {
        Row: {
          consumer_type: string
          content_id: string | null
          created_at: string
          duration_ms: number | null
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          question_id: string | null
          source_types: string[] | null
          total_tokens: number
        }
        Insert: {
          consumer_type: string
          content_id?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          question_id?: string | null
          source_types?: string[] | null
          total_tokens?: number
        }
        Update: {
          consumer_type?: string
          content_id?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          question_id?: string | null
          source_types?: string[] | null
          total_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_usage_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_usage_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company_name: string | null
          consultation_date: string | null
          consultation_notes: string | null
          contract_plan: string | null
          converted_user_id: string | null
          created_at: string | null
          email: string
          email_opted_out: boolean | null
          id: string
          meeting_done: boolean | null
          name: string
          phone: string | null
          shop_url: string | null
          source: Database["public"]["Enums"]["lead_source"] | null
          status: Database["public"]["Enums"]["lead_status"] | null
          tags: string[] | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          company_name?: string | null
          consultation_date?: string | null
          consultation_notes?: string | null
          contract_plan?: string | null
          converted_user_id?: string | null
          created_at?: string | null
          email: string
          email_opted_out?: boolean | null
          id?: string
          meeting_done?: boolean | null
          name: string
          phone?: string | null
          shop_url?: string | null
          source?: Database["public"]["Enums"]["lead_source"] | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          tags?: string[] | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          company_name?: string | null
          consultation_date?: string | null
          consultation_notes?: string | null
          contract_plan?: string | null
          converted_user_id?: string | null
          created_at?: string | null
          email?: string
          email_opted_out?: boolean | null
          id?: string
          meeting_done?: boolean | null
          name?: string
          phone?: string | null
          shop_url?: string | null
          source?: Database["public"]["Enums"]["lead_source"] | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          tags?: string[] | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_user_id_fkey"
            columns: ["converted_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lecture_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          lecture_name: string
          metadata: Json
          source_type: string
          week: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          lecture_name: string
          metadata?: Json
          source_type?: string
          week: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          lecture_name?: string
          metadata?: Json
          source_type?: string
          week?: string
        }
        Relationships: []
      }
      likes: {
        Row: {
          answer_id: string | null
          created_at: string | null
          id: string
          question_id: string | null
          user_id: string
        }
        Insert: {
          answer_id?: string | null
          created_at?: string | null
          id?: string
          question_id?: string | null
          user_id: string
        }
        Update: {
          answer_id?: string | null
          created_at?: string | null
          id?: string
          question_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          email_enabled: boolean | null
          id: string
          notify_answer: boolean | null
          notify_new_post: boolean | null
          notify_notice: boolean | null
          slack_webhook_url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          notify_answer?: boolean | null
          notify_new_post?: boolean | null
          notify_notice?: boolean | null
          slack_webhook_url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          notify_answer?: boolean | null
          notify_new_post?: boolean | null
          notify_notice?: boolean | null
          slack_webhook_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          business_cert_url: string | null
          business_number: string
          category: string | null
          cohort: string | null
          created_at: string | null
          email: string
          id: string
          meta_account_id: string | null
          mixpanel_board_id: string | null
          mixpanel_project_id: string | null
          monthly_ad_budget: string | null
          name: string
          onboarding_completed: boolean | null
          onboarding_step: number | null
          phone: string
          reject_reason: string | null
          role: Database["public"]["Enums"]["user_role"]
          role_old: string | null
          shop_name: string
          shop_url: string
          updated_at: string | null
        }
        Insert: {
          business_cert_url?: string | null
          business_number: string
          category?: string | null
          cohort?: string | null
          created_at?: string | null
          email: string
          id: string
          meta_account_id?: string | null
          mixpanel_board_id?: string | null
          mixpanel_project_id?: string | null
          monthly_ad_budget?: string | null
          name: string
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          phone: string
          reject_reason?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          role_old?: string | null
          shop_name: string
          shop_url: string
          updated_at?: string | null
        }
        Update: {
          business_cert_url?: string | null
          business_number?: string
          category?: string | null
          cohort?: string | null
          created_at?: string | null
          email?: string
          id?: string
          meta_account_id?: string | null
          mixpanel_board_id?: string | null
          mixpanel_project_id?: string | null
          monthly_ad_budget?: string | null
          name?: string
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          phone?: string
          reject_reason?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          role_old?: string | null
          shop_name?: string
          shop_url?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      progress: {
        Row: {
          completed: string | null
          id: number
          updated_at: string | null
        }
        Insert: {
          completed?: string | null
          id: number
          updated_at?: string | null
        }
        Update: {
          completed?: string | null
          id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      qa_categories: {
        Row: {
          description: string | null
          id: number
          name: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          description?: string | null
          id?: number
          name: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          description?: string | null
          id?: number
          name?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      questions: {
        Row: {
          author_id: string
          category_id: number | null
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          image_urls: Json | null
          like_count: number | null
          status: string | null
          title: string
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          author_id: string
          category_id?: number | null
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          image_urls?: Json | null
          like_count?: number | null
          status?: string | null
          title: string
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          author_id?: string
          category_id?: number | null
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          image_urls?: Json | null
          like_count?: number | null
          status?: string | null
          title?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "qa_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          cohort_id: string | null
          date: string | null
          end_time: string | null
          id: string
          location: string | null
          start_time: string | null
          type: string | null
          week_number: number
        }
        Insert: {
          cohort_id?: string | null
          date?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          start_time?: string | null
          type?: string | null
          week_number: number
        }
        Update: {
          cohort_id?: string | null
          date?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          start_time?: string | null
          type?: string | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedules_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      service_secrets: {
        Row: {
          created_at: string | null
          id: string
          key_name: string
          key_value: string
          service: Database["public"]["Enums"]["service_type"]
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key_name: string
          key_value: string
          service: Database["public"]["Enums"]["service_type"]
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key_name?: string
          key_value?: string
          service?: Database["public"]["Enums"]["service_type"]
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_secrets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      structure_comments: {
        Row: {
          author: string | null
          content: string
          created_at: string | null
          id: string
          section_id: string
        }
        Insert: {
          author?: string | null
          content: string
          created_at?: string | null
          id?: string
          section_id: string
        }
        Update: {
          author?: string | null
          content?: string
          created_at?: string | null
          id?: string
          section_id?: string
        }
        Relationships: []
      }
      student_registry: {
        Row: {
          cohort: string | null
          email: string | null
          id: string
          matched_profile_id: string | null
          name: string
          phone: string | null
          registered_at: string | null
          shop_name: string | null
          shop_url: string | null
        }
        Insert: {
          cohort?: string | null
          email?: string | null
          id?: string
          matched_profile_id?: string | null
          name: string
          phone?: string | null
          registered_at?: string | null
          shop_name?: string | null
          shop_url?: string | null
        }
        Update: {
          cohort?: string | null
          email?: string | null
          id?: string
          matched_profile_id?: string | null
          name?: string
          phone?: string | null
          registered_at?: string | null
          shop_name?: string | null
          shop_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_registry_matched_profile_id_fkey"
            columns: ["matched_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      dblink: { Args: { "": string }; Returns: Record<string, unknown>[] }
      dblink_cancel_query: { Args: { "": string }; Returns: string }
      dblink_close: { Args: { "": string }; Returns: string }
      dblink_connect: { Args: { "": string }; Returns: string }
      dblink_connect_u: { Args: { "": string }; Returns: string }
      dblink_current_query: { Args: never; Returns: string }
      dblink_disconnect:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      dblink_error_message: { Args: { "": string }; Returns: string }
      dblink_exec: { Args: { "": string }; Returns: string }
      dblink_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      dblink_get_connections: { Args: never; Returns: string[] }
      dblink_get_notify:
        | { Args: { conname: string }; Returns: Record<string, unknown>[] }
        | { Args: never; Returns: Record<string, unknown>[] }
      dblink_get_pkey: {
        Args: { "": string }
        Returns: Database["public"]["CompositeTypes"]["dblink_pkey_results"][]
        SetofOptions: {
          from: "*"
          to: "dblink_pkey_results"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dblink_get_result: {
        Args: { "": string }
        Returns: Record<string, unknown>[]
      }
      dblink_is_busy: { Args: { "": string }; Returns: number }
      debug_log_autonomous: { Args: { p_msg: string }; Returns: undefined }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_admin: { Args: never; Returns: boolean }
      is_member_or_above: { Args: never; Returns: boolean }
      is_student_or_above: { Args: never; Returns: boolean }
      match_lecture_chunks:
        | {
            Args: {
              match_count?: number
              match_threshold?: number
              query_embedding: string
            }
            Returns: {
              chunk_index: number
              content: string
              id: string
              lecture_name: string
              similarity: number
              week: string
            }[]
          }
        | {
            Args: {
              filter_source_types?: string[]
              match_count?: number
              match_threshold?: number
              query_embedding: string
            }
            Returns: {
              chunk_index: number
              content: string
              id: string
              lecture_name: string
              metadata: Json
              similarity: number
              source_type: string
              week: string
            }[]
          }
      search_lecture_chunks: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          chunk_index: number
          content: string
          id: string
          similarity: number
          source_file: string
        }[]
      }
    }
    Enums: {
      lead_source:
        | "webinar"
        | "organic"
        | "referral"
        | "ad"
        | "newsletter"
        | "other"
        | "gsheet_sync"
      lead_status:
        | "new"
        | "contacted"
        | "meeting_scheduled"
        | "meeting_done"
        | "converted"
        | "lost"
      service_type: "mixpanel" | "cafe24" | "meta" | "google_ads" | "other"
      user_role: "lead" | "member" | "student" | "alumni" | "admin"
    }
    CompositeTypes: {
      dblink_pkey_results: {
        position: number | null
        colname: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      lead_source: [
        "webinar",
        "organic",
        "referral",
        "ad",
        "newsletter",
        "other",
        "gsheet_sync",
      ],
      lead_status: [
        "new",
        "contacted",
        "meeting_scheduled",
        "meeting_done",
        "converted",
        "lost",
      ],
      service_type: ["mixpanel", "cafe24", "meta", "google_ads", "other"],
      user_role: ["lead", "member", "student", "alumni", "admin"],
    },
  },
} as const
