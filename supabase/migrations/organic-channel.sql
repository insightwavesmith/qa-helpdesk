-- 오가닉 채널 관리 테이블 (Phase 1)
-- 실행 전 주의: Supabase Dashboard > SQL Editor 에서 수동 실행

-- 1. 발행 콘텐츠 (전 채널)
CREATE TABLE organic_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text,
  channel text NOT NULL CHECK (channel IN ('naver_blog', 'naver_cafe', 'youtube', 'instagram', 'tiktok')),
  keywords text[] DEFAULT '{}',
  level text CHECK (level IN ('L1', 'L2', 'L3', 'L4', 'L5')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'review', 'published', 'archived')),
  external_url text,
  external_id text,
  parent_post_id uuid REFERENCES organic_posts(id),
  seo_score integer,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. 일별 성과
CREATE TABLE organic_analytics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES organic_posts(id) ON DELETE CASCADE,
  date date NOT NULL,
  views integer DEFAULT 0,
  unique_visitors integer DEFAULT 0,
  reach integer DEFAULT 0,
  engagement_rate numeric(5,2),
  saves integer DEFAULT 0,
  shares integer DEFAULT 0,
  comments integer DEFAULT 0,
  avg_duration integer,
  conversions integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, date)
);

-- 3. 키워드 검색량 히스토리
CREATE TABLE keyword_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword text NOT NULL,
  channel text DEFAULT 'naver_blog',
  pc_search integer,
  mobile_search integer,
  total_search integer,
  competition text,
  ctr_pc numeric(5,2),
  ctr_mobile numeric(5,2),
  fetched_at timestamptz DEFAULT now()
);

-- 4. 순위 추적
CREATE TABLE keyword_rankings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword text NOT NULL,
  post_id uuid REFERENCES organic_posts(id) ON DELETE CASCADE,
  channel text DEFAULT 'naver_blog',
  rank integer,
  search_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(keyword, post_id, search_date)
);

-- 5. SEO 벤치마크
CREATE TABLE seo_benchmarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword text NOT NULL,
  rank integer,
  blog_name text,
  char_count integer,
  image_count integer,
  keyword_repeat integer,
  format_elements jsonb DEFAULT '{}',
  analyzed_at timestamptz DEFAULT now()
);

-- 6. 전환 이벤트
CREATE TABLE organic_conversions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES organic_posts(id) ON DELETE CASCADE,
  channel text NOT NULL,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  event_type text NOT NULL CHECK (event_type IN ('click', 'landing', 'signup')),
  created_at timestamptz DEFAULT now()
);

-- RLS 활성화
ALTER TABLE organic_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE organic_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE organic_conversions ENABLE ROW LEVEL SECURITY;

-- 관리자만 접근 (admin role)
CREATE POLICY "admin_only" ON organic_posts FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_only" ON organic_analytics FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_only" ON keyword_stats FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_only" ON keyword_rankings FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_only" ON seo_benchmarks FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_only" ON organic_conversions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
