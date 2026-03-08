-- 경쟁사 분석기 v2: competitor_monitors 테이블 컬럼 추가
-- 기존 데이터 안전: 모든 신규 컬럼에 DEFAULT 값 설정
-- 기존 RLS 정책 유지 (변경 없음)

-- 브랜드 프로필 URL (Facebook 페이지 프로필 이미지)
ALTER TABLE competitor_monitors
  ADD COLUMN IF NOT EXISTS page_profile_url TEXT;

-- 인스타그램 사용자명
ALTER TABLE competitor_monitors
  ADD COLUMN IF NOT EXISTS ig_username TEXT;

-- 브랜드 카테고리
ALTER TABLE competitor_monitors
  ADD COLUMN IF NOT EXISTS category TEXT;

-- 신규 광고 수 (마지막 체크 이후)
ALTER TABLE competitor_monitors
  ADD COLUMN IF NOT EXISTS new_ads_count INTEGER DEFAULT 0;

-- 최신 광고 날짜
ALTER TABLE competitor_monitors
  ADD COLUMN IF NOT EXISTS latest_ad_date TIMESTAMPTZ;

-- 전체 광고 수
ALTER TABLE competitor_monitors
  ADD COLUMN IF NOT EXISTS total_ads_count INTEGER DEFAULT 0;

-- 참고: last_checked_at은 20260306_competitor_analyzer.sql에서 이미 생성됨
