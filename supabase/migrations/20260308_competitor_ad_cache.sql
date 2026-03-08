-- competitor_ad_cache: SearchAPI.io 검색 결과 캐시
-- 미디어 URL 만료 관리 + 중복 API 호출 방지

CREATE TABLE IF NOT EXISTS competitor_ad_cache (
  ad_archive_id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  ad_text TEXT,
  ad_title TEXT,
  image_url TEXT,
  video_url TEXT,
  video_preview_url TEXT,
  display_format TEXT DEFAULT 'UNKNOWN',
  link_url TEXT,
  start_date TEXT,
  end_date TEXT,
  is_active BOOLEAN DEFAULT true,
  platforms JSONB DEFAULT '[]'::jsonb,
  snapshot_url TEXT,
  carousel_cards JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_ad_cache_page_id ON competitor_ad_cache(page_id);
CREATE INDEX IF NOT EXISTS idx_ad_cache_expires_at ON competitor_ad_cache(expires_at);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_competitor_ad_cache_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_competitor_ad_cache_updated_at
  BEFORE UPDATE ON competitor_ad_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_competitor_ad_cache_updated_at();

-- RLS: 서비스 클라이언트로 쓰기, 인증 사용자 읽기
ALTER TABLE competitor_ad_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ad cache"
  ON competitor_ad_cache FOR SELECT
  TO authenticated
  USING (true);
