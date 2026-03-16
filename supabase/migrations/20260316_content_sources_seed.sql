-- 20260316: content_sources 초기 데이터 + feed_type 제약조건 수정
-- YouTube 피드 타입 추가 + 12개 소스 INSERT

-- ============================================
-- 1. feed_type 제약조건 수정 (youtube 추가)
-- ============================================
ALTER TABLE content_sources DROP CONSTRAINT IF EXISTS content_sources_feed_type_check;
ALTER TABLE content_sources ADD CONSTRAINT content_sources_feed_type_check
  CHECK (feed_type IN ('rss', 'html', 'api', 'youtube'));

-- ============================================
-- 2. 블로그/뉴스 소스 6개 INSERT
-- ============================================
INSERT INTO content_sources (name, url, feed_type, is_active, crawl_frequency, config) VALUES
  ('모비인사이드', 'https://www.mobiinside.co.kr/feed/', 'rss', true, 'daily', '{"category": "마케팅 뉴스"}'),
  ('Jon Loomer Blog', 'https://www.jonloomer.com/feed/', 'rss', true, 'daily', '{"category": "Meta 광고"}'),
  ('CXL Blog', 'https://cxl.com/blog/feed/', 'rss', true, 'daily', '{"category": "CRO/마케팅"}'),
  ('Shopify Blog', 'https://www.shopify.com/blog/feed', 'rss', true, 'daily', '{"category": "이커머스"}'),
  ('Neil Patel Blog', 'https://neilpatel.com/blog/feed/', 'rss', true, 'daily', '{"category": "SEO/마케팅"}'),
  ('AdEspresso Blog', 'https://adespresso.com/blog/feed/', 'rss', true, 'daily', '{"category": "Meta 광고"}')
ON CONFLICT (url) DO NOTHING;

-- ============================================
-- 3. 유튜브 채널 6개 INSERT
-- ============================================
INSERT INTO content_sources (name, url, feed_type, is_active, crawl_frequency, config) VALUES
  ('Sam Piliero', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCwB4WGJqYfMCBfwfDWFbpNw', 'youtube', true, 'daily', '{"channelId": "UCwB4WGJqYfMCBfwfDWFbpNw", "handle": "@SamPiliero"}'),
  ('CTtheDisrupter', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCpJoTCn1-OWRqkJfz6aXhMw', 'youtube', true, 'daily', '{"channelId": "UCpJoTCn1-OWRqkJfz6aXhMw", "handle": "@CTtheDisrupter"}'),
  ('Nick Theriot', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCh4clkjMSsGRfTMwZn5VK4g', 'youtube', true, 'daily', '{"channelId": "UCh4clkjMSsGRfTMwZn5VK4g", "handle": "@NickTheriot"}'),
  ('Ben Heath', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCGeO5CjDmGqveWxaoJ-mgNg', 'youtube', true, 'daily', '{"channelId": "UCGeO5CjDmGqveWxaoJ-mgNg", "handle": "@BenHeath"}'),
  ('Jon Loomer YouTube', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCz1r7VyETV5ZDd0YYhz9GGg', 'youtube', true, 'daily', '{"channelId": "UCz1r7VyETV5ZDd0YYhz9GGg", "handle": "@jonloomer"}'),
  ('Dara Denney', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCo_sEaGUAPhOmjNDvuk1e_g', 'youtube', true, 'daily', '{"channelId": "UCo_sEaGUAPhOmjNDvuk1e_g", "handle": "@DaraDenney"}')
ON CONFLICT (url) DO NOTHING;

-- ============================================
-- 4. service_role용 RLS 정책 (크론에서 접근 가능하도록)
-- ============================================
-- service_role은 RLS를 bypass하므로 추가 정책 불필요
-- 기존 admin 정책 유지
